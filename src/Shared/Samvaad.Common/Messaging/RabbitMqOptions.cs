namespace Samvaad.Common.Messaging;

public class RabbitMqOptions
{
    public bool Enabled { get; set; }
    public string ServiceName { get; set; } = "samvaad-service";
    public string HostName { get; set; } = "localhost";
    public int Port { get; set; } = 5672;
    public string UserName { get; set; } = "guest";
    public string Password { get; set; } = "guest";
    public string VirtualHost { get; set; } = "/";
    public string ExchangeName { get; set; } = "samvaad.events";
    public string DeadLetterExchangeName { get; set; } = "samvaad.events.dead";
    public ushort ConsumerPrefetchCount { get; set; } = 10;
    public bool UseQuorumQueues { get; set; } = true;
    public int DeliveryLimit { get; set; } = 5;
    public int? MessageTtlMilliseconds { get; set; }
    public bool EnablePublisherConfirms { get; set; } = true;
    public int PublisherConfirmTimeoutSeconds { get; set; } = 5;
    public bool RequireRoutableMessages { get; set; } = true;
}
