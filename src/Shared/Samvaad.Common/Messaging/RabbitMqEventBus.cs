using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace Samvaad.Common.Messaging;

internal sealed class RabbitMqEventBus : IEventBus
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly RabbitMqConnection _connection;
    private readonly RabbitMqOptions _options;
    private readonly ILogger<RabbitMqEventBus> _logger;

    public RabbitMqEventBus(RabbitMqConnection connection, IOptions<RabbitMqOptions> options, ILogger<RabbitMqEventBus> logger)
    {
        _connection = connection;
        _options = options.Value;
        _logger = logger;
    }

    public Task PublishAsync<TEvent>(TEvent message, CancellationToken cancellationToken = default)
        where TEvent : class, IEvent
    {
        cancellationToken.ThrowIfCancellationRequested();

        var attribute = RabbitEventMetadataResolver.GetRequiredAttribute(typeof(TEvent));
        var routingKey = attribute.RoutingKey;
        var exchangeName = RabbitEventMetadataResolver.ResolveExchangeName(typeof(TEvent), _options);

        try
        {
            using var channel = _connection.GetConnection().CreateModel();
            channel.ExchangeDeclare(exchangeName, ExchangeType.Topic, durable: true, autoDelete: false);
            if (_options.EnablePublisherConfirms)
            {
                channel.ConfirmSelect();
            }

            var body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(message, JsonOptions));
            var properties = channel.CreateBasicProperties();
            properties.Persistent = true;
            properties.ContentType = "application/json";
            properties.MessageId = message.EventId.ToString();
            properties.Type = typeof(TEvent).FullName;
            properties.Timestamp = new AmqpTimestamp(DateTimeOffset.UtcNow.ToUnixTimeSeconds());
            properties.Headers = new Dictionary<string, object>
            {
                ["x-samvaad-event"] = typeof(TEvent).Name,
                ["x-samvaad-routing-key"] = routingKey
            };

            BasicReturnEventArgs? returnedMessage = null;
            EventHandler<BasicReturnEventArgs> returnHandler = (_, args) => returnedMessage = args;
            if (_options.RequireRoutableMessages)
            {
                channel.BasicReturn += returnHandler;
            }

            try
            {
                channel.BasicPublish(exchangeName, routingKey, mandatory: _options.RequireRoutableMessages, basicProperties: properties, body: body);
                if (_options.EnablePublisherConfirms)
                {
                    channel.WaitForConfirmsOrDie(TimeSpan.FromSeconds(Math.Max(1, _options.PublisherConfirmTimeoutSeconds)));
                }
            }
            finally
            {
                if (_options.RequireRoutableMessages)
                {
                    channel.BasicReturn -= returnHandler;
                }
            }

            if (returnedMessage != null)
            {
                throw new InvalidOperationException($"RabbitMQ returned unroutable event {typeof(TEvent).Name} on routing key {routingKey}: {returnedMessage.ReplyText}");
            }

            return Task.CompletedTask;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "RabbitMQ publish failed for {EventType} on routing key {RoutingKey}", typeof(TEvent).Name, routingKey);
            throw;
        }
    }
}
