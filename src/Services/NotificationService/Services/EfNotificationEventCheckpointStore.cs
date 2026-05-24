using Microsoft.EntityFrameworkCore;
using NotificationService.Data;
using NotificationService.Models;
using Samvaad.Common.Messaging;

namespace NotificationService.Services;

public sealed class EfNotificationEventCheckpointStore : INotificationEventCheckpointStore
{
    private readonly NotificationDbContext _context;
    private readonly ILogger<EfNotificationEventCheckpointStore> _logger;

    public EfNotificationEventCheckpointStore(NotificationDbContext context, ILogger<EfNotificationEventCheckpointStore> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<bool> ExecuteOnceAsync<TEvent>(
        TEvent message,
        string handlerName,
        Func<CancellationToken, Task> action,
        CancellationToken cancellationToken = default)
        where TEvent : class, IEvent
    {
        var checkpoint = await _context.ProcessedNotificationEvents
            .FirstOrDefaultAsync(item => item.EventId == message.EventId && item.HandlerName == handlerName, cancellationToken);

        if (checkpoint?.ProcessedAtUtc != null)
        {
            _logger.LogInformation("Skipping duplicate notification event. Event: {EventName}, EventId: {EventId}, Handler: {HandlerName}", typeof(TEvent).Name, message.EventId, handlerName);
            return false;
        }

        var now = DateTime.UtcNow;
        if (checkpoint == null)
        {
            checkpoint = new ProcessedNotificationEvent
            {
                Id = Guid.NewGuid(),
                EventId = message.EventId,
                EventName = typeof(TEvent).Name,
                HandlerName = handlerName,
                FirstSeenAtUtc = now,
                LastAttemptAtUtc = now,
                AttemptCount = 1
            };
            _context.ProcessedNotificationEvents.Add(checkpoint);
        }
        else
        {
            checkpoint.AttemptCount++;
            checkpoint.LastAttemptAtUtc = now;
            checkpoint.LastError = null;
            _context.ProcessedNotificationEvents.Update(checkpoint);
        }

        await _context.SaveChangesAsync(cancellationToken);

        try
        {
            await action(cancellationToken);
            checkpoint.ProcessedAtUtc = DateTime.UtcNow;
            checkpoint.LastError = null;
            _context.ProcessedNotificationEvents.Update(checkpoint);
            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (Exception ex)
        {
            checkpoint.LastError = ex.Message.Length <= 4000 ? ex.Message : ex.Message[..4000];
            _context.ProcessedNotificationEvents.Update(checkpoint);
            await _context.SaveChangesAsync(cancellationToken);
            throw;
        }
    }
}
