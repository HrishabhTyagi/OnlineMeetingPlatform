namespace Samvaad.Common.Messaging;

public interface IEventHandler<in TEvent>
    where TEvent : class, IEvent
{
    Task HandleAsync(TEvent message, CancellationToken cancellationToken);
}
