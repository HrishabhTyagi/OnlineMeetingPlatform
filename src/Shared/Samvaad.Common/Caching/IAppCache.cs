namespace Samvaad.Common.Caching;

public interface IAppCache
{
    Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default);
    Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken cancellationToken = default);
    Task RemoveAsync(IEnumerable<string> keys, CancellationToken cancellationToken = default);
    Task<long> IncrementAsync(string key, TimeSpan? ttl = null, CancellationToken cancellationToken = default);
    Task<T> GetOrCreateAsync<T>(string key, Func<CancellationToken, Task<T>> factory, TimeSpan? ttl = null, CancellationToken cancellationToken = default);
}
