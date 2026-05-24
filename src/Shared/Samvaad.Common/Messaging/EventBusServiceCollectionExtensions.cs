using System.Reflection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Samvaad.Common.Messaging;

public static class EventBusServiceCollectionExtensions
{
    public static IServiceCollection AddRabbitMqEventBus(
        this IServiceCollection services,
        IConfiguration configuration,
        params Assembly[] handlerAssemblies)
    {
        var section = configuration.GetSection("RabbitMq");
        var options = section.Get<RabbitMqOptions>() ?? new RabbitMqOptions();
        services.Configure<RabbitMqOptions>(section);

        if (!options.Enabled)
        {
            services.AddSingleton<IEventBus, NoOpEventBus>();
            return services;
        }

        var subscriptions = DiscoverSubscriptions(handlerAssemblies);
        foreach (var subscription in subscriptions)
        {
            services.AddScoped(subscription.HandlerType);
            services.AddSingleton(subscription);
        }

        services.AddSingleton<RabbitMqConnection>();
        services.AddSingleton<IEventBus, RabbitMqEventBus>();
        services.AddHostedService<RabbitMqConsumerHostedService>();
        return services;
    }

    private static List<EventBusSubscription> DiscoverSubscriptions(IEnumerable<Assembly> assemblies)
    {
        var subscriptions = new List<EventBusSubscription>();
        foreach (var handlerType in assemblies
            .Where(assembly => assembly != null)
            .Distinct()
            .SelectMany(assembly => assembly.GetTypes())
            .Where(type => !type.IsAbstract && !type.IsInterface))
        {
            var handlerInterfaces = handlerType.GetInterfaces()
                .Where(type => type.IsGenericType && type.GetGenericTypeDefinition() == typeof(IEventHandler<>));

            foreach (var handlerInterface in handlerInterfaces)
            {
                var eventType = handlerInterface.GetGenericArguments()[0];
                var attribute = eventType.GetCustomAttributes(typeof(RabbitEventAttribute), inherit: false)
                    .OfType<RabbitEventAttribute>()
                    .FirstOrDefault()
                    ?? throw new InvalidOperationException($"{eventType.Name} must be decorated with RabbitEventAttribute.");

                subscriptions.Add(new EventBusSubscription(
                    eventType,
                    handlerType,
                    attribute.RoutingKey,
                    attribute.ExchangeName,
                    attribute.QueueName));
            }
        }

        return subscriptions;
    }
}
