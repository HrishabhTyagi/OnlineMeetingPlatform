namespace Samvaad.Common.Messaging;

[AttributeUsage(AttributeTargets.Class, Inherited = false)]
public sealed class RabbitEventAttribute : Attribute
{
    public RabbitEventAttribute(string routingKey)
    {
        RoutingKey = routingKey;
    }

    public string RoutingKey { get; }
    public string? ExchangeName { get; set; }
    public string? QueueName { get; set; }
}
