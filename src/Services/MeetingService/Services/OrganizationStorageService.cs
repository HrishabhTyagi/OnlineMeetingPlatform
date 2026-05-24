using System.Net.Http.Json;
using Samvaad.Common.Caching;

namespace MeetingService.Services;

public enum OrganizationFileKind
{
    Recording,
    ChatAttachment
}

public enum OrganizationStorageProvider
{
    ApplicationLocal,
    CustomerPremises,
    CloudMounted
}

public sealed class OrganizationStorageSettings
{
    public string StorageProvider { get; set; } = OrganizationStorageProvider.ApplicationLocal.ToString();
    public string? StorageRootPath { get; set; }
    public string? PublicBaseUrl { get; set; }
    public int RecordingRetentionDays { get; set; } = 30;
    public int AttachmentRetentionDays { get; set; } = 30;
    public int MaxRecordingMegabytes { get; set; } = 750;
    public int MaxAttachmentMegabytes { get; set; } = 50;
}

public sealed class StoredOrganizationFile
{
    public string PublicUrl { get; set; } = string.Empty;
    public string PhysicalPath { get; set; } = string.Empty;
}

public interface IOrganizationStorageService
{
    Task<OrganizationStorageSettings> GetSettingsAsync();
    Task<StoredOrganizationFile> SaveAsync(OrganizationFileKind kind, Guid ownerId, IFormFile file, string storedFileName, CancellationToken cancellationToken = default);
    Task<string?> GetPhysicalPathAsync(OrganizationFileKind kind, Guid ownerId, string fileName);
    Task DeleteAsync(OrganizationFileKind kind, Guid ownerId, string fileName);
}

public class OrganizationStorageService : IOrganizationStorageService
{
    private static readonly TimeSpan SettingsTtl = TimeSpan.FromSeconds(60);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IWebHostEnvironment _environment;
    private readonly IOrganizationTenantContext _tenantContext;
    private readonly IAppCache _cache;
    private readonly ILogger<OrganizationStorageService> _logger;

    public OrganizationStorageService(
        IHttpClientFactory httpClientFactory,
        IWebHostEnvironment environment,
        IOrganizationTenantContext tenantContext,
        IAppCache cache,
        ILogger<OrganizationStorageService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _environment = environment;
        _tenantContext = tenantContext;
        _cache = cache;
        _logger = logger;
    }

    public async Task<OrganizationStorageSettings> GetSettingsAsync()
    {
        if (!_tenantContext.OrganizationId.HasValue)
        {
            return new OrganizationStorageSettings();
        }

        var cacheKey = $"organization-storage:{CacheKey.Tenant(_tenantContext.OrganizationId, _tenantContext.OrganizationSlug)}";
        return await _cache.GetOrCreateAsync(cacheKey, async _ =>
        {
            try
            {
                var client = _httpClientFactory.CreateClient("OrganizationService");
                using var request = new HttpRequestMessage(HttpMethod.Get, "/api/organizations/current/internal");
                if (_tenantContext.OrganizationId.HasValue)
                {
                    request.Headers.TryAddWithoutValidation("X-Organization-Id", _tenantContext.OrganizationId.Value.ToString());
                }

                if (!string.IsNullOrWhiteSpace(_tenantContext.OrganizationSlug))
                {
                    request.Headers.TryAddWithoutValidation("X-Organization-Slug", _tenantContext.OrganizationSlug);
                }

                using var response = await client.SendAsync(request);
                response.EnsureSuccessStatusCode();
                var settings = await response.Content.ReadFromJsonAsync<OrganizationStorageSettings>();
                return settings ?? new OrganizationStorageSettings();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "OrganizationService settings unavailable. Falling back to application-local storage.");
                return new OrganizationStorageSettings();
            }
        }, SettingsTtl);
    }

    public async Task<StoredOrganizationFile> SaveAsync(OrganizationFileKind kind, Guid ownerId, IFormFile file, string storedFileName, CancellationToken cancellationToken = default)
    {
        var safeFileName = Path.GetFileName(storedFileName);
        var settings = await GetSettingsAsync();
        var directory = GetResourceDirectory(settings, kind, ownerId);
        Directory.CreateDirectory(directory);

        var filePath = Path.Combine(directory, safeFileName);
        await using (var stream = File.Create(filePath))
        {
            await file.CopyToAsync(stream, cancellationToken);
        }

        return new StoredOrganizationFile
        {
            PhysicalPath = filePath,
            PublicUrl = BuildPublicUrl(settings, kind, ownerId, safeFileName)
        };
    }

    public async Task<string?> GetPhysicalPathAsync(OrganizationFileKind kind, Guid ownerId, string fileName)
    {
        var settings = await GetSettingsAsync();
        var safeFileName = Path.GetFileName(fileName);
        var filePath = Path.Combine(GetResourceDirectory(settings, kind, ownerId), safeFileName);
        return File.Exists(filePath) ? filePath : null;
    }

    public async Task DeleteAsync(OrganizationFileKind kind, Guid ownerId, string fileName)
    {
        var filePath = await GetPhysicalPathAsync(kind, ownerId, fileName);
        if (filePath != null)
        {
            File.Delete(filePath);
        }
    }

    private string GetResourceDirectory(OrganizationStorageSettings settings, OrganizationFileKind kind, Guid ownerId)
    {
        var root = ResolveRootPath(settings);
        return Path.Combine(root, GetPhysicalFolderName(kind), ownerId.ToString());
    }

    private string ResolveRootPath(OrganizationStorageSettings settings)
    {
        var provider = ParseProvider(settings.StorageProvider);
        if (provider == OrganizationStorageProvider.ApplicationLocal || string.IsNullOrWhiteSpace(settings.StorageRootPath))
        {
            return _environment.ContentRootPath;
        }

        return Environment.ExpandEnvironmentVariables(settings.StorageRootPath.Trim());
    }

    private string BuildPublicUrl(OrganizationStorageSettings settings, OrganizationFileKind kind, Guid ownerId, string fileName)
    {
        if (!string.IsNullOrWhiteSpace(settings.PublicBaseUrl))
        {
            var baseUrl = settings.PublicBaseUrl.TrimEnd('/');
            return $"{baseUrl}/{GetPublicFolderName(kind)}/{ownerId}/{Uri.EscapeDataString(fileName)}";
        }

        return kind == OrganizationFileKind.Recording
            ? $"/api/meetings/{ownerId}/recordings/{Uri.EscapeDataString(fileName)}"
            : $"/api/conversations/{ownerId}/attachments/{Uri.EscapeDataString(fileName)}";
    }

    private static OrganizationStorageProvider ParseProvider(string? value)
    {
        return Enum.TryParse<OrganizationStorageProvider>(value, true, out var provider)
            ? provider
            : OrganizationStorageProvider.ApplicationLocal;
    }

    private static string GetPhysicalFolderName(OrganizationFileKind kind)
    {
        return kind == OrganizationFileKind.Recording ? "Recordings" : "ChatAttachments";
    }

    private static string GetPublicFolderName(OrganizationFileKind kind)
    {
        return kind == OrganizationFileKind.Recording ? "recordings" : "chat-attachments";
    }
}
