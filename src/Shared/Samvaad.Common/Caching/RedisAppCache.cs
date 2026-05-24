using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StackExchange.Redis;

namespace Samvaad.Common.Caching;

public sealed class RedisAppCache : IAppCache, IAsyncDisposable
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    private readonly RedisCacheOptions _options;
    private readonly ILogger<RedisAppCache> _logger;
    private readonly SemaphoreSlim _connectionLock = new(1, 1);
    private IConnectionMultiplexer? _connection;
    private bool _connectionFailed;
    private DateTime _lastConnectionFailureUtc = DateTime.MinValue;

    public RedisAppCache(IOptions<RedisCacheOptions> options, ILogger<RedisAppCache> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default)
    {
        var database = await TryGetDatabaseAsync(cancellationToken);
        if (database == null)
        {
            return default;
        }

        try
        {
            var value = await database.StringGetAsync(FormatKey(key));
            return value.HasValue
                ? JsonSerializer.Deserialize<T>(value!, SerializerOptions)
                : default;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis cache read failed for key {CacheKey}", key);
            return default;
        }
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken cancellationToken = default)
    {
        var database = await TryGetDatabaseAsync(cancellationToken);
        if (database == null)
        {
            return;
        }

        try
        {
            var json = JsonSerializer.Serialize(value, SerializerOptions);
            await database.StringSetAsync(FormatKey(key), json, ttl ?? DefaultTtl());
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis cache write failed for key {CacheKey}", key);
        }
    }

    public async Task RemoveAsync(IEnumerable<string> keys, CancellationToken cancellationToken = default)
    {
        var database = await TryGetDatabaseAsync(cancellationToken);
        if (database == null)
        {
            return;
        }

        try
        {
            var redisKeys = keys
                .Where(key => !string.IsNullOrWhiteSpace(key))
                .Select(key => (RedisKey)FormatKey(key))
                .ToArray();

            if (redisKeys.Length > 0)
            {
                await database.KeyDeleteAsync(redisKeys);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis cache remove failed.");
        }
    }

    public async Task<long> IncrementAsync(string key, TimeSpan? ttl = null, CancellationToken cancellationToken = default)
    {
        var database = await TryGetDatabaseAsync(cancellationToken);
        if (database == null)
        {
            return 0;
        }

        try
        {
            var redisKey = FormatKey(key);
            var value = await database.StringIncrementAsync(redisKey);
            await database.KeyExpireAsync(redisKey, ttl ?? TimeSpan.FromDays(30));
            return value;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis cache increment failed for key {CacheKey}", key);
            return 0;
        }
    }

    public async Task<T> GetOrCreateAsync<T>(string key, Func<CancellationToken, Task<T>> factory, TimeSpan? ttl = null, CancellationToken cancellationToken = default)
    {
        var cached = await GetAsync<T>(key, cancellationToken);
        if (cached != null)
        {
            return cached;
        }

        var value = await factory(cancellationToken);
        if (value != null)
        {
            await SetAsync(key, value, ttl, cancellationToken);
        }

        return value;
    }

    public async ValueTask DisposeAsync()
    {
        _connectionLock.Dispose();
        if (_connection != null)
        {
            await _connection.CloseAsync();
            _connection.Dispose();
        }
    }

    private async Task<IDatabase?> TryGetDatabaseAsync(CancellationToken cancellationToken)
    {
        if (!_options.Enabled || string.IsNullOrWhiteSpace(_options.ConnectionString))
        {
            return null;
        }

        if (_connectionFailed && DateTime.UtcNow - _lastConnectionFailureUtc < TimeSpan.FromSeconds(30))
        {
            return null;
        }

        if (_connection?.IsConnected == true)
        {
            return _connection.GetDatabase(_options.Database);
        }

        await _connectionLock.WaitAsync(cancellationToken);
        try
        {
            if (_connection?.IsConnected != true)
            {
                var configuration = ConfigurationOptions.Parse(_options.ConnectionString);
                configuration.AbortOnConnectFail = false;
                _connection = await ConnectionMultiplexer.ConnectAsync(configuration);
                _connectionFailed = false;
                _logger.LogInformation("Redis cache connected to {RedisEndpoint}", configuration.EndPoints.FirstOrDefault()?.ToString() ?? "configured endpoint");
            }

            return _connection.GetDatabase(_options.Database);
        }
        catch (Exception ex)
        {
            _connectionFailed = true;
            _lastConnectionFailureUtc = DateTime.UtcNow;
            _logger.LogWarning(ex, "Redis cache is unavailable. Continuing without cache.");
            return null;
        }
        finally
        {
            _connectionLock.Release();
        }
    }

    private string FormatKey(string key)
    {
        var instanceName = string.IsNullOrWhiteSpace(_options.InstanceName)
            ? "samvaad"
            : CacheKey.Normalize(_options.InstanceName);

        return $"{instanceName}:{key}";
    }

    private TimeSpan DefaultTtl()
    {
        return TimeSpan.FromSeconds(Math.Max(5, _options.DefaultTtlSeconds));
    }
}
