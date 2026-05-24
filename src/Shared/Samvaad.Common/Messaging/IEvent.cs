namespace Samvaad.Common.Messaging;

public interface IEvent
{
    Guid EventId { get; }
    DateTime OccurredAtUtc { get; }
}
