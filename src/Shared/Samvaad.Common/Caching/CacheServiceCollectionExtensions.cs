using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Samvaad.Common.Caching;

public static class CacheServiceCollectionExtensions
{
    public static IServiceCollection AddSamvaadRedisCache(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection("Redis");
        services.Configure<RedisCacheOptions>(section);

        var options = section.Get<RedisCacheOptions>() ?? new RedisCacheOptions();
        if (options.Enabled && !string.IsNullOrWhiteSpace(options.ConnectionString))
        {
            services.AddSingleton<IAppCache, RedisAppCache>();
        }
        else
        {
            services.AddSingleton<IAppCache, NoOpAppCache>();
        }

        return services;
    }
}
