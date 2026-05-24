using System.Reflection;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace Samvaad.Common.Messaging;

internal sealed class RabbitMqConsumerHostedService : IHostedService, IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly RabbitMqConnection _connection;
    private readonly RabbitMqOptions _options;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IEnumerable<EventBusSubscription> _subscriptions;
    private readonly ILogger<RabbitMqConsumerHostedService> _logger;
    private readonly List<IModel> _channels = new();
    private CancellationTokenSource? _stoppingTokenSource;

    public RabbitMqConsumerHostedService(
        RabbitMqConnection connection,
        IOptions<RabbitMqOptions> options,
        IServiceScopeFactory scopeFactory,
        IEnumerable<EventBusSubscription> subscriptions,
        ILogger<RabbitMqConsumerHostedService> logger)
    {
        _connection = connection;
        _options = options.Value;
        _scopeFactory = scopeFactory;
        _subscriptions = subscriptions;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _stoppingTokenSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _ = Task.Run(() => StartConsumersWithRetryAsync(_stoppingTokenSource.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _stoppingTokenSource?.Cancel();
        Dispose();
        return Task.CompletedTask;
    }

    private async Task StartConsumersWithRetryAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                foreach (var subscription in _subscriptions)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    StartConsumer(subscription);
                }

                return;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                Dispose();
                _logger.LogWarning(ex, "RabbitMQ consumers are not ready yet. Retrying in 5 seconds.");
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    return;
                }
            }
        }
    }

    private void StartConsumer(EventBusSubscription subscription)
    {
        var exchangeName = string.IsNullOrWhiteSpace(subscription.ExchangeName)
            ? _options.ExchangeName
            : subscription.ExchangeName;
        var queueName = ResolveQueueName(subscription);

        var channel = _connection.GetConnection().CreateModel();
        channel.ExchangeDeclare(exchangeName, ExchangeType.Topic, durable: true, autoDelete: false);
        channel.ExchangeDeclare(_options.DeadLetterExchangeName, ExchangeType.Topic, durable: true, autoDelete: false);
        var deadLetterQueueName = $"{queueName}.dead";
        channel.QueueDeclare(deadLetterQueueName, durable: true, exclusive: false, autoDelete: false, arguments: CreateDeadLetterQueueArguments());
        channel.QueueBind(deadLetterQueueName, _options.DeadLetterExchangeName, subscription.RoutingKey);
        channel.QueueDeclare(queueName, durable: true, exclusive: false, autoDelete: false, arguments: CreateQueueArguments(subscription.RoutingKey));
        channel.QueueBind(queueName, exchangeName, subscription.RoutingKey);
        channel.BasicQos(0, _options.ConsumerPrefetchCount, global: false);

        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.Received += async (_, args) =>
        {
            try
            {
                var message = JsonSerializer.Deserialize(args.Body.Span, subscription.EventType, JsonOptions);
                if (message == null)
                {
                    channel.BasicAck(args.DeliveryTag, multiple: false);
                    return;
                }

                await InvokeHandlerAsync(subscription, message, CancellationToken.None);
                channel.BasicAck(args.DeliveryTag, multiple: false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "RabbitMQ handler failed. Event: {EventType}, Handler: {HandlerType}", subscription.EventType.Name, subscription.HandlerType.Name);
                channel.BasicNack(args.DeliveryTag, multiple: false, requeue: true);
            }
        };

        channel.BasicConsume(queueName, autoAck: false, consumer);
        _channels.Add(channel);
        _logger.LogInformation("RabbitMQ consumer active. Queue: {QueueName}, RoutingKey: {RoutingKey}, Handler: {HandlerType}", queueName, subscription.RoutingKey, subscription.HandlerType.Name);
    }

    private Dictionary<string, object>? CreateQueueArguments(string routingKey)
    {
        var arguments = new Dictionary<string, object>
        {
            ["x-dead-letter-exchange"] = _options.DeadLetterExchangeName,
            ["x-dead-letter-routing-key"] = routingKey
        };

        if (_options.UseQuorumQueues)
        {
            arguments["x-queue-type"] = "quorum";
            arguments["x-delivery-limit"] = Math.Max(1, _options.DeliveryLimit);
        }

        if (_options.MessageTtlMilliseconds.HasValue)
        {
            arguments["x-message-ttl"] = Math.Max(1000, _options.MessageTtlMilliseconds.Value);
        }

        return arguments;
    }

    private Dictionary<string, object>? CreateDeadLetterQueueArguments()
    {
        if (!_options.UseQuorumQueues)
        {
            return null;
        }

        return new Dictionary<string, object>
        {
            ["x-queue-type"] = "quorum"
        };
    }

    private async Task InvokeHandlerAsync(EventBusSubscription subscription, object message, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var handler = scope.ServiceProvider.GetRequiredService(subscription.HandlerType);
        var method = typeof(RabbitMqConsumerHostedService)
            .GetMethod(nameof(InvokeTypedHandlerAsync), BindingFlags.NonPublic | BindingFlags.Static)!
            .MakeGenericMethod(subscription.EventType);

        var task = (Task)method.Invoke(null, new[] { handler, message, cancellationToken })!;
        await task.ConfigureAwait(false);
    }

    private static Task InvokeTypedHandlerAsync<TEvent>(object handler, object message, CancellationToken cancellationToken)
        where TEvent : class, IEvent
    {
        return ((IEventHandler<TEvent>)handler).HandleAsync((TEvent)message, cancellationToken);
    }

    private string ResolveQueueName(EventBusSubscription subscription)
    {
        if (!string.IsNullOrWhiteSpace(subscription.QueueName))
        {
            return subscription.QueueName;
        }

        var serviceName = NormalizeQueuePart(_options.ServiceName);
        var routingKey = NormalizeQueuePart(subscription.RoutingKey);
        var handler = NormalizeQueuePart(subscription.HandlerType.Name);
        return $"{serviceName}.{routingKey}.{handler}";
    }

    private static string NormalizeQueuePart(string value)
    {
        return string.Join(".", value
            .Trim()
            .Split(new[] { '.', ':', '/', '\\', ' ' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(part => part.ToLowerInvariant()));
    }

    public void Dispose()
    {
        foreach (var channel in _channels)
        {
            try
            {
                channel.Dispose();
            }
            catch
            {
                // Ignore shutdown errors.
            }
        }

        _channels.Clear();
    }
}
