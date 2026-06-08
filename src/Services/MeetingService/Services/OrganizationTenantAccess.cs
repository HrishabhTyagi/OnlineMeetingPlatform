using System.Net;
using System.Security.Claims;
using System.Text.Json;

namespace MeetingService.Services;

public interface IOrganizationTenantAccessValidator
{
    Task<OrganizationTenantAccessResult> ValidateAsync(ClaimsPrincipal user, CancellationToken cancellationToken = default);
}

public sealed record OrganizationTenantAccessResult(bool IsAllowed, int StatusCode, string? Message = null)
{
    public static OrganizationTenantAccessResult Allowed() => new(true, StatusCodes.Status200OK);
    public static OrganizationTenantAccessResult Unauthorized(string message) => new(false, StatusCodes.Status401Unauthorized, message);
    public static OrganizationTenantAccessResult Forbidden(string message) => new(false, StatusCodes.Status403Forbidden, message);
    public static OrganizationTenantAccessResult NotFound(string message) => new(false, StatusCodes.Status404NotFound, message);
}

public sealed class OrganizationTenantAccessValidator : IOrganizationTenantAccessValidator
{
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IOrganizationTenantContext _tenantContext;
    private readonly ILogger<OrganizationTenantAccessValidator> _logger;

    public OrganizationTenantAccessValidator(
        IHttpContextAccessor httpContextAccessor,
        IHttpClientFactory httpClientFactory,
        IOrganizationTenantContext tenantContext,
        ILogger<OrganizationTenantAccessValidator> logger)
    {
        _httpContextAccessor = httpContextAccessor;
        _httpClientFactory = httpClientFactory;
        _tenantContext = tenantContext;
        _logger = logger;
    }

    public async Task<OrganizationTenantAccessResult> ValidateAsync(ClaimsPrincipal user, CancellationToken cancellationToken = default)
    {
        if (!_tenantContext.OrganizationId.HasValue && string.IsNullOrWhiteSpace(_tenantContext.OrganizationSlug))
        {
            return OrganizationTenantAccessResult.Allowed();
        }

        var allowAnonymous = _httpContextAccessor.HttpContext?
            .GetEndpoint()?
            .Metadata
            .GetMetadata<Microsoft.AspNetCore.Authorization.IAllowAnonymous>() != null;
        if (user.Identity?.IsAuthenticated != true)
        {
            if (allowAnonymous)
            {
                return OrganizationTenantAccessResult.Allowed();
            }

            return OrganizationTenantAccessResult.Unauthorized("Sign in to access this organization.");
        }

        var userId = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var email = user.FindFirst(ClaimTypes.Email)?.Value;
        if (string.IsNullOrWhiteSpace(userId) && string.IsNullOrWhiteSpace(email))
        {
            return OrganizationTenantAccessResult.Unauthorized("Signed-in user identity is incomplete.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/organizations/current/membership/internal");
        if (_tenantContext.OrganizationId.HasValue)
        {
            request.Headers.TryAddWithoutValidation("X-Organization-Id", _tenantContext.OrganizationId.Value.ToString());
        }

        if (!string.IsNullOrWhiteSpace(_tenantContext.OrganizationSlug))
        {
            request.Headers.TryAddWithoutValidation("X-Organization-Slug", _tenantContext.OrganizationSlug);
        }

        if (!string.IsNullOrWhiteSpace(userId))
        {
            request.Headers.TryAddWithoutValidation("X-User-Id", userId);
        }

        if (!string.IsNullOrWhiteSpace(email))
        {
            request.Headers.TryAddWithoutValidation("X-User-Email", email);
        }

        var client = _httpClientFactory.CreateClient("OrganizationService");
        try
        {
            using var response = await client.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                await UpdateTenantHeadersFromValidatedOrganizationAsync(response, cancellationToken);
                return OrganizationTenantAccessResult.Allowed();
            }

            return response.StatusCode switch
            {
                HttpStatusCode.Unauthorized => OrganizationTenantAccessResult.Unauthorized("Organization validation failed."),
                HttpStatusCode.Forbidden => OrganizationTenantAccessResult.Forbidden("You are not a member of this organization."),
                HttpStatusCode.NotFound => OrganizationTenantAccessResult.NotFound("Organization not found."),
                _ => OrganizationTenantAccessResult.Forbidden("Organization access could not be verified.")
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unable to validate organization membership");
            return OrganizationTenantAccessResult.Forbidden("Organization access could not be verified.");
        }
    }

    private async Task UpdateTenantHeadersFromValidatedOrganizationAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var httpContext = _httpContextAccessor.HttpContext;
        if (httpContext == null)
        {
            return;
        }

        var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var membership = await JsonSerializer.DeserializeAsync<OrganizationMembershipValidationResponse>(
            stream,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true },
            cancellationToken);

        if (membership == null || membership.OrganizationId == Guid.Empty)
        {
            return;
        }

        httpContext.Request.Headers["X-Organization-Id"] = membership.OrganizationId.ToString();
        if (!string.IsNullOrWhiteSpace(membership.OrganizationSlug))
        {
            httpContext.Request.Headers["X-Organization-Slug"] = membership.OrganizationSlug;
        }
    }

    private sealed class OrganizationMembershipValidationResponse
    {
        public Guid OrganizationId { get; set; }
        public string OrganizationSlug { get; set; } = string.Empty;
    }
}

public sealed class OrganizationTenantAccessMiddleware
{
    private readonly RequestDelegate _next;

    public OrganizationTenantAccessMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, IOrganizationTenantAccessValidator validator)
    {
        var result = await validator.ValidateAsync(context.User, context.RequestAborted);
        if (!result.IsAllowed)
        {
            context.Response.StatusCode = result.StatusCode;
            if (!string.IsNullOrWhiteSpace(result.Message))
            {
                await context.Response.WriteAsync(result.Message, context.RequestAborted);
            }
            return;
        }

        await _next(context);
    }
}
