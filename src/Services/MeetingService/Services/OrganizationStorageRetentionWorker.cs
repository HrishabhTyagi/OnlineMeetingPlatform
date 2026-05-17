using Microsoft.EntityFrameworkCore;
using MeetingService.Data;

namespace MeetingService.Services;

public class OrganizationStorageRetentionWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OrganizationStorageRetentionWorker> _logger;

    public OrganizationStorageRetentionWorker(IServiceScopeFactory scopeFactory, ILogger<OrganizationStorageRetentionWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CleanupAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Organization storage retention cleanup failed");
            }

            await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
        }
    }

    private async Task CleanupAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MeetingDbContext>();
        var storage = scope.ServiceProvider.GetRequiredService<IOrganizationStorageService>();
        var settings = await storage.GetSettingsAsync();
        var now = DateTime.UtcNow;

        var recordingCutoff = now.AddDays(-settings.RecordingRetentionDays);
        var expiredRecordings = await db.Meetings
            .Where(meeting => meeting.RecordingUrl != null && meeting.StartTime < recordingCutoff)
            .ToListAsync(cancellationToken);

        foreach (var meeting in expiredRecordings)
        {
            var fileName = ExtractFileName(meeting.RecordingUrl);
            if (!string.IsNullOrWhiteSpace(fileName))
            {
                await storage.DeleteAsync(OrganizationFileKind.Recording, meeting.Id, fileName);
            }

            meeting.RecordingUrl = null;
            meeting.IsRecorded = false;
            meeting.UpdatedAt = now;
        }

        var attachmentCutoff = now.AddDays(-settings.AttachmentRetentionDays);
        var expiredAttachments = await db.ConversationMessages
            .Where(message => message.AttachmentUrl != null && message.SentAt < attachmentCutoff)
            .ToListAsync(cancellationToken);

        foreach (var message in expiredAttachments)
        {
            var fileName = ExtractFileName(message.AttachmentUrl);
            if (!string.IsNullOrWhiteSpace(fileName))
            {
                await storage.DeleteAsync(OrganizationFileKind.ChatAttachment, message.ConversationId, fileName);
            }

            message.AttachmentUrl = null;
            message.AttachmentFileName = null;
            message.AttachmentContentType = null;
            message.AttachmentSizeBytes = null;
            message.EditedAt = now;
        }

        if (expiredRecordings.Count > 0 || expiredAttachments.Count > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
            _logger.LogInformation(
                "Storage retention cleanup removed {RecordingCount} recordings and {AttachmentCount} attachments",
                expiredRecordings.Count,
                expiredAttachments.Count);
        }
    }

    private static string? ExtractFileName(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return null;
        }

        if (Uri.TryCreate(url, UriKind.Absolute, out var absoluteUri))
        {
            return Path.GetFileName(absoluteUri.LocalPath);
        }

        var path = url.Split('?', '#')[0];
        return Path.GetFileName(path);
    }
}
