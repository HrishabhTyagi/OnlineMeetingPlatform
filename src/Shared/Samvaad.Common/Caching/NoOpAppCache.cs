namespace Samvaad.Common.Caching;

public sealed class NoOpAppCache : IAppCache
{
    public Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default)
    {
        return Task.FromResult<T?>(default);
    }

    public Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken cancellationToken = default)
    {
        return Task.CompletedTask;
    }

    public Task RemoveAsync(IEnumerable<string> keys, CancellationToken cancellationToken = default)
    {
        return Task.CompletedTask;
    }

    public Task<long> IncrementAsync(string key, TimeSpan? ttl = null, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(0L);
    }

    public Task<T> GetOrCreateAsync<T>(string key, Func<CancellationToken, Task<T>> factory, TimeSpan? ttl = null, CancellationToken cancellationToken = default)
    {
        return factory(cancellationToken);
    }
}
