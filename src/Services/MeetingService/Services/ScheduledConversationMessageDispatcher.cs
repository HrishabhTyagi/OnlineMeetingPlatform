using MeetingService.Data;
using MeetingService.Models;
using Microsoft.EntityFrameworkCore;
using System.Net.Http.Json;

namespace MeetingService.Services;

public class ScheduledConversationMessageDispatcher : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ScheduledConversationMessageDispatcher> _logger;

    public ScheduledConversationMessageDispatcher(IServiceScopeFactory scopeFactory, IHttpClientFactory httpClientFactory, ILogger<ScheduledConversationMessageDispatcher> logger)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await DispatchDueMessagesAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to dispatch scheduled conversation messages");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
        }
    }

    private async Task DispatchDueMessagesAsync(CancellationToken stoppingToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MeetingDbContext>();
        var now = DateTime.UtcNow;

        var dueMessages = await context.ScheduledConversationMessages
            .Where(message => message.Status == "Pending" && message.ScheduledFor <= now)
            .OrderBy(message => message.ScheduledFor)
            .Take(25)
            .ToListAsync(stoppingToken);

        if (dueMessages.Count == 0)
        {
            return;
        }

        var notifications = new List<ScheduledConversationMessageNotification>();

        foreach (var scheduledMessage in dueMessages)
        {
            var memberIds = await context.ConversationMembers
                .Where(member => member.ConversationId == scheduledMessage.ConversationId)
                .Select(member => member.UserId)
                .ToListAsync(stoppingToken);

            if (!memberIds.Contains(scheduledMessage.SenderId))
            {
                scheduledMessage.Status = "Cancelled";
                context.ScheduledConversationMessages.Update(scheduledMessage);
                continue;
            }

            var message = new ConversationMessage
            {
                Id = Guid.NewGuid(),
                ConversationId = scheduledMessage.ConversationId,
                SenderId = scheduledMessage.SenderId,
                SenderName = scheduledMessage.SenderName,
                Message = scheduledMessage.Message,
                SentAt = now
            };

            context.ConversationMessages.Add(message);
            scheduledMessage.Status = "Sent";
            scheduledMessage.SentAt = now;
            context.ScheduledConversationMessages.Update(scheduledMessage);

            var conversation = await context.Conversations.FirstOrDefaultAsync(item => item.Id == scheduledMessage.ConversationId, stoppingToken);
            if (conversation != null)
            {
                conversation.UpdatedAt = now;
                context.Conversations.Update(conversation);
            }

            notifications.Add(new ScheduledConversationMessageNotification(
                scheduledMessage.ConversationId.ToString(),
                message.Id.ToString(),
                scheduledMessage.SenderId.ToString(),
                scheduledMessage.SenderName,
                scheduledMessage.Message,
                now,
                memberIds.Where(id => id != scheduledMessage.SenderId).Select(id => id.ToString()).ToList()));
        }

        await context.SaveChangesAsync(stoppingToken);

        if (notifications.Count == 0)
        {
            return;
        }

        var client = _httpClientFactory.CreateClient("NotificationService");
        foreach (var notification in notifications)
        {
            try
            {
                await client.PostAsJsonAsync("/api/internal/notifications/conversation-message", notification, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Scheduled message was saved but live notification failed. Message: {MessageId}", notification.MessageId);
            }
        }
    }

    private record ScheduledConversationMessageNotification(
        string ConversationId,
        string MessageId,
        string SenderId,
        string SenderName,
        string Message,
        DateTime Timestamp,
        List<string> RecipientUserIds);
}
