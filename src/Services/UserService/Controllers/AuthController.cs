using System.Net.Mail;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using UserService.Models;
using UserService.Services;

namespace UserService.Controllers;

[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting("auth")]
public class AuthController : ControllerBase
{
    private readonly IUserService _userService;
    private readonly IAuthService _authService;
    private readonly IMfaService _mfaService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(IUserService userService, IAuthService authService, IMfaService mfaService, ILogger<AuthController> logger)
    {
        _userService = userService;
        _authService = authService;
        _mfaService = mfaService;
        _logger = logger;
    }

    [HttpPost("register")]
    public async Task<ActionResult<LoginResponse>> Register([FromBody] RegisterRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
                return BadRequest("Email and password are required");

            if (!IsValidEmail(request.Email))
                return BadRequest("A valid email address is required");

            if (request.Password.Length < 8)
                return BadRequest("Password must be at least 8 characters");

            if (await _userService.UserExistsAsync(request.Email))
                return BadRequest("User already exists");

            var passwordHash = _authService.HashPassword(request.Password);
            var user = await _userService.RegisterUserAsync(request, passwordHash);

            var token = _authService.GenerateJwtToken(user);
            _logger.LogInformation("User registered: {Email}", user.Email);

            return Ok(BuildLoginResponse(user, token));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Registration error");
            return StatusCode(500, "An error occurred during registration");
        }
    }

    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        try
        {
            var user = await _userService.GetUserByEmailAsync(request.Email);
            if (user == null || !_authService.VerifyPassword(request.Password, user.PasswordHash))
                return Unauthorized("Invalid email or password");

            if (user.MfaEnabled && !_mfaService.IsRememberDeviceValid(user, request.RememberDeviceToken))
            {
                _logger.LogInformation("MFA required for user login: {Email}", user.Email);
                return Ok(new LoginResponse
                {
                    UserId = user.Id,
                    Email = user.Email,
                    FirstName = user.FirstName,
                    LastName = user.LastName,
                    ProfilePictureUrl = user.ProfilePictureUrl,
                    Status = user.Status,
                    RequiresMfa = true,
                    MfaToken = _mfaService.CreateLoginChallengeToken(user),
                    MfaEnabled = true,
                    ExpiresAt = DateTime.UtcNow.AddMinutes(5)
                });
            }

            var token = _authService.GenerateJwtToken(user);
            _logger.LogInformation("User logged in: {Email}", user.Email);

            return Ok(BuildLoginResponse(user, token));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Login error");
            return StatusCode(500, "An error occurred during login");
        }
    }

    [HttpPost("mfa/verify")]
    public async Task<ActionResult<LoginResponse>> VerifyMfaLogin([FromBody] VerifyMfaLoginRequest request)
    {
        try
        {
            var userId = _mfaService.ValidateLoginChallengeToken(request.MfaToken);
            if (userId == null)
            {
                return Unauthorized("MFA challenge expired. Please sign in again.");
            }

            var user = await _userService.GetUserWithSecurityByIdAsync(userId.Value);
            if (user == null || !user.MfaEnabled)
            {
                return Unauthorized("Invalid MFA challenge");
            }

            if (!_mfaService.VerifyUserCode(user, request.Code))
            {
                return Unauthorized("Invalid MFA code");
            }

            string? rememberDeviceToken = null;
            if (request.RememberDevice)
            {
                rememberDeviceToken = _mfaService.IssueRememberDeviceToken(user);
            }

            user.MfaLastVerifiedAt = DateTime.UtcNow;
            await _userService.SaveUserSecurityAsync(user);

            var token = _authService.GenerateJwtToken(user);
            _logger.LogInformation("MFA verified for user: {Email}", user.Email);

            var response = BuildLoginResponse(user, token);
            response.RememberDeviceToken = rememberDeviceToken;
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "MFA verification error");
            return StatusCode(500, "An error occurred during MFA verification");
        }
    }

    private static bool IsValidEmail(string email)
    {
        try
        {
            var address = new MailAddress(email);
            return address.Address.Equals(email, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static LoginResponse BuildLoginResponse(User user, string token)
    {
        return new LoginResponse
        {
            UserId = user.Id,
            Email = user.Email,
            FirstName = user.FirstName,
            LastName = user.LastName,
            ProfilePictureUrl = user.ProfilePictureUrl,
            Status = user.Status,
            Token = token,
            ExpiresAt = DateTime.UtcNow.AddHours(24),
            MfaEnabled = user.MfaEnabled
        };
    }
}
