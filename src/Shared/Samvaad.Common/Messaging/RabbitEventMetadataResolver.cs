using Microsoft.Extensions.Options;

namespace Samvaad.Common.Messaging;

public static class RabbitEventMetadataResolver
{
    public static RabbitEventAttribute GetRequiredAttribute(Type eventType)
    {
        return eventType.GetCustomAttributes(typeof(RabbitEventAttribute), inherit: false)
            .OfType<RabbitEventAttribute>()
            .FirstOrDefault()
            ?? throw new InvalidOperationException($"{eventType.Name} must be decorated with RabbitEventAttribute.");
    }

    public static string ResolveExchangeName(Type eventType, RabbitMqOptions options)
    {
        var attribute = GetRequiredAttribute(eventType);
        return string.IsNullOrWhiteSpace(attribute.ExchangeName)
            ? options.ExchangeName
            : attribute.ExchangeName;
    }

    public static string ResolveExchangeName(Type eventType, IOptions<RabbitMqOptions> options)
    {
        return ResolveExchangeName(eventType, options.Value);
    }
}
