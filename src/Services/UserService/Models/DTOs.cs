namespace UserService.Models;

public class RegisterRequest
{
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class LoginRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class LoginResponse
{
    public Guid UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Status { get; set; } = UserPresenceStatuses.Available;
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
}

public class UserProfileDto
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string FullName => $"{FirstName} {LastName}";
    public string? ProfilePictureUrl { get; set; }
    public string? PhoneNumber { get; set; }
    public string Status { get; set; } = UserPresenceStatuses.Available;
    public bool IsEmailVerified { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class UpdateProfileRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string? ProfilePictureUrl { get; set; }
}

public class UpdateUserStatusRequest
{
    public string Status { get; set; } = UserPresenceStatuses.Available;
}
