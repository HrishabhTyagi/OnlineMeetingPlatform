namespace Samvaad.Common.Messaging;

internal sealed record EventBusSubscription(
    Type EventType,
    Type HandlerType,
    string RoutingKey,
    string? ExchangeName,
    string? QueueName);
