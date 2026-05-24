using MeetingService.Data;
using MeetingService.Models;
using Microsoft.EntityFrameworkCore;
using Samvaad.Common.Events;

namespace MeetingService.Services;

public class ScheduledConversationMessageDispatcher : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ScheduledConversationMessageDispatcher> _logger;

    public ScheduledConversationMessageDispatcher(IServiceScopeFactory scopeFactory, ILogger<ScheduledConversationMessageDispatcher> logger)
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
        var outbox = scope.ServiceProvider.GetRequiredService<IIntegrationEventOutbox>();
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

            await outbox.EnqueueAsync(new ConversationMessageCreatedEvent(
                Guid.NewGuid(),
                DateTime.UtcNow,
                conversation?.OrganizationId,
                scheduledMessage.ConversationId.ToString(),
                message.Id.ToString(),
                scheduledMessage.SenderId.ToString(),
                scheduledMessage.SenderName,
                scheduledMessage.Message,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                false,
                now,
                memberIds.Where(id => id != scheduledMessage.SenderId).Select(id => id.ToString()).ToList()), stoppingToken);
        }

        await context.SaveChangesAsync(stoppingToken);
    }
}
