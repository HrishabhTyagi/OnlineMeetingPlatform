using Samvaad.Common.Messaging;

namespace NotificationService.Services;

public interface INotificationEventCheckpointStore
{
    Task<bool> ExecuteOnceAsync<TEvent>(
        TEvent message,
        string handlerName,
        Func<CancellationToken, Task> action,
        CancellationToken cancellationToken = default)
        where TEvent : class, IEvent;
}
