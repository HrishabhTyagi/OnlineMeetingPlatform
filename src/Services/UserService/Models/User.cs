namespace UserService.Models;

public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public bool IsEmailVerified { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public bool IsActive { get; set; } = true;
    public string? ProfilePictureUrl { get; set; }
    public string? PhoneNumber { get; set; }
    public string Status { get; set; } = UserPresenceStatuses.Available;
}

public static class UserPresenceStatuses
{
    public const string Available = "Available";
    public const string Busy = "Busy";
    public const string DoNotDisturb = "DoNotDisturb";
    public const string BeRightBack = "BeRightBack";
    public const string Away = "Away";
    public const string Offline = "Offline";

    public static readonly HashSet<string> Allowed = new(StringComparer.OrdinalIgnoreCase)
    {
        Available,
        Busy,
        DoNotDisturb,
        BeRightBack,
        Away,
        Offline
    };

    public static string Normalize(string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return Available;
        }

        return Allowed.FirstOrDefault(item => string.Equals(item, status.Trim(), StringComparison.OrdinalIgnoreCase))
            ?? Available;
    }
}
