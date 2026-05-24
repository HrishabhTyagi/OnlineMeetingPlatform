using MeetingService.Data;
using MeetingService.Models;
using Microsoft.EntityFrameworkCore;
using Samvaad.Common.Messaging;

namespace MeetingService.Services;

public sealed class EfIntegrationEventConsumerCheckpointStore : IIntegrationEventConsumerCheckpointStore
{
    private readonly MeetingDbContext _context;
    private readonly ILogger<EfIntegrationEventConsumerCheckpointStore> _logger;

    public EfIntegrationEventConsumerCheckpointStore(MeetingDbContext context, ILogger<EfIntegrationEventConsumerCheckpointStore> logger)
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
        var checkpoint = await _context.IntegrationEventConsumerCheckpoints
            .FirstOrDefaultAsync(item => item.EventId == message.EventId && item.HandlerName == handlerName, cancellationToken);

        if (checkpoint?.ProcessedAtUtc != null)
        {
            _logger.LogInformation("Skipping duplicate integration event. Event: {EventName}, EventId: {EventId}, Handler: {HandlerName}", typeof(TEvent).Name, message.EventId, handlerName);
            return false;
        }

        var now = DateTime.UtcNow;
        if (checkpoint == null)
        {
            checkpoint = new IntegrationEventConsumerCheckpoint
            {
                Id = Guid.NewGuid(),
                EventId = message.EventId,
                EventName = typeof(TEvent).Name,
                HandlerName = handlerName,
                FirstSeenAtUtc = now,
                LastAttemptAtUtc = now,
                AttemptCount = 1
            };
            _context.IntegrationEventConsumerCheckpoints.Add(checkpoint);
        }
        else
        {
            checkpoint.AttemptCount++;
            checkpoint.LastAttemptAtUtc = now;
            checkpoint.LastError = null;
            _context.IntegrationEventConsumerCheckpoints.Update(checkpoint);
        }

        await _context.SaveChangesAsync(cancellationToken);

        try
        {
            await action(cancellationToken);
            checkpoint.ProcessedAtUtc = DateTime.UtcNow;
            checkpoint.LastError = null;
            _context.IntegrationEventConsumerCheckpoints.Update(checkpoint);
            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (Exception ex)
        {
            checkpoint.LastError = ex.Message.Length <= 4000 ? ex.Message : ex.Message[..4000];
            _context.IntegrationEventConsumerCheckpoints.Update(checkpoint);
            await _context.SaveChangesAsync(cancellationToken);
            throw;
        }
    }
}
