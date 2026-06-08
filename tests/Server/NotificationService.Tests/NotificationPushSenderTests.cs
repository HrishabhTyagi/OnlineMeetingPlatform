using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NotificationService.Data;
using NotificationService.Models;
using NotificationService.Services;

namespace NotificationService.Tests;

public class NotificationPushSenderTests
{
    [Fact]
    public async Task Expo_sender_sends_only_active_tokens_for_requested_users()
    {
        await using var db = CreateDbContext();
        var targetUserId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        db.NotificationDevices.AddRange(
            new NotificationDevice { UserId = targetUserId, PushToken = "active-token", Platform = "ios", IsActive = true },
            new NotificationDevice { UserId = targetUserId, PushToken = "inactive-token", Platform = "ios", IsActive = false },
            new NotificationDevice { UserId = otherUserId, PushToken = "other-token", Platform = "android", IsActive = true });
        await db.SaveChangesAsync();

        var handler = new RecordingHttpMessageHandler();
        var sender = new ExpoNotificationPushSender(
            db,
            new HttpClient(handler),
            NullLogger<ExpoNotificationPushSender>.Instance);

        await sender.SendToUsersAsync(
            new[] { targetUserId.ToString(), "not-a-guid" },
            "Hello",
            "Body",
            new Dictionary<string, string> { ["type"] = "chat" },
            CancellationToken.None);

        var request = Assert.Single(handler.Requests);
        Assert.Equal("https://exp.host/--/api/v2/push/send", request.RequestUri?.ToString());
        var json = await request.Content!.ReadAsStringAsync();
        Assert.Contains("active-token", json);
        Assert.DoesNotContain("inactive-token", json);
        Assert.DoesNotContain("other-token", json);
        Assert.Contains("Hello", json);
    }

    private static NotificationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<NotificationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new NotificationDbContext(options);
    }
}

internal sealed class RecordingHttpMessageHandler : HttpMessageHandler
{
    public List<HttpRequestMessage> Requests { get; } = new();

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Requests.Add(Clone(request));
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(new { data = Array.Empty<object>() }))
        });
    }

    private static HttpRequestMessage Clone(HttpRequestMessage request)
    {
        var clone = new HttpRequestMessage(request.Method, request.RequestUri);
        if (request.Content != null)
        {
            clone.Content = new StringContent(request.Content.ReadAsStringAsync().GetAwaiter().GetResult());
        }

        return clone;
    }
}
