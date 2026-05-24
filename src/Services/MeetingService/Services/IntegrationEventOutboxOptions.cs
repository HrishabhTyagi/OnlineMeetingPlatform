namespace MeetingService.Services;

public class IntegrationEventOutboxOptions
{
    public bool Enabled { get; set; } = true;
    public int BatchSize { get; set; } = 50;
    public int PollIntervalSeconds { get; set; } = 2;
    public int LockSeconds { get; set; } = 45;
    public int MaxRetries { get; set; } = 12;
    public int InitialRetryDelaySeconds { get; set; } = 5;
    public int MaxRetryDelaySeconds { get; set; } = 300;
}
