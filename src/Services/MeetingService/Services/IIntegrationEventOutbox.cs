using Samvaad.Common.Messaging;

namespace MeetingService.Services;

public interface IIntegrationEventOutbox
{
    Task EnqueueAsync<TEvent>(TEvent message, CancellationToken cancellationToken = default)
        where TEvent : class, IEvent;

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
