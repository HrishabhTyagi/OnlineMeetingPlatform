using System.Security.Cryptography;
using System.Text;

namespace Samvaad.Common.Caching;

public static class CacheKey
{
    public static string Tenant(Guid? organizationId, string? organizationSlug = null)
    {
        if (organizationId.HasValue)
        {
            return $"org-{organizationId.Value:N}";
        }

        return string.IsNullOrWhiteSpace(organizationSlug)
            ? "personal"
            : $"slug-{Normalize(organizationSlug)}";
    }

    public static string Normalize(string value)
    {
        var normalized = new string(value
            .Trim()
            .ToLowerInvariant()
            .Select(character => char.IsLetterOrDigit(character) ? character : '-')
            .ToArray());

        var collapsed = string.Join('-', normalized.Split('-', StringSplitOptions.RemoveEmptyEntries));
        return string.IsNullOrWhiteSpace(collapsed) ? "default" : collapsed;
    }

    public static string Hash(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value.Trim().ToLowerInvariant()));
        return Convert.ToHexString(bytes).ToLowerInvariant()[..16];
    }
}
