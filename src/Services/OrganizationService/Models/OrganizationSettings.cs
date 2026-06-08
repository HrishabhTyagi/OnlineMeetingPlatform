namespace OrganizationService.Models;

public enum OrganizationStorageProvider
{
    ApplicationLocal,
    CustomerPremises,
    CloudMounted
}

public enum OrganizationMemberRole
{
    Owner,
    Admin,
    Member,
    Guest
}

public class OrganizationSettings
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "Samvaad Organization";
    public string? Slug { get; set; }
    public string? PrimaryDomain { get; set; }
    public OrganizationStorageProvider StorageProvider { get; set; } = OrganizationStorageProvider.ApplicationLocal;
    public string? StorageRootPath { get; set; }
    public string? PublicBaseUrl { get; set; }
    public int RecordingRetentionDays { get; set; } = 30;
    public int AttachmentRetentionDays { get; set; } = 30;
    public int MaxRecordingMegabytes { get; set; } = 750;
    public int MaxAttachmentMegabytes { get; set; } = 50;
    public bool EnableRecordingByDefault { get; set; }
    public bool RequireLobbyByDefault { get; set; } = true;
    public bool AllowExternalGuests { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class OrganizationMember
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public OrganizationMemberRole Role { get; set; } = OrganizationMemberRole.Member;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public OrganizationSettings? Organization { get; set; }
}

public class OrganizationAuditEvent
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public string OrganizationName { get; set; } = string.Empty;
    public Guid? ActorUserId { get; set; }
    public string? ActorEmail { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string? EntityId { get; set; }
    public string Summary { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class OrganizationFeatureToggle
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public string FeatureKey { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = true;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public OrganizationSettings? Organization { get; set; }
}

public class OrganizationSettingsDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string LocalAppUrl { get; set; } = string.Empty;
    public string? PrimaryDomain { get; set; }
    public string StorageProvider { get; set; } = string.Empty;
    public string? StorageRootPath { get; set; }
    public string? PublicBaseUrl { get; set; }
    public int RecordingRetentionDays { get; set; }
    public int AttachmentRetentionDays { get; set; }
    public int MaxRecordingMegabytes { get; set; }
    public int MaxAttachmentMegabytes { get; set; }
    public bool EnableRecordingByDefault { get; set; }
    public bool RequireLobbyByDefault { get; set; }
    public bool AllowExternalGuests { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class CreateOrganizationRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Slug { get; set; }
    public string? PrimaryDomain { get; set; }
}

public class OrganizationMemberDto
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Role { get; set; } = OrganizationMemberRole.Member.ToString();
    public DateTime JoinedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class OrganizationMembershipValidationDto
{
    public bool IsMember { get; set; }
    public Guid OrganizationId { get; set; }
    public string OrganizationName { get; set; } = string.Empty;
    public string OrganizationSlug { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = OrganizationMemberRole.Member.ToString();
}

public class AddOrganizationMemberRequest
{
    public Guid UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Role { get; set; } = OrganizationMemberRole.Member.ToString();
}

public class UpdateOrganizationMemberRequest
{
    public string Role { get; set; } = OrganizationMemberRole.Member.ToString();
}

public class UpdateOrganizationSettingsRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Slug { get; set; }
    public string? PrimaryDomain { get; set; }
    public string StorageProvider { get; set; } = OrganizationStorageProvider.ApplicationLocal.ToString();
    public string? StorageRootPath { get; set; }
    public string? PublicBaseUrl { get; set; }
    public int RecordingRetentionDays { get; set; } = 30;
    public int AttachmentRetentionDays { get; set; } = 30;
    public int MaxRecordingMegabytes { get; set; } = 750;
    public int MaxAttachmentMegabytes { get; set; } = 50;
    public bool EnableRecordingByDefault { get; set; }
    public bool RequireLobbyByDefault { get; set; } = true;
    public bool AllowExternalGuests { get; set; } = true;
}

public class OrganizationAuditEventDto
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public string OrganizationName { get; set; } = string.Empty;
    public Guid? ActorUserId { get; set; }
    public string? ActorEmail { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string? EntityId { get; set; }
    public string Summary { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class OrganizationRoleUsageDto
{
    public string Role { get; set; } = string.Empty;
    public int Count { get; set; }
}

public class OrganizationUsageDto
{
    public Guid OrganizationId { get; set; }
    public string OrganizationName { get; set; } = string.Empty;
    public string StorageProvider { get; set; } = string.Empty;
    public int MemberCount { get; set; }
    public List<OrganizationRoleUsageDto> RoleCounts { get; set; } = new();
    public int EstimatedActiveStorageGb { get; set; }
    public int MaxRecordingMegabytes { get; set; }
    public int MaxAttachmentMegabytes { get; set; }
    public int RecordingRetentionDays { get; set; }
    public int AttachmentRetentionDays { get; set; }
    public int AuditEventsLast30Days { get; set; }
    public DateTime? LastActivityAt { get; set; }
}

public class OrganizationFeatureToggleDto
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public bool DefaultEnabled { get; set; }
    public bool IsEnabled { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class UpdateOrganizationFeatureTogglesRequest
{
    public Dictionary<string, bool> Features { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}
