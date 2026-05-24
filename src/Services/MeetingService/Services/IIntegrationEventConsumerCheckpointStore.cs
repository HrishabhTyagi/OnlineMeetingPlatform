using Samvaad.Common.Messaging;

namespace MeetingService.Services;

public interface IIntegrationEventConsumerCheckpointStore
{
    Task<bool> ExecuteOnceAsync<TEvent>(
        TEvent message,
        string handlerName,
        Func<CancellationToken, Task> action,
        CancellationToken cancellationToken = default)
        where TEvent : class, IEvent;
}
