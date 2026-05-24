using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;

namespace Samvaad.Common.Messaging;

internal sealed class RabbitMqConnection : IDisposable
{
    private readonly RabbitMqOptions _options;
    private readonly ILogger<RabbitMqConnection> _logger;
    private IConnection? _connection;
    private readonly object _lock = new();

    public RabbitMqConnection(IOptions<RabbitMqOptions> options, ILogger<RabbitMqConnection> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public IConnection GetConnection()
    {
        if (_connection is { IsOpen: true })
        {
            return _connection;
        }

        lock (_lock)
        {
            if (_connection is { IsOpen: true })
            {
                return _connection;
            }

            var factory = new ConnectionFactory
            {
                HostName = _options.HostName,
                Port = _options.Port,
                UserName = _options.UserName,
                Password = _options.Password,
                VirtualHost = _options.VirtualHost,
                DispatchConsumersAsync = true,
                AutomaticRecoveryEnabled = true,
                TopologyRecoveryEnabled = true
            };

            _connection?.Dispose();
            _connection = factory.CreateConnection(_options.ServiceName);
            _logger.LogInformation("Connected to RabbitMQ at {Host}:{Port} for {ServiceName}", _options.HostName, _options.Port, _options.ServiceName);
            return _connection;
        }
    }

    public void Dispose()
    {
        _connection?.Dispose();
    }
}
