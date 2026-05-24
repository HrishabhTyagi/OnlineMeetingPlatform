using System.Security.Claims;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;
using NotificationService.Hubs;

namespace NotificationService.Tests;

public class NotificationHubTests
{
    [Fact]
    public async Task JoinUserNotifications_allows_only_signed_in_user_group()
    {
        var clients = new RecordingHubClients();
        var groups = new RecordingGroupManager();
        var hub = CreateHub("user-1", clients, groups);

        await hub.JoinUserNotifications("user-1");
        await Assert.ThrowsAsync<HubException>(() => hub.JoinUserNotifications("user-2"));

        Assert.Contains(groups.AddedGroups, item => item == ("connection-1", "user_user-1"));
    }

    [Fact]
    public async Task SendIncomingCall_validates_caller_and_rings_distinct_recipients()
    {
        var clients = new RecordingHubClients();
        var hub = CreateHub("caller-1", clients, new RecordingGroupManager());

        await Assert.ThrowsAsync<HubException>(() => hub.SendIncomingCall(
            "chat-1",
            "meeting-1",
            "someone-else",
            "Caller",
            "video",
            "http://localhost:5173/meeting/meeting-1",
            new List<string> { "recipient-1" }));

        await Assert.ThrowsAsync<HubException>(() => hub.SendIncomingCall(
            "chat-1",
            "meeting-1",
            "caller-1",
            "Caller",
            "video",
            "http://localhost:5173/meeting/meeting-1",
            new List<string> { "caller-1", " " }));

        await hub.SendIncomingCall(
            "chat-1",
            "meeting-1",
            "caller-1",
            "Caller",
            "VIDEO",
            "http://localhost:5173/meeting/meeting-1",
            new List<string> { "recipient-1", "recipient-1", "recipient-2", "caller-1" },
            "call-1");

        Assert.Single(clients.GroupProxies["user_recipient-1"].Sent);
        Assert.Single(clients.GroupProxies["user_recipient-2"].Sent);
        Assert.Equal("IncomingCall", clients.GroupProxies["user_recipient-1"].Sent[0].Method);
        Assert.Equal("video", ReadPayloadValue(clients.GroupProxies["user_recipient-1"].Sent[0].Args[0], "CallType"));
        Assert.False(clients.GroupProxies.ContainsKey("user_caller-1"));
    }

    [Fact]
    public async Task SendIncomingCallCancelled_uses_default_message_and_requires_caller_identity()
    {
        var clients = new RecordingHubClients();
        var hub = CreateHub("caller-1", clients, new RecordingGroupManager());

        await Assert.ThrowsAsync<HubException>(() => hub.SendIncomingCallCancelled(
            "chat-1",
            "meeting-1",
            "wrong-caller",
            "Wrong",
            "recipient-1",
            "Cancelled"));

        await hub.SendIncomingCallCancelled(
            "chat-1",
            "meeting-1",
            "caller-1",
            "",
            "recipient-1",
            "",
            "");

        var sent = Assert.Single(clients.GroupProxies["user_recipient-1"].Sent);
        Assert.Equal("IncomingCallCancelled", sent.Method);
        Assert.Equal("Someone", ReadPayloadValue(sent.Args[0], "CallerName"));
        Assert.Equal("Sorry, I called you by mistake.", ReadPayloadValue(sent.Args[0], "Message"));
        Assert.Equal("Cancelled", ReadPayloadValue(sent.Args[0], "Reason"));
    }

    [Fact]
    public async Task SendIncomingCallResponse_only_recipient_can_answer_and_status_is_normalized()
    {
        var clients = new RecordingHubClients();
        var hub = CreateHub("recipient-1", clients, new RecordingGroupManager());

        await Assert.ThrowsAsync<HubException>(() => hub.SendIncomingCallResponse(
            "chat-1",
            "meeting-1",
            "call-1",
            "caller-1",
            "other-recipient",
            "Other",
            "Accepted",
            null));

        await hub.SendIncomingCallResponse(
            "chat-1",
            "meeting-1",
            "call-1",
            "caller-1",
            "recipient-1",
            "",
            "Unsupported",
            "No answer");

        var sent = Assert.Single(clients.GroupProxies["user_caller-1"].Sent);
        Assert.Equal("IncomingCallResponse", sent.Method);
        Assert.Equal("Participant", ReadPayloadValue(sent.Args[0], "RecipientName"));
        Assert.Equal("NoResponse", ReadPayloadValue(sent.Args[0], "Status"));
    }

    [Fact]
    public async Task SendConversationMessage_trims_and_fans_out_to_conversation_and_user_groups()
    {
        var clients = new RecordingHubClients();
        var hub = CreateHub("sender-1", clients, new RecordingGroupManager());

        await hub.SendConversationMessage(
            "chat-1",
            "message-1",
            "sender-1",
            "Sender",
            "Hello\r\n",
            new List<string> { "recipient-1", "recipient-1", "recipient-2" },
            attachmentFileName: "report.pdf",
            attachmentUrl: "/uploads/report.pdf",
            isImportant: true);

        Assert.Equal("ConversationMessageReceived", clients.OthersInGroups["conversation_chat-1"].Sent[0].Method);
        Assert.Single(clients.GroupProxies["user_recipient-1"].Sent);
        Assert.Single(clients.GroupProxies["user_recipient-2"].Sent);
        Assert.Equal("Hello", ReadPayloadValue(clients.GroupProxies["user_recipient-1"].Sent[0].Args[0], "Message"));
        Assert.Equal("report.pdf", ReadPayloadValue(clients.GroupProxies["user_recipient-1"].Sent[0].Args[0], "AttachmentFileName"));
        Assert.Equal(true, ReadPayloadValue(clients.GroupProxies["user_recipient-1"].Sent[0].Args[0], "IsImportant"));
    }

    private static NotificationHub CreateHub(string userId, RecordingHubClients clients, RecordingGroupManager groups)
    {
        return new NotificationHub(NullLogger<NotificationHub>.Instance)
        {
            Context = new TestHubCallerContext(userId),
            Clients = clients,
            Groups = groups
        };
    }

    private static object? ReadPayloadValue(object? payload, string propertyName)
    {
        return payload?.GetType().GetProperty(propertyName)?.GetValue(payload);
    }
}

internal sealed class RecordingClientProxy : IClientProxy
{
    public List<(string Method, object?[] Args)> Sent { get; } = new();

    public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
    {
        Sent.Add((method, args));
        return Task.CompletedTask;
    }
}

internal sealed class RecordingHubClients : IHubCallerClients, IHubClients
{
    public RecordingClientProxy AllProxy { get; } = new();
    public RecordingClientProxy CallerProxy { get; } = new();
    public RecordingClientProxy OthersProxy { get; } = new();
    public Dictionary<string, RecordingClientProxy> GroupProxies { get; } = new();
    public Dictionary<string, RecordingClientProxy> OthersInGroups { get; } = new();

    public IClientProxy All => AllProxy;
    public IClientProxy Caller => CallerProxy;
    public IClientProxy Others => OthersProxy;

    public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => AllProxy;
    public IClientProxy Client(string connectionId) => Group($"connection_{connectionId}");
    public IClientProxy Clients(IReadOnlyList<string> connectionIds) => AllProxy;
    public IClientProxy Group(string groupName)
    {
        if (!GroupProxies.TryGetValue(groupName, out var proxy))
        {
            proxy = new RecordingClientProxy();
            GroupProxies[groupName] = proxy;
        }

        return proxy;
    }

    public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => Group(groupName);
    public IClientProxy Groups(IReadOnlyList<string> groupNames) => AllProxy;
    public IClientProxy OthersInGroup(string groupName)
    {
        if (!OthersInGroups.TryGetValue(groupName, out var proxy))
        {
            proxy = new RecordingClientProxy();
            OthersInGroups[groupName] = proxy;
        }

        return proxy;
    }

    public IClientProxy User(string userId) => Group($"user_{userId}");
    public IClientProxy Users(IReadOnlyList<string> userIds) => AllProxy;
}

internal sealed class RecordingGroupManager : IGroupManager
{
    public List<(string ConnectionId, string GroupName)> AddedGroups { get; } = new();
    public List<(string ConnectionId, string GroupName)> RemovedGroups { get; } = new();

    public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
    {
        AddedGroups.Add((connectionId, groupName));
        return Task.CompletedTask;
    }

    public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
    {
        RemovedGroups.Add((connectionId, groupName));
        return Task.CompletedTask;
    }
}

internal sealed class TestHubCallerContext : HubCallerContext
{
    public TestHubCallerContext(string userId)
    {
        User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId)
        }, "test"));
    }

    public override string ConnectionId => "connection-1";
    public override string? UserIdentifier => User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
    public override ClaimsPrincipal? User { get; }
    public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
    public override IFeatureCollection Features { get; } = new FeatureCollection();
    public override CancellationToken ConnectionAborted { get; } = CancellationToken.None;
    public override void Abort()
    {
    }
}
