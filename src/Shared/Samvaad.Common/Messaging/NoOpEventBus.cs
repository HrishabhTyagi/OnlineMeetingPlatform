namespace Samvaad.Common.Messaging;

internal sealed class NoOpEventBus : IEventBus
{
    public Task PublishAsync<TEvent>(TEvent message, CancellationToken cancellationToken = default)
        where TEvent : class, IEvent
    {
        return Task.CompletedTask;
    }
}
