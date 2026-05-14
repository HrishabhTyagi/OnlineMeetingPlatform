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
    private readonly IUserService _userService;
    private readonly ILogger<UsersController> _logger;

    public UsersController(IUserService userService, ILogger<UsersController> logger)
    {
        _userService = userService;
        _logger = logger;
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
            return Ok(users.Select(user => new UserProfileDto
            {
                Id = user.Id,
                Email = user.Email,
                FirstName = user.FirstName,
                LastName = user.LastName,
                ProfilePictureUrl = user.ProfilePictureUrl,
                PhoneNumber = user.PhoneNumber,
                IsEmailVerified = user.IsEmailVerified,
                CreatedAt = user.CreatedAt
            }).ToList());
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

            var dto = new UserProfileDto
            {
                Id = user.Id,
                Email = user.Email,
                FirstName = user.FirstName,
                LastName = user.LastName,
                ProfilePictureUrl = user.ProfilePictureUrl,
                PhoneNumber = user.PhoneNumber,
                IsEmailVerified = user.IsEmailVerified,
                CreatedAt = user.CreatedAt
            };

            return Ok(dto);
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

            var dto = new UserProfileDto
            {
                Id = user.Id,
                Email = user.Email,
                FirstName = user.FirstName,
                LastName = user.LastName,
                ProfilePictureUrl = user.ProfilePictureUrl,
                PhoneNumber = user.PhoneNumber,
                IsEmailVerified = user.IsEmailVerified,
                CreatedAt = user.CreatedAt
            };

            return Ok(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating profile");
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

            var dto = new UserProfileDto
            {
                Id = user.Id,
                Email = user.Email,
                FirstName = user.FirstName,
                LastName = user.LastName,
                ProfilePictureUrl = user.ProfilePictureUrl,
                IsEmailVerified = user.IsEmailVerified,
                CreatedAt = user.CreatedAt
            };

            return Ok(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching user");
            return StatusCode(500, "An error occurred");
        }
    }
}
