using System.Collections.Concurrent;
using Samvaad.Common.Messaging;

namespace NotificationService.Services;

public sealed class InMemoryNotificationEventCheckpointStore : INotificationEventCheckpointStore
{
    private readonly ConcurrentDictionary<string, byte> _processed = new(StringComparer.Ordinal);

    public async Task<bool> ExecuteOnceAsync<TEvent>(
        TEvent message,
        string handlerName,
        Func<CancellationToken, Task> action,
        CancellationToken cancellationToken = default)
        where TEvent : class, IEvent
    {
        var key = $"{message.EventId:N}:{handlerName}";
        if (_processed.ContainsKey(key))
        {
            return false;
        }

        await action(cancellationToken);
        _processed.TryAdd(key, 0);
        return true;
    }
}
