using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NotificationService.Consumers;
using NotificationService.Data;
using NotificationService.Hubs;
using NotificationService.Services;
using Samvaad.Common.Events;

namespace NotificationService.Tests;

public class RabbitNotificationConsumerTests
{
    [Fact]
    public async Task Conversation_message_consumer_is_idempotent_by_event_and_handler()
    {
        await using var db = CreateDbContext();
        var clients = new RecordingHubClients();
        var hubContext = new RecordingHubContext(clients);
        var checkpointStore = new EfNotificationEventCheckpointStore(
            db,
            NullLogger<EfNotificationEventCheckpointStore>.Instance);
        var handler = new ConversationMessageCreatedNotificationHandler(hubContext, checkpointStore);
        var @event = new ConversationMessageCreatedEvent(
            Guid.NewGuid(),
            DateTime.UtcNow,
            null,
            "conversation-1",
            "message-1",
            "sender-1",
            "Asha",
            "Hello",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            false,
            DateTime.UtcNow,
            new List<string> { "recipient-1", "recipient-1" });

        await handler.HandleAsync(@event, CancellationToken.None);
        await handler.HandleAsync(@event, CancellationToken.None);

        Assert.Single(clients.GroupProxies["conversation_conversation-1"].Sent);
        Assert.Single(clients.GroupProxies["user_recipient-1"].Sent);

        var checkpoint = await db.ProcessedNotificationEvents.SingleAsync();
        Assert.Equal(@event.EventId, checkpoint.EventId);
        Assert.Equal(nameof(ConversationMessageCreatedNotificationHandler), checkpoint.HandlerName);
        Assert.NotNull(checkpoint.ProcessedAtUtc);
    }

    private static NotificationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<NotificationDbContext>()
            .UseInMemoryDatabase($"notification-tests-{Guid.NewGuid():N}")
            .Options;
        return new NotificationDbContext(options);
    }
}

internal sealed class RecordingHubContext : IHubContext<NotificationHub>
{
    public RecordingHubContext(RecordingHubClients clients)
    {
        Clients = clients;
    }

    public IHubClients Clients { get; }
    public IGroupManager Groups { get; } = new RecordingGroupManager();
}
