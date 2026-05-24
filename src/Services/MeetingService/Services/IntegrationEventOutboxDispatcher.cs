using System.Reflection;
using System.Text.Json;
using MeetingService.Data;
using MeetingService.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Samvaad.Common.Messaging;

namespace MeetingService.Services;

public sealed class IntegrationEventOutboxDispatcher : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IntegrationEventOutboxOptions _outboxOptions;
    private readonly RabbitMqOptions _rabbitOptions;
    private readonly ILogger<IntegrationEventOutboxDispatcher> _logger;

    public IntegrationEventOutboxDispatcher(
        IServiceScopeFactory scopeFactory,
        IOptions<IntegrationEventOutboxOptions> outboxOptions,
        IOptions<RabbitMqOptions> rabbitOptions,
        ILogger<IntegrationEventOutboxDispatcher> logger)
    {
        _scopeFactory = scopeFactory;
        _outboxOptions = outboxOptions.Value;
        _rabbitOptions = rabbitOptions.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_outboxOptions.Enabled)
        {
            _logger.LogInformation("Integration event outbox dispatcher is disabled.");
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (_rabbitOptions.Enabled)
                {
                    await DispatchBatchAsync(stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Integration event outbox dispatch failed.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(Math.Max(1, _outboxOptions.PollIntervalSeconds)), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
        }
    }

    private async Task DispatchBatchAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MeetingDbContext>();
        var eventBus = scope.ServiceProvider.GetRequiredService<IEventBus>();
        var now = DateTime.UtcNow;

        var candidateIds = await context.IntegrationEventOutboxMessages
            .Where(message =>
                message.ProcessedAtUtc == null &&
                message.FailedAtUtc == null &&
                message.AvailableAtUtc <= now &&
                (message.LockedUntilUtc == null || message.LockedUntilUtc < now))
            .OrderBy(message => message.CreatedAtUtc)
            .Select(message => message.Id)
            .Take(Math.Clamp(_outboxOptions.BatchSize, 1, 500))
            .ToListAsync(cancellationToken);

        foreach (var id in candidateIds)
        {
            await DispatchMessageAsync(context, eventBus, id, cancellationToken);
        }
    }

    private async Task DispatchMessageAsync(MeetingDbContext context, IEventBus eventBus, Guid id, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var lockId = Guid.NewGuid().ToString("N");
        var lockedUntil = now.AddSeconds(Math.Max(5, _outboxOptions.LockSeconds));

        var claimed = await context.IntegrationEventOutboxMessages
            .Where(message =>
                message.Id == id &&
                message.ProcessedAtUtc == null &&
                message.FailedAtUtc == null &&
                message.AvailableAtUtc <= now &&
                (message.LockedUntilUtc == null || message.LockedUntilUtc < now))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(message => message.LockId, lockId)
                .SetProperty(message => message.LockedUntilUtc, lockedUntil), cancellationToken);

        if (claimed == 0)
        {
            return;
        }

        var outboxMessage = await context.IntegrationEventOutboxMessages
            .FirstAsync(message => message.Id == id && message.LockId == lockId, cancellationToken);

        try
        {
            await PublishOutboxMessageAsync(eventBus, outboxMessage, cancellationToken);
            outboxMessage.ProcessedAtUtc = DateTime.UtcNow;
            outboxMessage.LockId = null;
            outboxMessage.LockedUntilUtc = null;
            outboxMessage.LastError = null;
            context.IntegrationEventOutboxMessages.Update(outboxMessage);
            await context.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Outbox message publish failed. Event: {EventName}, EventId: {EventId}", outboxMessage.EventName, outboxMessage.EventId);
            await MarkFailedOrRetryAsync(context, outboxMessage, ex, cancellationToken);
        }
    }

    private async Task PublishOutboxMessageAsync(IEventBus eventBus, IntegrationEventOutboxMessage outboxMessage, CancellationToken cancellationToken)
    {
        var eventType = Type.GetType(outboxMessage.EventType, throwOnError: false);
        if (eventType == null || !typeof(IEvent).IsAssignableFrom(eventType))
        {
            throw new InvalidOperationException($"Outbox event type cannot be loaded: {outboxMessage.EventType}");
        }

        var message = JsonSerializer.Deserialize(outboxMessage.Payload, eventType, JsonOptions);
        if (message == null)
        {
            throw new InvalidOperationException($"Outbox payload cannot be deserialized: {outboxMessage.EventName}");
        }

        var method = typeof(IntegrationEventOutboxDispatcher)
            .GetMethod(nameof(PublishTypedAsync), BindingFlags.NonPublic | BindingFlags.Static)!
            .MakeGenericMethod(eventType);
        var task = (Task)method.Invoke(null, new[] { eventBus, message, cancellationToken })!;
        await task.ConfigureAwait(false);
    }

    private static Task PublishTypedAsync<TEvent>(IEventBus eventBus, object message, CancellationToken cancellationToken)
        where TEvent : class, IEvent
    {
        return eventBus.PublishAsync((TEvent)message, cancellationToken);
    }

    private async Task MarkFailedOrRetryAsync(MeetingDbContext context, IntegrationEventOutboxMessage outboxMessage, Exception exception, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        outboxMessage.RetryCount++;
        outboxMessage.LastError = exception.Message.Length <= 4000 ? exception.Message : exception.Message[..4000];
        outboxMessage.LockId = null;
        outboxMessage.LockedUntilUtc = null;

        if (outboxMessage.RetryCount >= Math.Max(1, _outboxOptions.MaxRetries))
        {
            outboxMessage.FailedAtUtc = now;
        }
        else
        {
            outboxMessage.AvailableAtUtc = now.AddSeconds(GetRetryDelaySeconds(outboxMessage.RetryCount));
        }

        context.IntegrationEventOutboxMessages.Update(outboxMessage);
        await context.SaveChangesAsync(cancellationToken);
    }

    private int GetRetryDelaySeconds(int retryCount)
    {
        var initial = Math.Max(1, _outboxOptions.InitialRetryDelaySeconds);
        var max = Math.Max(initial, _outboxOptions.MaxRetryDelaySeconds);
        var delay = initial * Math.Pow(2, Math.Max(0, retryCount - 1));
        return (int)Math.Min(max, delay);
    }
}
