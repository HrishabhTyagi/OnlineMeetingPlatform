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
    public string? RememberDeviceToken { get; set; }
}

public class LoginResponse
{
    public Guid UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? ProfilePictureUrl { get; set; }
    public string Status { get; set; } = UserPresenceStatuses.Available;
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public bool RequiresMfa { get; set; }
    public string? MfaToken { get; set; }
    public bool MfaEnabled { get; set; }
    public string? RememberDeviceToken { get; set; }
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
    public bool MfaEnabled { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class VerifyMfaLoginRequest
{
    public string MfaToken { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public bool RememberDevice { get; set; }
}

public class MfaStatusResponse
{
    public bool Enabled { get; set; }
    public DateTime? EnabledAt { get; set; }
    public DateTime? LastVerifiedAt { get; set; }
    public bool RememberDeviceActive { get; set; }
    public DateTime? RememberDeviceExpiresAt { get; set; }
}

public class MfaSetupResponse
{
    public string Secret { get; set; } = string.Empty;
    public string OtpAuthUri { get; set; } = string.Empty;
}

public class MfaEnableRequest
{
    public string Code { get; set; } = string.Empty;
}

public class MfaDisableRequest
{
    public string Password { get; set; } = string.Empty;
    public string? Code { get; set; }
}

public class MfaRecoveryCodesResponse
{
    public List<string> RecoveryCodes { get; set; } = new();
}

public class MfaRegenerateRecoveryCodesRequest
{
    public string Code { get; set; } = string.Empty;
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
