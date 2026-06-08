using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using NotificationService.Data;

namespace NotificationService.Services;

public interface INotificationPushSender
{
    Task SendToUsersAsync(
        IEnumerable<string> userIds,
        string title,
        string body,
        IReadOnlyDictionary<string, string>? data = null,
        CancellationToken cancellationToken = default);
}

public sealed class NoopNotificationPushSender : INotificationPushSender
{
    public Task SendToUsersAsync(
        IEnumerable<string> userIds,
        string title,
        string body,
        IReadOnlyDictionary<string, string>? data = null,
        CancellationToken cancellationToken = default)
    {
        return Task.CompletedTask;
    }
}

public sealed class ExpoNotificationPushSender : INotificationPushSender
{
    private readonly NotificationDbContext _context;
    private readonly HttpClient _httpClient;
    private readonly ILogger<ExpoNotificationPushSender> _logger;

    public ExpoNotificationPushSender(
        NotificationDbContext context,
        HttpClient httpClient,
        ILogger<ExpoNotificationPushSender> logger)
    {
        _context = context;
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task SendToUsersAsync(
        IEnumerable<string> userIds,
        string title,
        string body,
        IReadOnlyDictionary<string, string>? data = null,
        CancellationToken cancellationToken = default)
    {
        var parsedUserIds = userIds
            .Select(id => Guid.TryParse(id, out var userId) ? userId : (Guid?)null)
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToArray();

        if (parsedUserIds.Length == 0)
        {
            return;
        }

        var tokens = await _context.NotificationDevices
            .AsNoTracking()
            .Where(device => device.IsActive && parsedUserIds.Contains(device.UserId))
            .Select(device => device.PushToken)
            .Distinct()
            .ToListAsync(cancellationToken);

        if (tokens.Count == 0)
        {
            return;
        }

        var payload = tokens.Select(token => new
        {
            to = token,
            title,
            body,
            sound = "default",
            data = data ?? new Dictionary<string, string>()
        });

        try
        {
            using var response = await _httpClient.PostAsJsonAsync("https://exp.host/--/api/v2/push/send", payload, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Expo push send failed with status {StatusCode}.", response.StatusCode);
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning(ex, "Expo push send failed.");
        }
    }
}
