using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrganizationService.Data;
using OrganizationService.Models;
using Samvaad.Common.Caching;

namespace OrganizationService.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrganizationsController : ControllerBase
{
    private static readonly TimeSpan OrganizationSettingsTtl = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan OrganizationUsageTtl = TimeSpan.FromSeconds(60);

    private readonly OrganizationDbContext _context;
    private readonly IAppCache _cache;
    private readonly ILogger<OrganizationsController> _logger;
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;

    public OrganizationsController(
        OrganizationDbContext context,
        IAppCache cache,
        ILogger<OrganizationsController> logger,
        IConfiguration configuration,
        IWebHostEnvironment environment)
    {
        _context = context;
        _cache = cache;
        _logger = logger;
        _configuration = configuration;
        _environment = environment;
    }

    [HttpGet]
    [Authorize]
    public async Task<ActionResult<List<OrganizationSettingsDto>>> GetOrganizations()
    {
        var version = await GetOrganizationCacheVersionAsync();
        var organizations = await _cache.GetOrCreateAsync(
            $"organizations:list:v{version}",
            async _ =>
            {
                var settings = await _context.OrganizationSettings
                    .OrderBy(item => item.Name)
                    .ThenBy(item => item.CreatedAt)
                    .ToListAsync();

                await EnsureSlugsAsync(settings);
                return settings.Select(MapToDto).ToList();
            },
            OrganizationSettingsTtl);

        return Ok(organizations);
    }

    [HttpGet("mine")]
    [Authorize]
    public async Task<ActionResult<List<OrganizationSettingsDto>>> GetMyOrganizations()
    {
        var userIdText = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var email = User.FindFirst(ClaimTypes.Email)?.Value?.Trim().ToLowerInvariant();
        Guid? userId = Guid.TryParse(userIdText, out var parsedUserId) ? parsedUserId : null;

        var version = await GetOrganizationCacheVersionAsync();
        var cacheKey = $"organizations:mine:v{version}:user-{userId?.ToString("N") ?? "none"}:email-{(string.IsNullOrWhiteSpace(email) ? "none" : CacheKey.Hash(email))}";
        var organizations = await _cache.GetOrCreateAsync(cacheKey, async _ =>
        {
            var settings = await _context.OrganizationMembers
                .Include(member => member.Organization)
                .Where(member =>
                    (userId.HasValue && member.UserId == userId.Value) ||
                    (!string.IsNullOrWhiteSpace(email) && member.Email.ToLower() == email))
                .Where(member => member.Organization != null)
                .Select(member => member.Organization!)
                .Distinct()
                .OrderBy(item => item.Name)
                .ThenBy(item => item.CreatedAt)
                .ToListAsync();

            await EnsureSlugsAsync(settings);
            return settings.Select(MapToDto).ToList();
        }, OrganizationSettingsTtl);

        return Ok(organizations);
    }

    [HttpGet("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<OrganizationSettingsDto>> GetOrganization(Guid id)
    {
        var version = await GetOrganizationCacheVersionAsync();
        var dto = await _cache.GetOrCreateAsync<OrganizationSettingsDto?>(
            $"organizations:id:{id:N}:v{version}",
            async _ =>
            {
                var settings = await _context.OrganizationSettings.FirstOrDefaultAsync(item => item.Id == id);
                if (settings == null)
                {
                    return null;
                }

                await EnsureSlugAsync(settings);
                return MapToDto(settings);
            },
            OrganizationSettingsTtl);

        if (dto == null)
        {
            return NotFound("Organization not found");
        }

        return Ok(dto);
    }

    [HttpGet("slug/{slug}")]
    [AllowAnonymous]
    public async Task<ActionResult<OrganizationSettingsDto>> GetOrganizationBySlug(string slug)
    {
        var normalizedSlug = NormalizeSlug(slug);
        var version = await GetOrganizationCacheVersionAsync();
        var dto = await _cache.GetOrCreateAsync<OrganizationSettingsDto?>(
            $"organizations:slug:{normalizedSlug}:v{version}",
            async _ =>
            {
                var settings = await _context.OrganizationSettings.FirstOrDefaultAsync(item => item.Slug == normalizedSlug);
                return settings == null ? null : MapToDto(settings);
            },
            OrganizationSettingsTtl);

        if (dto == null)
        {
            return NotFound("Organization not found");
        }

        return Ok(dto);
    }

    [HttpPost]
    [Authorize]
    public async Task<ActionResult<OrganizationSettingsDto>> CreateOrganization([FromBody] CreateOrganizationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Organization name is required");
        }

        var now = DateTime.UtcNow;
        var settings = new OrganizationSettings
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            Slug = await GenerateUniqueSlugAsync(request.Slug ?? request.Name),
            PrimaryDomain = NormalizeNullable(request.PrimaryDomain),
            CreatedAt = now,
            UpdatedAt = now
        };

        _context.OrganizationSettings.Add(settings);
        var creator = CreateCreatorMember(settings.Id);
        if (creator != null)
        {
            _context.OrganizationMembers.Add(creator);
        }

        AddAuditEvent(settings, "OrganizationCreated", "Organization", settings.Id.ToString(), $"Created organization {settings.Name}.");
        await _context.SaveChangesAsync();
        await BumpOrganizationCacheAsync();

        return CreatedAtAction(nameof(GetOrganization), new { id = settings.Id }, MapToDto(settings));
    }

    [HttpGet("current")]
    [Authorize]
    public async Task<ActionResult<OrganizationSettingsDto>> GetCurrent()
    {
        var version = await GetOrganizationCacheVersionAsync();
        var dto = await _cache.GetOrCreateAsync(
            $"organizations:current:{TenantHeaderCacheKey()}:v{version}",
            async _ => MapToDto(await GetOrCreateSettingsAsync()),
            OrganizationSettingsTtl);

        return Ok(dto);
    }

    [HttpGet("{id:guid}/usage")]
    [Authorize]
    public async Task<ActionResult<OrganizationUsageDto>> GetUsage(Guid id)
    {
        var version = await GetOrganizationCacheVersionAsync();
        var usage = await _cache.GetOrCreateAsync<OrganizationUsageDto?>(
            $"organizations:usage:{id:N}:v{version}",
            async _ =>
            {
                var settings = await _context.OrganizationSettings.FirstOrDefaultAsync(item => item.Id == id);
                if (settings == null)
                {
                    return null;
                }

                var roleCounts = await _context.OrganizationMembers
                    .Where(member => member.OrganizationId == id)
                    .GroupBy(member => member.Role)
                    .Select(group => new OrganizationRoleUsageDto
                    {
                        Role = group.Key.ToString(),
                        Count = group.Count()
                    })
                    .ToListAsync();

                var memberCount = roleCounts.Sum(item => item.Count);
                var since = DateTime.UtcNow.AddDays(-30);
                var auditEventsLast30Days = await _context.OrganizationAuditEvents
                    .CountAsync(item => item.OrganizationId == id && item.CreatedAt >= since);
                var lastAuditAt = await _context.OrganizationAuditEvents
                    .Where(item => item.OrganizationId == id)
                    .OrderByDescending(item => item.CreatedAt)
                    .Select(item => (DateTime?)item.CreatedAt)
                    .FirstOrDefaultAsync();

                return new OrganizationUsageDto
                {
                    OrganizationId = settings.Id,
                    OrganizationName = settings.Name,
                    StorageProvider = settings.StorageProvider.ToString(),
                    MemberCount = memberCount,
                    RoleCounts = roleCounts,
                    EstimatedActiveStorageGb = EstimateActiveStorageGb(settings),
                    MaxRecordingMegabytes = settings.MaxRecordingMegabytes,
                    MaxAttachmentMegabytes = settings.MaxAttachmentMegabytes,
                    RecordingRetentionDays = settings.RecordingRetentionDays,
                    AttachmentRetentionDays = settings.AttachmentRetentionDays,
                    AuditEventsLast30Days = auditEventsLast30Days,
                    LastActivityAt = lastAuditAt ?? settings.UpdatedAt
                };
            },
            OrganizationUsageTtl);

        if (usage == null)
        {
            return NotFound("Organization not found");
        }

        return Ok(usage);
    }

    [HttpGet("{id:guid}/audit")]
    [Authorize]
    public async Task<ActionResult<List<OrganizationAuditEventDto>>> GetAuditEvents(Guid id, [FromQuery] int take = 50)
    {
        var exists = await _context.OrganizationSettings.AnyAsync(item => item.Id == id);
        if (!exists)
        {
            return NotFound("Organization not found");
        }

        var limit = Clamp(take, 1, 200);
        var events = await _context.OrganizationAuditEvents
            .Where(item => item.OrganizationId == id)
            .OrderByDescending(item => item.CreatedAt)
            .Take(limit)
            .ToListAsync();

        return Ok(events.Select(MapAuditEventToDto).ToList());
    }

    [HttpPut("current")]
    [Authorize]
    public async Task<ActionResult<OrganizationSettingsDto>> UpdateCurrent([FromBody] UpdateOrganizationSettingsRequest request)
    {
        var settings = await GetOrCreateSettingsAsync();
        return await UpdateSettingsAsync(settings, request);
    }

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<OrganizationSettingsDto>> UpdateOrganization(Guid id, [FromBody] UpdateOrganizationSettingsRequest request)
    {
        var settings = await _context.OrganizationSettings.FirstOrDefaultAsync(item => item.Id == id);
        if (settings == null)
        {
            return NotFound("Organization not found");
        }

        return await UpdateSettingsAsync(settings, request);
    }

    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> DeleteOrganization(Guid id)
    {
        var settings = await _context.OrganizationSettings.FirstOrDefaultAsync(item => item.Id == id);
        if (settings == null)
        {
            return NotFound("Organization not found");
        }

        AddAuditEvent(settings, "OrganizationDeleted", "Organization", settings.Id.ToString(), $"Deleted organization {settings.Name}.");
        _context.OrganizationSettings.Remove(settings);
        await _context.SaveChangesAsync();
        await BumpOrganizationCacheAsync();

        return NoContent();
    }

    private async Task<ActionResult<OrganizationSettingsDto>> UpdateSettingsAsync(OrganizationSettings settings, UpdateOrganizationSettingsRequest request)
    {
        if (!Enum.TryParse<OrganizationStorageProvider>(request.StorageProvider, true, out var provider))
        {
            return BadRequest("Unsupported storage provider");
        }

        settings.Name = string.IsNullOrWhiteSpace(request.Name) ? "Samvaad Organization" : request.Name.Trim();
        var requestedSlug = string.IsNullOrWhiteSpace(request.Slug) ? settings.Slug ?? settings.Name : request.Slug;
        settings.Slug = await GenerateUniqueSlugAsync(requestedSlug, settings.Id);
        settings.PrimaryDomain = NormalizeNullable(request.PrimaryDomain);
        settings.StorageProvider = provider;
        settings.StorageRootPath = NormalizeNullable(request.StorageRootPath);
        settings.PublicBaseUrl = NormalizeUrl(request.PublicBaseUrl);
        settings.RecordingRetentionDays = Clamp(request.RecordingRetentionDays, 1, 3650);
        settings.AttachmentRetentionDays = Clamp(request.AttachmentRetentionDays, 1, 3650);
        settings.MaxRecordingMegabytes = Clamp(request.MaxRecordingMegabytes, 25, 4096);
        settings.MaxAttachmentMegabytes = Clamp(request.MaxAttachmentMegabytes, 1, 512);
        settings.EnableRecordingByDefault = request.EnableRecordingByDefault;
        settings.RequireLobbyByDefault = request.RequireLobbyByDefault;
        settings.AllowExternalGuests = request.AllowExternalGuests;
        settings.UpdatedAt = DateTime.UtcNow;

        AddAuditEvent(settings, "OrganizationUpdated", "Organization", settings.Id.ToString(), $"Updated organization settings for {settings.Name}.");
        await _context.SaveChangesAsync();
        await BumpOrganizationCacheAsync();
        return Ok(MapToDto(settings));
    }

    [HttpPost("current/storage/test")]
    [Authorize]
    public async Task<IActionResult> TestStorage()
    {
        var settings = await GetOrCreateSettingsAsync();
        return await TestStorageAsync(settings);
    }

    [HttpPost("{id:guid}/storage/test")]
    [Authorize]
    public async Task<IActionResult> TestOrganizationStorage(Guid id)
    {
        var settings = await _context.OrganizationSettings.FirstOrDefaultAsync(item => item.Id == id);
        if (settings == null)
        {
            return NotFound("Organization not found");
        }

        return await TestStorageAsync(settings);
    }

    [HttpGet("{id:guid}/members")]
    [Authorize]
    public async Task<ActionResult<List<OrganizationMemberDto>>> GetMembers(Guid id)
    {
        var exists = await _context.OrganizationSettings.AnyAsync(item => item.Id == id);
        if (!exists)
        {
            return NotFound("Organization not found");
        }

        var version = await GetOrganizationCacheVersionAsync();
        var members = await _cache.GetOrCreateAsync(
            $"organizations:{id:N}:members:v{version}",
            async _ => (await _context.OrganizationMembers
                .Where(member => member.OrganizationId == id)
                .OrderBy(member => member.DisplayName)
                .ThenBy(member => member.Email)
                .ToListAsync())
                .Select(MapMemberToDto)
                .ToList(),
            OrganizationSettingsTtl);

        return Ok(members);
    }

    [HttpPost("{id:guid}/members")]
    [Authorize]
    public async Task<ActionResult<OrganizationMemberDto>> AddMember(Guid id, [FromBody] AddOrganizationMemberRequest request)
    {
        var exists = await _context.OrganizationSettings.AnyAsync(item => item.Id == id);
        if (!exists)
        {
            return NotFound("Organization not found");
        }

        if (request.UserId == Guid.Empty)
        {
            return BadRequest("User is required");
        }

        if (string.IsNullOrWhiteSpace(request.Email))
        {
            return BadRequest("User email is required");
        }

        if (!Enum.TryParse<OrganizationMemberRole>(request.Role, true, out var role))
        {
            return BadRequest("Unsupported member role");
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var memberExists = await _context.OrganizationMembers.AnyAsync(member =>
            member.OrganizationId == id &&
            (member.UserId == request.UserId || member.Email.ToLower() == normalizedEmail));

        if (memberExists)
        {
            return Conflict("User is already a member of this organization");
        }

        var now = DateTime.UtcNow;
        var member = new OrganizationMember
        {
            Id = Guid.NewGuid(),
            OrganizationId = id,
            UserId = request.UserId,
            Email = normalizedEmail,
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? request.Email.Trim() : request.DisplayName.Trim(),
            Role = role,
            JoinedAt = now,
            UpdatedAt = now
        };

        _context.OrganizationMembers.Add(member);
        var settings = await _context.OrganizationSettings.FirstAsync(item => item.Id == id);
        AddAuditEvent(settings, "MemberAdded", "Member", member.Id.ToString(), $"Added {member.DisplayName} as {member.Role}.");
        await _context.SaveChangesAsync();
        await BumpOrganizationCacheAsync();

        return CreatedAtAction(nameof(GetMembers), new { id }, MapMemberToDto(member));
    }

    [HttpPut("{id:guid}/members/{memberId:guid}")]
    [Authorize]
    public async Task<ActionResult<OrganizationMemberDto>> UpdateMember(Guid id, Guid memberId, [FromBody] UpdateOrganizationMemberRequest request)
    {
        var member = await _context.OrganizationMembers.FirstOrDefaultAsync(item => item.Id == memberId && item.OrganizationId == id);
        if (member == null)
        {
            return NotFound("Organization member not found");
        }

        if (!Enum.TryParse<OrganizationMemberRole>(request.Role, true, out var role))
        {
            return BadRequest("Unsupported member role");
        }

        member.Role = role;
        member.UpdatedAt = DateTime.UtcNow;

        var settings = await _context.OrganizationSettings.FirstAsync(item => item.Id == id);
        AddAuditEvent(settings, "MemberRoleUpdated", "Member", member.Id.ToString(), $"Changed {member.DisplayName} role to {member.Role}.");
        await _context.SaveChangesAsync();
        await BumpOrganizationCacheAsync();
        return Ok(MapMemberToDto(member));
    }

    [HttpDelete("{id:guid}/members/{memberId:guid}")]
    [Authorize]
    public async Task<IActionResult> RemoveMember(Guid id, Guid memberId)
    {
        var member = await _context.OrganizationMembers.FirstOrDefaultAsync(item => item.Id == memberId && item.OrganizationId == id);
        if (member == null)
        {
            return NotFound("Organization member not found");
        }

        var settings = await _context.OrganizationSettings.FirstAsync(item => item.Id == id);
        AddAuditEvent(settings, "MemberRemoved", "Member", member.Id.ToString(), $"Removed {member.DisplayName} from the organization.");
        _context.OrganizationMembers.Remove(member);
        await _context.SaveChangesAsync();
        await BumpOrganizationCacheAsync();
        return NoContent();
    }

    private async Task<IActionResult> TestStorageAsync(OrganizationSettings settings)
    {
        try
        {
            var root = ResolveRootPath(settings);
            var directory = Path.Combine(root, "Recordings", settings.Id.ToString());
            Directory.CreateDirectory(directory);

            var probePath = Path.Combine(directory, ".samvaad-storage-test");
            await System.IO.File.WriteAllTextAsync(probePath, DateTime.UtcNow.ToString("O"));
            System.IO.File.Delete(probePath);
            AddAuditEvent(settings, "StorageTestSucceeded", "Storage", settings.Id.ToString(), "Storage path test succeeded.");
            await _context.SaveChangesAsync();
            return Ok(new { message = "Storage path is writable" });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Organization storage test failed");
            AddAuditEvent(settings, "StorageTestFailed", "Storage", settings.Id.ToString(), $"Storage path test failed: {ex.Message}");
            await _context.SaveChangesAsync();
            return BadRequest(ex.Message);
        }
    }

    [HttpGet("current/internal")]
    [AllowAnonymous]
    public async Task<ActionResult<OrganizationSettingsDto>> GetCurrentInternal()
    {
        if (!IsAuthorizedInternalRequest())
        {
            return Unauthorized();
        }

        var version = await GetOrganizationCacheVersionAsync();
        var dto = await _cache.GetOrCreateAsync(
            $"organizations:current-internal:{TenantHeaderCacheKey()}:v{version}",
            async _ => MapToDto(await GetOrCreateSettingsAsync()),
            OrganizationSettingsTtl);

        return Ok(dto);
    }

    private bool IsAuthorizedInternalRequest()
    {
        var expected = _configuration["InternalService:ApiKey"];
        if (string.IsNullOrWhiteSpace(expected))
        {
            return _environment.IsDevelopment();
        }

        var provided = Request.Headers["X-Samvaad-Internal-Key"].ToString();
        if (string.IsNullOrWhiteSpace(provided))
        {
            return false;
        }

        var expectedBytes = Encoding.UTF8.GetBytes(expected);
        var providedBytes = Encoding.UTF8.GetBytes(provided);
        return expectedBytes.Length == providedBytes.Length
            && CryptographicOperations.FixedTimeEquals(expectedBytes, providedBytes);
    }

    private async Task<OrganizationSettings> GetOrCreateSettingsAsync()
    {
        var tenantSettings = await FindByTenantHeadersAsync();
        return tenantSettings ?? await EnsureDefaultSettingsAsync();
    }

    private async Task<OrganizationSettings> EnsureDefaultSettingsAsync()
    {
        var settings = await _context.OrganizationSettings.OrderBy(item => item.CreatedAt).FirstOrDefaultAsync();
        if (settings != null)
        {
            await EnsureSlugAsync(settings);
            return settings;
        }

        settings = new OrganizationSettings
        {
            Id = Guid.NewGuid(),
            Slug = await GenerateUniqueSlugAsync("samvaad"),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.OrganizationSettings.Add(settings);
        await _context.SaveChangesAsync();
        return settings;
    }

    private static OrganizationSettingsDto MapToDto(OrganizationSettings settings)
    {
        var slug = string.IsNullOrWhiteSpace(settings.Slug) ? NormalizeSlug(settings.Name) : settings.Slug;
        return new OrganizationSettingsDto
        {
            Id = settings.Id,
            Name = settings.Name,
            Slug = slug,
            LocalAppUrl = BuildLocalAppUrl(slug),
            PrimaryDomain = settings.PrimaryDomain,
            StorageProvider = settings.StorageProvider.ToString(),
            StorageRootPath = settings.StorageRootPath,
            PublicBaseUrl = settings.PublicBaseUrl,
            RecordingRetentionDays = settings.RecordingRetentionDays,
            AttachmentRetentionDays = settings.AttachmentRetentionDays,
            MaxRecordingMegabytes = settings.MaxRecordingMegabytes,
            MaxAttachmentMegabytes = settings.MaxAttachmentMegabytes,
            EnableRecordingByDefault = settings.EnableRecordingByDefault,
            RequireLobbyByDefault = settings.RequireLobbyByDefault,
            AllowExternalGuests = settings.AllowExternalGuests,
            CreatedAt = settings.CreatedAt,
            UpdatedAt = settings.UpdatedAt
        };
    }

    private async Task<OrganizationSettings?> FindByTenantHeadersAsync()
    {
        var organizationId = Request.Headers["X-Organization-Id"].FirstOrDefault();
        if (Guid.TryParse(organizationId, out var parsedOrganizationId))
        {
            var settings = await _context.OrganizationSettings.FirstOrDefaultAsync(item => item.Id == parsedOrganizationId);
            if (settings != null)
            {
                await EnsureSlugAsync(settings);
                return settings;
            }
        }

        var slugHeader = Request.Headers["X-Organization-Slug"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(slugHeader))
        {
            var slug = NormalizeSlug(slugHeader);
            var settings = await _context.OrganizationSettings.FirstOrDefaultAsync(item => item.Slug == slug);
            if (settings != null)
            {
                return settings;
            }
        }

        return null;
    }

    private async Task EnsureSlugsAsync(IEnumerable<OrganizationSettings> organizations)
    {
        var changed = false;
        foreach (var organization in organizations.Where(item => string.IsNullOrWhiteSpace(item.Slug)))
        {
            organization.Slug = await GenerateUniqueSlugAsync(organization.Name, organization.Id);
            organization.UpdatedAt = DateTime.UtcNow;
            changed = true;
        }

        if (changed)
        {
            await _context.SaveChangesAsync();
        }
    }

    private async Task EnsureSlugAsync(OrganizationSettings settings)
    {
        if (!string.IsNullOrWhiteSpace(settings.Slug))
        {
            return;
        }

        settings.Slug = await GenerateUniqueSlugAsync(settings.Name, settings.Id);
        settings.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
    }

    private async Task<string> GenerateUniqueSlugAsync(string? source, Guid? currentOrganizationId = null)
    {
        var baseSlug = NormalizeSlug(source);
        var slug = baseSlug;
        var suffix = 2;

        while (await _context.OrganizationSettings.AnyAsync(item =>
            item.Slug == slug && (!currentOrganizationId.HasValue || item.Id != currentOrganizationId.Value)))
        {
            slug = $"{baseSlug}-{suffix}";
            suffix++;
        }

        return slug;
    }

    private OrganizationMember? CreateCreatorMember(Guid organizationId)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userId, out var parsedUserId))
        {
            return null;
        }

        var email = User.FindFirst(ClaimTypes.Email)?.Value;
        if (string.IsNullOrWhiteSpace(email))
        {
            return null;
        }

        var firstName = User.FindFirst(ClaimTypes.GivenName)?.Value;
        var lastName = User.FindFirst(ClaimTypes.Surname)?.Value;
        var displayName = $"{firstName} {lastName}".Trim();

        return new OrganizationMember
        {
            Id = Guid.NewGuid(),
            OrganizationId = organizationId,
            UserId = parsedUserId,
            Email = email.Trim().ToLowerInvariant(),
            DisplayName = string.IsNullOrWhiteSpace(displayName) ? email.Trim() : displayName,
            Role = OrganizationMemberRole.Owner,
            JoinedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
    }

    private static OrganizationMemberDto MapMemberToDto(OrganizationMember member)
    {
        return new OrganizationMemberDto
        {
            Id = member.Id,
            OrganizationId = member.OrganizationId,
            UserId = member.UserId,
            Email = member.Email,
            DisplayName = member.DisplayName,
            Role = member.Role.ToString(),
            JoinedAt = member.JoinedAt,
            UpdatedAt = member.UpdatedAt
        };
    }

    private void AddAuditEvent(OrganizationSettings settings, string action, string entityType, string? entityId, string summary)
    {
        Guid? actorUserId = null;
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (Guid.TryParse(userId, out var parsedActorUserId))
        {
            actorUserId = parsedActorUserId;
        }

        var actorEmail = User.FindFirst(ClaimTypes.Email)?.Value;
        _context.OrganizationAuditEvents.Add(new OrganizationAuditEvent
        {
            Id = Guid.NewGuid(),
            OrganizationId = settings.Id,
            OrganizationName = settings.Name,
            ActorUserId = actorUserId,
            ActorEmail = string.IsNullOrWhiteSpace(actorEmail) ? null : actorEmail.Trim().ToLowerInvariant(),
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Summary = summary,
            CreatedAt = DateTime.UtcNow
        });
    }

    private static OrganizationAuditEventDto MapAuditEventToDto(OrganizationAuditEvent auditEvent)
    {
        return new OrganizationAuditEventDto
        {
            Id = auditEvent.Id,
            OrganizationId = auditEvent.OrganizationId,
            OrganizationName = auditEvent.OrganizationName,
            ActorUserId = auditEvent.ActorUserId,
            ActorEmail = auditEvent.ActorEmail,
            Action = auditEvent.Action,
            EntityType = auditEvent.EntityType,
            EntityId = auditEvent.EntityId,
            Summary = auditEvent.Summary,
            CreatedAt = auditEvent.CreatedAt
        };
    }

    private static int EstimateActiveStorageGb(OrganizationSettings settings)
    {
        var recordingBudgetGb = Math.Max(1, (int)Math.Round((settings.MaxRecordingMegabytes * 20m) / 1024m));
        var attachmentBudgetGb = Math.Max(1, (int)Math.Round((settings.MaxAttachmentMegabytes * 500m) / 1024m));
        var retentionMultiplier = Math.Max(settings.RecordingRetentionDays, settings.AttachmentRetentionDays) / 30m;
        return Math.Max(1, (int)Math.Round((recordingBudgetGb + attachmentBudgetGb) * retentionMultiplier));
    }

    private string ResolveRootPath(OrganizationSettings settings)
    {
        if (settings.StorageProvider == OrganizationStorageProvider.ApplicationLocal || string.IsNullOrWhiteSpace(settings.StorageRootPath))
        {
            return HttpContext.RequestServices.GetRequiredService<IWebHostEnvironment>().ContentRootPath;
        }

        return Environment.ExpandEnvironmentVariables(settings.StorageRootPath.Trim());
    }

    private static int Clamp(int value, int min, int max)
    {
        return Math.Min(max, Math.Max(min, value));
    }

    private static string? NormalizeNullable(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string? NormalizeUrl(string? value)
    {
        return NormalizeNullable(value)?.TrimEnd('/');
    }

    private static string NormalizeSlug(string? value)
    {
        var raw = string.IsNullOrWhiteSpace(value) ? "organization" : value.Trim().ToLowerInvariant();
        var safe = new string(raw.Select(character => char.IsLetterOrDigit(character) ? character : '-').ToArray());
        var parts = safe.Split('-', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var slug = string.Join("-", parts);

        if (string.IsNullOrWhiteSpace(slug))
        {
            slug = "organization";
        }

        var trimmed = slug.Length <= 80 ? slug : slug[..80].TrimEnd('-');
        return string.IsNullOrWhiteSpace(trimmed) ? "organization" : trimmed;
    }

    private static string BuildLocalAppUrl(string slug)
    {
        return $"http://localhost:5173/org/{Uri.EscapeDataString(slug)}";
    }

    private async Task<long> GetOrganizationCacheVersionAsync()
    {
        return await _cache.GetOrCreateAsync("organizations:version", _ => Task.FromResult(1L), TimeSpan.FromDays(30));
    }

    private Task BumpOrganizationCacheAsync()
    {
        return _cache.IncrementAsync("organizations:version", TimeSpan.FromDays(30));
    }

    private string TenantHeaderCacheKey()
    {
        var organizationId = Request.Headers["X-Organization-Id"].FirstOrDefault();
        if (Guid.TryParse(organizationId, out var parsedOrganizationId))
        {
            return CacheKey.Tenant(parsedOrganizationId);
        }

        return CacheKey.Tenant(null, Request.Headers["X-Organization-Slug"].FirstOrDefault());
    }
}
