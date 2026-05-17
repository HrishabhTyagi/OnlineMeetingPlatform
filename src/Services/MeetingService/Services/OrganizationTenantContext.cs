namespace MeetingService.Services;

public interface IOrganizationTenantContext
{
    Guid? OrganizationId { get; }
    string? OrganizationSlug { get; }
}

public class OrganizationTenantContext : IOrganizationTenantContext
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public OrganizationTenantContext(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid? OrganizationId
    {
        get
        {
            var value = _httpContextAccessor.HttpContext?.Request.Headers["X-Organization-Id"].FirstOrDefault();
            return Guid.TryParse(value, out var organizationId) ? organizationId : null;
        }
    }

    public string? OrganizationSlug
    {
        get
        {
            var value = _httpContextAccessor.HttpContext?.Request.Headers["X-Organization-Slug"].FirstOrDefault();
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();
        }
    }
}
