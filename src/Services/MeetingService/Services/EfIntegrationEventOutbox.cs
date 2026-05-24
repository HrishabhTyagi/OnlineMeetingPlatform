using System.Text.Json;
using MeetingService.Data;
using MeetingService.Models;
using Microsoft.Extensions.Options;
using Samvaad.Common.Messaging;

namespace MeetingService.Services;

public sealed class EfIntegrationEventOutbox : IIntegrationEventOutbox
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly MeetingDbContext _context;
    private readonly RabbitMqOptions _rabbitOptions;

    public EfIntegrationEventOutbox(MeetingDbContext context, IOptions<RabbitMqOptions> rabbitOptions)
    {
        _context = context;
        _rabbitOptions = rabbitOptions.Value;
    }

    public Task EnqueueAsync<TEvent>(TEvent message, CancellationToken cancellationToken = default)
        where TEvent : class, IEvent
    {
        cancellationToken.ThrowIfCancellationRequested();

        var eventType = typeof(TEvent);
        var attribute = RabbitEventMetadataResolver.GetRequiredAttribute(eventType);
        var outboxMessage = new IntegrationEventOutboxMessage
        {
            Id = Guid.NewGuid(),
            EventId = message.EventId,
            EventName = eventType.Name,
            EventType = eventType.AssemblyQualifiedName ?? eventType.FullName ?? eventType.Name,
            ExchangeName = RabbitEventMetadataResolver.ResolveExchangeName(eventType, _rabbitOptions),
            RoutingKey = attribute.RoutingKey,
            Payload = JsonSerializer.Serialize(message, eventType, JsonOptions),
            OccurredAtUtc = message.OccurredAtUtc,
            CreatedAtUtc = DateTime.UtcNow,
            AvailableAtUtc = DateTime.UtcNow
        };

        _context.IntegrationEventOutboxMessages.Add(outboxMessage);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return _context.SaveChangesAsync(cancellationToken);
    }
}
