using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MeetingService.Data;
using MeetingService.Models;

namespace MeetingService.Services;

public class CalendarSyncOptions
{
    public CalendarProviderOptions Google { get; set; } = new();
    public CalendarProviderOptions Outlook { get; set; } = new();
}

public class CalendarProviderOptions
{
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string Tenant { get; set; } = "common";
    public string CalendarId { get; set; } = "primary";
}

public interface IExternalCalendarSyncService
{
    IReadOnlyList<CalendarProviderConfigDto> GetProviders();
    Task<string> BuildAuthorizationUrlAsync(ExternalCalendarProvider provider, string redirectUri, Guid userId);
    Task<CalendarConnection> CompleteAuthorizationAsync(ExternalCalendarProvider provider, Guid userId, string code, string redirectUri);
    Task<List<CalendarConnection>> GetConnectionsAsync(Guid userId);
    Task DisconnectAsync(Guid userId, ExternalCalendarProvider provider);
    Task SyncMeetingAsync(Meeting meeting, Guid organizerId);
    Task DeleteExternalEventsAsync(Meeting meeting);
}

public class ExternalCalendarSyncService : IExternalCalendarSyncService
{
    private const string GoogleScope = "openid email profile https://www.googleapis.com/auth/calendar.events";
    private const string OutlookScope = "offline_access User.Read Calendars.ReadWrite";
    private readonly MeetingDbContext _context;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IDataProtector _tokenProtector;
    private readonly CalendarSyncOptions _options;
    private readonly ILogger<ExternalCalendarSyncService> _logger;

    public ExternalCalendarSyncService(
        MeetingDbContext context,
        IHttpClientFactory httpClientFactory,
        IDataProtectionProvider dataProtectionProvider,
        IOptions<CalendarSyncOptions> options,
        ILogger<ExternalCalendarSyncService> logger)
    {
        _context = context;
        _httpClientFactory = httpClientFactory;
        _tokenProtector = dataProtectionProvider.CreateProtector("Samvaad.CalendarSync.Tokens.v1");
        _options = options.Value;
        _logger = logger;
    }

    public IReadOnlyList<CalendarProviderConfigDto> GetProviders()
    {
        return new List<CalendarProviderConfigDto>
        {
            new()
            {
                Provider = ExternalCalendarProvider.Google.ToString(),
                DisplayName = "Google Calendar",
                IsConfigured = IsConfigured(ExternalCalendarProvider.Google),
                Scopes = new List<string> { "calendar.events" }
            },
            new()
            {
                Provider = ExternalCalendarProvider.Outlook.ToString(),
                DisplayName = "Outlook Calendar",
                IsConfigured = IsConfigured(ExternalCalendarProvider.Outlook),
                Scopes = new List<string> { "Calendars.ReadWrite", "User.Read", "offline_access" }
            }
        };
    }

    public Task<string> BuildAuthorizationUrlAsync(ExternalCalendarProvider provider, string redirectUri, Guid userId)
    {
        EnsureProviderConfigured(provider);
        EnsureRedirectUri(redirectUri);
        var options = GetOptions(provider);

        var query = provider == ExternalCalendarProvider.Google
            ? new Dictionary<string, string>
            {
                ["client_id"] = options.ClientId,
                ["redirect_uri"] = redirectUri,
                ["response_type"] = "code",
                ["scope"] = GoogleScope,
                ["access_type"] = "offline",
                ["prompt"] = "consent",
                ["state"] = userId.ToString()
            }
            : new Dictionary<string, string>
            {
                ["client_id"] = options.ClientId,
                ["redirect_uri"] = redirectUri,
                ["response_type"] = "code",
                ["response_mode"] = "query",
                ["scope"] = OutlookScope,
                ["state"] = userId.ToString()
            };

        var baseUrl = provider == ExternalCalendarProvider.Google
            ? "https://accounts.google.com/o/oauth2/v2/auth"
            : $"https://login.microsoftonline.com/{Uri.EscapeDataString(NormalizeOutlookTenant(options.Tenant))}/oauth2/v2.0/authorize";

        return Task.FromResult($"{baseUrl}?{BuildQuery(query)}");
    }

    public async Task<CalendarConnection> CompleteAuthorizationAsync(ExternalCalendarProvider provider, Guid userId, string code, string redirectUri)
    {
        EnsureProviderConfigured(provider);
        EnsureRedirectUri(redirectUri);

        if (string.IsNullOrWhiteSpace(code))
        {
            throw new InvalidOperationException("Authorization code is required.");
        }

        var token = provider == ExternalCalendarProvider.Google
            ? await ExchangeGoogleCodeAsync(code, redirectUri)
            : await ExchangeOutlookCodeAsync(code, redirectUri);

        var accountEmail = provider == ExternalCalendarProvider.Google
            ? await FetchGoogleAccountEmailAsync(token.AccessToken)
            : await FetchOutlookAccountEmailAsync(token.AccessToken);

        var providerOptions = GetOptions(provider);
        var connection = await _context.CalendarConnections
            .FirstOrDefaultAsync(item => item.UserId == userId && item.Provider == provider);

        if (connection == null)
        {
            connection = new CalendarConnection
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Provider = provider,
                CreatedAt = DateTime.UtcNow
            };
            _context.CalendarConnections.Add(connection);
        }

        connection.AccountEmail = accountEmail;
        connection.CalendarId = provider == ExternalCalendarProvider.Google
            ? (string.IsNullOrWhiteSpace(providerOptions.CalendarId) ? "primary" : providerOptions.CalendarId)
            : "primary";
        connection.AccessToken = ProtectToken(token.AccessToken);
        connection.RefreshToken = string.IsNullOrWhiteSpace(token.RefreshToken)
            ? connection.RefreshToken
            : ProtectToken(token.RefreshToken);
        connection.ExpiresAtUtc = DateTime.UtcNow.AddSeconds(Math.Max(60, token.ExpiresIn - 60));
        connection.IsEnabled = true;
        connection.LastError = null;
        connection.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        await SyncExistingMeetingsAsync(userId);

        return connection;
    }

    public Task<List<CalendarConnection>> GetConnectionsAsync(Guid userId)
    {
        return _context.CalendarConnections
            .Where(connection => connection.UserId == userId)
            .OrderBy(connection => connection.Provider)
            .ToListAsync();
    }

    public async Task DisconnectAsync(Guid userId, ExternalCalendarProvider provider)
    {
        var connection = await _context.CalendarConnections
            .FirstOrDefaultAsync(item => item.UserId == userId && item.Provider == provider);

        if (connection == null)
        {
            return;
        }

        var externalEvents = await _context.ExternalCalendarEvents
            .Where(item => item.UserId == userId && item.Provider == provider)
            .ToListAsync();

        foreach (var externalEvent in externalEvents)
        {
            try
            {
                var accessToken = await EnsureAccessTokenAsync(connection);
                await DeleteProviderEventAsync(connection, accessToken, externalEvent.ExternalEventId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete external calendar event {ExternalEventId} while disconnecting {Provider}", externalEvent.ExternalEventId, provider);
            }
        }

        _context.ExternalCalendarEvents.RemoveRange(externalEvents);
        _context.CalendarConnections.Remove(connection);
        await _context.SaveChangesAsync();
    }

    public async Task SyncMeetingAsync(Meeting meeting, Guid organizerId)
    {
        if (!meeting.IsActive || meeting.Status == MeetingStatus.Cancelled)
        {
            await DeleteExternalEventsAsync(meeting);
            return;
        }

        var connections = await _context.CalendarConnections
            .Where(connection => connection.UserId == organizerId && connection.IsEnabled)
            .ToListAsync();

        foreach (var connection in connections)
        {
            if (!IsConfigured(connection.Provider))
            {
                connection.LastError = $"{connection.Provider} OAuth credentials are not configured.";
                connection.UpdatedAt = DateTime.UtcNow;
                continue;
            }

            try
            {
                var accessToken = await EnsureAccessTokenAsync(connection);
                var externalEvent = await _context.ExternalCalendarEvents
                    .FirstOrDefaultAsync(item => item.MeetingId == meeting.Id && item.UserId == organizerId && item.Provider == connection.Provider);
                var syncedEvent = externalEvent == null
                    ? await CreateProviderEventAsync(connection, accessToken, meeting)
                    : await UpdateProviderEventAsync(connection, accessToken, meeting, externalEvent.ExternalEventId);

                var now = DateTime.UtcNow;
                if (externalEvent == null)
                {
                    externalEvent = new ExternalCalendarEvent
                    {
                        Id = Guid.NewGuid(),
                        MeetingId = meeting.Id,
                        UserId = organizerId,
                        Provider = connection.Provider,
                        CalendarId = connection.CalendarId,
                        ExternalEventId = syncedEvent.Id,
                        CreatedAt = now
                    };
                    _context.ExternalCalendarEvents.Add(externalEvent);
                }

                externalEvent.CalendarId = connection.CalendarId;
                externalEvent.ExternalEventId = syncedEvent.Id;
                externalEvent.HtmlLink = syncedEvent.HtmlLink;
                externalEvent.LastSyncedAt = now;
                externalEvent.LastError = null;
                externalEvent.UpdatedAt = now;
                connection.LastSyncAt = now;
                connection.LastError = null;
                connection.UpdatedAt = now;
            }
            catch (Exception ex)
            {
                connection.LastError = ex.Message;
                connection.UpdatedAt = DateTime.UtcNow;
                _logger.LogWarning(ex, "Failed to sync meeting {MeetingId} to {Provider}", meeting.Id, connection.Provider);
            }
        }

        await _context.SaveChangesAsync();
    }

    public async Task DeleteExternalEventsAsync(Meeting meeting)
    {
        var externalEvents = await _context.ExternalCalendarEvents
            .Where(item => item.MeetingId == meeting.Id)
            .ToListAsync();

        foreach (var externalEvent in externalEvents)
        {
            var connection = await _context.CalendarConnections
                .FirstOrDefaultAsync(item => item.UserId == externalEvent.UserId && item.Provider == externalEvent.Provider);

            if (connection != null && IsConfigured(connection.Provider))
            {
                try
                {
                    var accessToken = await EnsureAccessTokenAsync(connection);
                    await DeleteProviderEventAsync(connection, accessToken, externalEvent.ExternalEventId);
                }
                catch (Exception ex)
                {
                    externalEvent.LastError = ex.Message;
                    externalEvent.UpdatedAt = DateTime.UtcNow;
                    _logger.LogWarning(ex, "Failed to delete external calendar event {ExternalEventId}", externalEvent.ExternalEventId);
                    continue;
                }
            }

            _context.ExternalCalendarEvents.Remove(externalEvent);
        }

        await _context.SaveChangesAsync();
    }

    private async Task SyncExistingMeetingsAsync(Guid userId)
    {
        var meetings = await _context.Meetings
            .Where(meeting => meeting.OrganizerId == userId && meeting.IsActive)
            .OrderByDescending(meeting => meeting.CreatedAt)
            .Take(250)
            .ToListAsync();

        foreach (var meeting in meetings)
        {
            await SyncMeetingAsync(meeting, userId);
        }
    }

    private async Task<TokenResponse> ExchangeGoogleCodeAsync(string code, string redirectUri)
    {
        var options = GetOptions(ExternalCalendarProvider.Google);
        var response = await CreateClient().PostAsync(
            "https://oauth2.googleapis.com/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = options.ClientId,
                ["client_secret"] = options.ClientSecret,
                ["code"] = code,
                ["grant_type"] = "authorization_code",
                ["redirect_uri"] = redirectUri
            }));

        return TokenResponse.FromJson(await ReadJsonResponseAsync(response, "Google token exchange failed."));
    }

    private async Task<TokenResponse> ExchangeOutlookCodeAsync(string code, string redirectUri)
    {
        var options = GetOptions(ExternalCalendarProvider.Outlook);
        var response = await CreateClient().PostAsync(
            $"https://login.microsoftonline.com/{Uri.EscapeDataString(NormalizeOutlookTenant(options.Tenant))}/oauth2/v2.0/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = options.ClientId,
                ["client_secret"] = options.ClientSecret,
                ["code"] = code,
                ["grant_type"] = "authorization_code",
                ["redirect_uri"] = redirectUri,
                ["scope"] = OutlookScope
            }));

        return TokenResponse.FromJson(await ReadJsonResponseAsync(response, "Outlook token exchange failed."));
    }

    private async Task<string?> FetchGoogleAccountEmailAsync(string accessToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "https://www.googleapis.com/oauth2/v3/userinfo");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var json = await ReadJsonResponseAsync(await CreateClient().SendAsync(request), "Google account lookup failed.");
        return GetString(json, "email");
    }

    private async Task<string?> FetchOutlookAccountEmailAsync(string accessToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var json = await ReadJsonResponseAsync(await CreateClient().SendAsync(request), "Outlook account lookup failed.");
        return GetString(json, "mail") ?? GetString(json, "userPrincipalName");
    }

    private async Task<string> EnsureAccessTokenAsync(CalendarConnection connection)
    {
        if (connection.ExpiresAtUtc > DateTime.UtcNow.AddMinutes(2))
        {
            return UnprotectToken(connection.AccessToken);
        }

        var refreshToken = string.IsNullOrWhiteSpace(connection.RefreshToken)
            ? null
            : UnprotectToken(connection.RefreshToken);

        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            throw new InvalidOperationException($"{connection.Provider} needs to be reconnected.");
        }

        var token = connection.Provider == ExternalCalendarProvider.Google
            ? await RefreshGoogleAccessTokenAsync(refreshToken)
            : await RefreshOutlookAccessTokenAsync(refreshToken);

        connection.AccessToken = ProtectToken(token.AccessToken);
        connection.RefreshToken = string.IsNullOrWhiteSpace(token.RefreshToken)
            ? connection.RefreshToken
            : ProtectToken(token.RefreshToken);
        connection.ExpiresAtUtc = DateTime.UtcNow.AddSeconds(Math.Max(60, token.ExpiresIn - 60));
        connection.UpdatedAt = DateTime.UtcNow;
        return token.AccessToken;
    }

    private async Task<TokenResponse> RefreshGoogleAccessTokenAsync(string refreshToken)
    {
        var options = GetOptions(ExternalCalendarProvider.Google);
        var response = await CreateClient().PostAsync(
            "https://oauth2.googleapis.com/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = options.ClientId,
                ["client_secret"] = options.ClientSecret,
                ["refresh_token"] = refreshToken,
                ["grant_type"] = "refresh_token"
            }));

        return TokenResponse.FromJson(await ReadJsonResponseAsync(response, "Google token refresh failed."));
    }

    private async Task<TokenResponse> RefreshOutlookAccessTokenAsync(string refreshToken)
    {
        var options = GetOptions(ExternalCalendarProvider.Outlook);
        var response = await CreateClient().PostAsync(
            $"https://login.microsoftonline.com/{Uri.EscapeDataString(NormalizeOutlookTenant(options.Tenant))}/oauth2/v2.0/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = options.ClientId,
                ["client_secret"] = options.ClientSecret,
                ["refresh_token"] = refreshToken,
                ["grant_type"] = "refresh_token",
                ["scope"] = OutlookScope
            }));

        return TokenResponse.FromJson(await ReadJsonResponseAsync(response, "Outlook token refresh failed."));
    }

    private Task<SyncedCalendarEvent> CreateProviderEventAsync(CalendarConnection connection, string accessToken, Meeting meeting)
    {
        return connection.Provider == ExternalCalendarProvider.Google
            ? CreateGoogleEventAsync(connection, accessToken, meeting)
            : CreateOutlookEventAsync(accessToken, meeting);
    }

    private Task<SyncedCalendarEvent> UpdateProviderEventAsync(CalendarConnection connection, string accessToken, Meeting meeting, string externalEventId)
    {
        return connection.Provider == ExternalCalendarProvider.Google
            ? UpdateGoogleEventAsync(connection, accessToken, meeting, externalEventId)
            : UpdateOutlookEventAsync(accessToken, meeting, externalEventId);
    }

    private async Task<SyncedCalendarEvent> CreateGoogleEventAsync(CalendarConnection connection, string accessToken, Meeting meeting)
    {
        var calendarId = Uri.EscapeDataString(connection.CalendarId);
        var request = CreateAuthorizedJsonRequest(
            HttpMethod.Post,
            $"https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events?sendUpdates=all",
            accessToken,
            BuildGoogleEventBody(meeting));

        var json = await ReadJsonResponseAsync(await CreateClient().SendAsync(request), "Google event creation failed.");
        return new SyncedCalendarEvent(GetRequiredString(json, "id"), GetString(json, "htmlLink"));
    }

    private async Task<SyncedCalendarEvent> UpdateGoogleEventAsync(CalendarConnection connection, string accessToken, Meeting meeting, string externalEventId)
    {
        var calendarId = Uri.EscapeDataString(connection.CalendarId);
        var request = CreateAuthorizedJsonRequest(
            HttpMethod.Patch,
            $"https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{Uri.EscapeDataString(externalEventId)}?sendUpdates=all",
            accessToken,
            BuildGoogleEventBody(meeting));

        var json = await ReadJsonResponseAsync(await CreateClient().SendAsync(request), "Google event update failed.");
        return new SyncedCalendarEvent(GetRequiredString(json, "id"), GetString(json, "htmlLink"));
    }

    private async Task<SyncedCalendarEvent> CreateOutlookEventAsync(string accessToken, Meeting meeting)
    {
        var request = CreateAuthorizedJsonRequest(
            HttpMethod.Post,
            "https://graph.microsoft.com/v1.0/me/events",
            accessToken,
            BuildOutlookEventBody(meeting));

        var json = await ReadJsonResponseAsync(await CreateClient().SendAsync(request), "Outlook event creation failed.");
        return new SyncedCalendarEvent(GetRequiredString(json, "id"), GetString(json, "webLink"));
    }

    private async Task<SyncedCalendarEvent> UpdateOutlookEventAsync(string accessToken, Meeting meeting, string externalEventId)
    {
        var request = CreateAuthorizedJsonRequest(
            HttpMethod.Patch,
            $"https://graph.microsoft.com/v1.0/me/events/{Uri.EscapeDataString(externalEventId)}",
            accessToken,
            BuildOutlookEventBody(meeting));

        var json = await ReadJsonResponseAsync(await CreateClient().SendAsync(request), "Outlook event update failed.");
        return new SyncedCalendarEvent(GetRequiredString(json, "id"), GetString(json, "webLink"));
    }

    private async Task DeleteProviderEventAsync(CalendarConnection connection, string accessToken, string externalEventId)
    {
        var url = connection.Provider == ExternalCalendarProvider.Google
            ? $"https://www.googleapis.com/calendar/v3/calendars/{Uri.EscapeDataString(connection.CalendarId)}/events/{Uri.EscapeDataString(externalEventId)}?sendUpdates=all"
            : $"https://graph.microsoft.com/v1.0/me/events/{Uri.EscapeDataString(externalEventId)}";

        var request = new HttpRequestMessage(HttpMethod.Delete, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var response = await CreateClient().SendAsync(request);

        if (response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return;
        }

        await ReadJsonResponseAsync(response, $"{connection.Provider} event deletion failed.");
    }

    private object BuildGoogleEventBody(Meeting meeting)
    {
        var start = NormalizeUtc(meeting.StartTime);
        var end = NormalizeUtc(meeting.EndTime ?? meeting.StartTime.AddMinutes(meeting.DurationMinutes ?? 60));
        var attendees = SplitAttendeeEmails(meeting.AttendeeEmails)
            .Select(email => new { email })
            .ToList();

        return new
        {
            summary = meeting.Title,
            description = BuildDescription(meeting),
            location = meeting.Location,
            start = new { dateTime = start.ToString("O"), timeZone = "UTC" },
            end = new { dateTime = end.ToString("O"), timeZone = "UTC" },
            attendees
        };
    }

    private object BuildOutlookEventBody(Meeting meeting)
    {
        var start = NormalizeUtc(meeting.StartTime);
        var end = NormalizeUtc(meeting.EndTime ?? meeting.StartTime.AddMinutes(meeting.DurationMinutes ?? 60));
        var attendees = SplitAttendeeEmails(meeting.AttendeeEmails)
            .Select(email => new
            {
                emailAddress = new { address = email },
                type = "required"
            })
            .ToList();

        return new
        {
            subject = meeting.Title,
            body = new
            {
                contentType = "HTML",
                content = WebUtility.HtmlEncode(BuildDescription(meeting)).Replace("\n", "<br />")
            },
            start = new { dateTime = start.ToString("yyyy-MM-ddTHH:mm:ss"), timeZone = "UTC" },
            end = new { dateTime = end.ToString("yyyy-MM-ddTHH:mm:ss"), timeZone = "UTC" },
            location = new { displayName = meeting.Location ?? string.Empty },
            attendees,
            allowNewTimeProposals = true
        };
    }

    private static string BuildDescription(Meeting meeting)
    {
        var lines = new List<string>();
        if (!string.IsNullOrWhiteSpace(meeting.Description))
        {
            lines.Add(meeting.Description.Trim());
        }

        if (!string.IsNullOrWhiteSpace(meeting.MeetingLink))
        {
            lines.Add(string.Empty);
            lines.Add($"Join Samvaad meeting: {meeting.MeetingLink}");
        }

        return lines.Count == 0 ? "Samvaad meeting" : string.Join("\n", lines);
    }

    private HttpRequestMessage CreateAuthorizedJsonRequest(HttpMethod method, string url, string accessToken, object body)
    {
        var request = new HttpRequestMessage(method, url)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return request;
    }

    private async Task<Dictionary<string, string?>> ReadJsonResponseAsync(HttpResponseMessage response, string errorPrefix)
    {
        var content = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"{errorPrefix} {response.StatusCode}: {TrimForLog(content)}");
        }

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(content) ? "{}" : content);
        return document.RootElement.EnumerateObject()
            .ToDictionary(
                property => property.Name,
                property => property.Value.ValueKind == JsonValueKind.String ? property.Value.GetString() : property.Value.GetRawText());
    }

    private static string? GetString(Dictionary<string, string?> json, string propertyName)
    {
        return json.TryGetValue(propertyName, out var value) && !string.IsNullOrWhiteSpace(value)
            ? value
            : null;
    }

    private static string GetRequiredString(Dictionary<string, string?> json, string propertyName)
    {
        return GetString(json, propertyName) ?? throw new InvalidOperationException($"Calendar provider response did not include {propertyName}.");
    }

    private CalendarProviderOptions GetOptions(ExternalCalendarProvider provider)
    {
        return provider == ExternalCalendarProvider.Google ? _options.Google : _options.Outlook;
    }

    private bool IsConfigured(ExternalCalendarProvider provider)
    {
        var options = GetOptions(provider);
        return !string.IsNullOrWhiteSpace(options.ClientId) && !string.IsNullOrWhiteSpace(options.ClientSecret);
    }

    private void EnsureProviderConfigured(ExternalCalendarProvider provider)
    {
        if (!IsConfigured(provider))
        {
            throw new InvalidOperationException($"{provider} calendar sync is not configured.");
        }
    }

    private static void EnsureRedirectUri(string redirectUri)
    {
        if (!Uri.TryCreate(redirectUri, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException("A valid redirect URI is required.");
        }
    }

    private static string BuildQuery(Dictionary<string, string> values)
    {
        return string.Join("&", values.Select(item => $"{WebUtility.UrlEncode(item.Key)}={WebUtility.UrlEncode(item.Value)}"));
    }

    private static string NormalizeOutlookTenant(string? tenant)
    {
        return string.IsNullOrWhiteSpace(tenant) ? "common" : tenant.Trim();
    }

    private HttpClient CreateClient()
    {
        return _httpClientFactory.CreateClient("CalendarSync");
    }

    private string ProtectToken(string token)
    {
        return _tokenProtector.Protect(token);
    }

    private string UnprotectToken(string protectedToken)
    {
        try
        {
            return _tokenProtector.Unprotect(protectedToken);
        }
        catch
        {
            // Keeps local developer connections recoverable if they were created before token protection was added.
            return protectedToken;
        }
    }

    private static DateTime NormalizeUtc(DateTime value)
    {
        return value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };
    }

    private static List<string> SplitAttendeeEmails(string? attendeeEmails)
    {
        if (string.IsNullOrWhiteSpace(attendeeEmails))
        {
            return new List<string>();
        }

        return attendeeEmails
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(email => email.Contains('@'))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string TrimForLog(string value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : value.Length <= 1000 ? value : $"{value[..1000]}...";
    }

    private sealed record SyncedCalendarEvent(string Id, string? HtmlLink);

    private sealed record TokenResponse(string AccessToken, string? RefreshToken, int ExpiresIn)
    {
        public static TokenResponse FromJson(Dictionary<string, string?> json)
        {
            var accessToken = GetRequiredString(json, "access_token");
            var refreshToken = GetString(json, "refresh_token");
            var expiresInText = GetString(json, "expires_in") ?? "3600";
            var expiresIn = int.TryParse(expiresInText, out var seconds) ? seconds : 3600;
            return new TokenResponse(accessToken, refreshToken, expiresIn);
        }
    }
}
