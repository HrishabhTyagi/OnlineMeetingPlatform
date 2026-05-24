using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using UserService.Models;
using UserService.Services;

namespace UserService.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsersController : ControllerBase
{
    private const long MaxAvatarBytes = 5 * 1024 * 1024;
    private static readonly Dictionary<string, string> AvatarExtensionsByContentType = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = ".jpg",
        ["image/png"] = ".png",
        ["image/webp"] = ".webp",
        ["image/gif"] = ".gif"
    };

    private readonly IUserService _userService;
    private readonly IAuthService _authService;
    private readonly IMfaService _mfaService;
    private readonly ILogger<UsersController> _logger;
    private readonly IWebHostEnvironment _environment;

    public UsersController(
        IUserService userService,
        IAuthService authService,
        IMfaService mfaService,
        ILogger<UsersController> logger,
        IWebHostEnvironment environment)
    {
        _userService = userService;
        _authService = authService;
        _mfaService = mfaService;
        _logger = logger;
        _environment = environment;
    }

    [HttpGet]
    public async Task<ActionResult<List<UserProfileDto>>> SearchUsers([FromQuery] string? query)
    {
        try
        {
            Guid? currentUserId = null;
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (Guid.TryParse(userId, out var parsedUserId))
            {
                currentUserId = parsedUserId;
            }

            var users = await _userService.SearchUsersAsync(query, currentUserId);
            return Ok(users.Select(MapToDto).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching users");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet("profile")]
    public async Task<ActionResult<UserProfileDto>> GetProfile()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!Guid.TryParse(userId, out var id))
                return Unauthorized();

            var user = await _userService.GetUserByIdAsync(id);
            if (user == null)
                return NotFound("User not found");

            return Ok(MapToDto(user));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching profile");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPut("profile")]
    public async Task<ActionResult<UserProfileDto>> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!Guid.TryParse(userId, out var id))
                return Unauthorized();

            var user = await _userService.UpdateUserAsync(id, request);
            _logger.LogInformation("User profile updated: {UserId}", id);

            return Ok(MapToDto(user));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating profile");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPost("profile/avatar")]
    [RequestSizeLimit(MaxAvatarBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxAvatarBytes)]
    public async Task<ActionResult<UserProfileDto>> UploadAvatar([FromForm] IFormFile file)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!Guid.TryParse(userId, out var id))
                return Unauthorized();

            if (file == null || file.Length == 0)
                return BadRequest("Avatar image is required");

            if (file.Length > MaxAvatarBytes)
                return BadRequest("Avatar must be 5 MB or smaller");

            if (!AvatarExtensionsByContentType.TryGetValue(file.ContentType, out var extension))
                return BadRequest("Avatar must be a JPG, PNG, WebP, or GIF image");

            var currentUser = await _userService.GetUserByIdAsync(id);
            if (currentUser == null)
                return NotFound("User not found");

            var avatarDirectory = Path.Combine(_environment.ContentRootPath, "UserAvatars", id.ToString());
            Directory.CreateDirectory(avatarDirectory);

            var fileName = $"{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}{extension}";
            var filePath = Path.Combine(avatarDirectory, fileName);

            await using (var stream = System.IO.File.Create(filePath))
            {
                await file.CopyToAsync(stream);
            }

            DeleteLocalAvatar(currentUser.ProfilePictureUrl);

            var avatarUrl = $"/user-avatars/{id}/{fileName}";
            var user = await _userService.UpdateAvatarAsync(id, avatarUrl);
            return Ok(MapToDto(user));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading avatar");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpDelete("profile/avatar")]
    public async Task<ActionResult<UserProfileDto>> RemoveAvatar()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!Guid.TryParse(userId, out var id))
                return Unauthorized();

            var currentUser = await _userService.GetUserByIdAsync(id);
            if (currentUser == null)
                return NotFound("User not found");

            DeleteLocalAvatar(currentUser.ProfilePictureUrl);
            var user = await _userService.UpdateAvatarAsync(id, null);
            return Ok(MapToDto(user));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing avatar");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPut("status")]
    public async Task<ActionResult<UserProfileDto>> UpdateStatus([FromBody] UpdateUserStatusRequest request)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!Guid.TryParse(userId, out var id))
                return Unauthorized();

            if (!UserPresenceStatuses.Allowed.Contains(request.Status))
                return BadRequest("Invalid status");

            var user = await _userService.UpdateStatusAsync(id, request.Status);
            _logger.LogInformation("User status updated: {UserId}, {Status}", id, user.Status);

            return Ok(MapToDto(user));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating status");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet("{id}")]
    [AllowAnonymous]
    public async Task<ActionResult<UserProfileDto>> GetUserById(Guid id)
    {
        try
        {
            var user = await _userService.GetUserByIdAsync(id);
            if (user == null)
                return NotFound("User not found");

            return Ok(MapToDto(user));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching user");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet("mfa/status")]
    public async Task<ActionResult<MfaStatusResponse>> GetMfaStatus()
    {
        try
        {
            var user = await GetCurrentSecurityUserAsync();
            if (user == null)
            {
                return Unauthorized();
            }

            return Ok(BuildMfaStatusResponse(user));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching MFA status");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPost("mfa/setup")]
    public async Task<ActionResult<MfaSetupResponse>> SetupMfa()
    {
        try
        {
            var user = await GetCurrentSecurityUserAsync();
            if (user == null)
            {
                return Unauthorized();
            }

            if (user.MfaEnabled)
            {
                return BadRequest("MFA is already enabled");
            }

            var secret = _mfaService.GenerateSecret();
            user.MfaSecretProtected = _mfaService.ProtectSecret(secret);
            user.MfaRecoveryCodeHashes = null;
            user.MfaRememberDeviceTokenHash = null;
            user.MfaRememberDeviceExpiresAt = null;
            await _userService.SaveUserSecurityAsync(user);

            return Ok(new MfaSetupResponse
            {
                Secret = secret,
                OtpAuthUri = _mfaService.BuildOtpAuthUri(user, secret)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error starting MFA setup");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPost("mfa/enable")]
    public async Task<ActionResult<MfaRecoveryCodesResponse>> EnableMfa([FromBody] MfaEnableRequest request)
    {
        try
        {
            var user = await GetCurrentSecurityUserAsync();
            if (user == null)
            {
                return Unauthorized();
            }

            if (string.IsNullOrWhiteSpace(user.MfaSecretProtected))
            {
                return BadRequest("Start MFA setup first");
            }

            if (!_mfaService.VerifyUserCode(user, request.Code))
            {
                return Unauthorized("Invalid MFA code");
            }

            var recoveryCodes = _mfaService.GenerateRecoveryCodes();
            user.MfaRecoveryCodeHashes = string.Join(';', recoveryCodes.Select(code => _mfaService.HashRecoveryCode(user.Id, code)));
            user.MfaEnabled = true;
            user.MfaEnabledAt = DateTime.UtcNow;
            user.MfaLastVerifiedAt = DateTime.UtcNow;
            await _userService.SaveUserSecurityAsync(user);

            return Ok(new MfaRecoveryCodesResponse { RecoveryCodes = recoveryCodes });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error enabling MFA");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPost("mfa/disable")]
    public async Task<ActionResult<MfaStatusResponse>> DisableMfa([FromBody] MfaDisableRequest request)
    {
        try
        {
            var user = await GetCurrentSecurityUserAsync();
            if (user == null)
            {
                return Unauthorized();
            }

            if (!_authService.VerifyPassword(request.Password, user.PasswordHash))
            {
                return Unauthorized("Invalid password");
            }

            if (user.MfaEnabled && !_mfaService.VerifyUserCode(user, request.Code ?? string.Empty))
            {
                return Unauthorized("Invalid MFA code");
            }

            user.MfaEnabled = false;
            user.MfaSecretProtected = null;
            user.MfaRecoveryCodeHashes = null;
            user.MfaEnabledAt = null;
            user.MfaLastVerifiedAt = null;
            user.MfaRememberDeviceTokenHash = null;
            user.MfaRememberDeviceExpiresAt = null;
            await _userService.SaveUserSecurityAsync(user);

            return Ok(BuildMfaStatusResponse(user));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error disabling MFA");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPost("mfa/recovery-codes/regenerate")]
    public async Task<ActionResult<MfaRecoveryCodesResponse>> RegenerateRecoveryCodes([FromBody] MfaRegenerateRecoveryCodesRequest request)
    {
        try
        {
            var user = await GetCurrentSecurityUserAsync();
            if (user == null)
            {
                return Unauthorized();
            }

            if (!user.MfaEnabled)
            {
                return BadRequest("MFA is not enabled");
            }

            if (!_mfaService.VerifyUserCode(user, request.Code))
            {
                return Unauthorized("Invalid MFA code");
            }

            var recoveryCodes = _mfaService.GenerateRecoveryCodes();
            user.MfaRecoveryCodeHashes = string.Join(';', recoveryCodes.Select(code => _mfaService.HashRecoveryCode(user.Id, code)));
            user.MfaLastVerifiedAt = DateTime.UtcNow;
            await _userService.SaveUserSecurityAsync(user);

            return Ok(new MfaRecoveryCodesResponse { RecoveryCodes = recoveryCodes });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error regenerating MFA recovery codes");
            return StatusCode(500, "An error occurred");
        }
    }

    private static UserProfileDto MapToDto(User user)
    {
        return new UserProfileDto
        {
            Id = user.Id,
            Email = user.Email,
            FirstName = user.FirstName,
            LastName = user.LastName,
            ProfilePictureUrl = user.ProfilePictureUrl,
            PhoneNumber = user.PhoneNumber,
            Status = user.Status,
            IsEmailVerified = user.IsEmailVerified,
            MfaEnabled = user.MfaEnabled,
            CreatedAt = user.CreatedAt
        };
    }

    private async Task<User?> GetCurrentSecurityUserAsync()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(userId, out var id)
            ? await _userService.GetUserWithSecurityByIdAsync(id)
            : null;
    }

    private static MfaStatusResponse BuildMfaStatusResponse(User user)
    {
        return new MfaStatusResponse
        {
            Enabled = user.MfaEnabled,
            EnabledAt = user.MfaEnabledAt,
            LastVerifiedAt = user.MfaLastVerifiedAt,
            RememberDeviceActive = !string.IsNullOrWhiteSpace(user.MfaRememberDeviceTokenHash)
                && user.MfaRememberDeviceExpiresAt != null
                && user.MfaRememberDeviceExpiresAt > DateTime.UtcNow,
            RememberDeviceExpiresAt = user.MfaRememberDeviceExpiresAt
        };
    }

    private void DeleteLocalAvatar(string? profilePictureUrl)
    {
        if (string.IsNullOrWhiteSpace(profilePictureUrl) || !profilePictureUrl.StartsWith("/user-avatars/", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var relativePath = profilePictureUrl["/user-avatars/".Length..].Replace('/', Path.DirectorySeparatorChar);
        var avatarRoot = Path.GetFullPath(Path.Combine(_environment.ContentRootPath, "UserAvatars"));
        var filePath = Path.GetFullPath(Path.Combine(avatarRoot, relativePath));
        if (!filePath.StartsWith(avatarRoot, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        if (System.IO.File.Exists(filePath))
        {
            System.IO.File.Delete(filePath);
        }
    }
}
