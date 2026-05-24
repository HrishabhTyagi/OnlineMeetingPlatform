namespace Samvaad.Common.Caching;

public sealed class RedisCacheOptions
{
    public bool Enabled { get; set; }
    public string ConnectionString { get; set; } = string.Empty;
    public string InstanceName { get; set; } = "samvaad";
    public int Database { get; set; } = -1;
    public int DefaultTtlSeconds { get; set; } = 300;
}
