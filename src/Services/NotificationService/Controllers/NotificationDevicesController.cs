using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NotificationService.Data;
using NotificationService.Models;

namespace NotificationService.Controllers;

[ApiController]
[Authorize]
[Route("api/notifications/devices")]
public class NotificationDevicesController : ControllerBase
{
    private readonly NotificationDbContext _context;

    public NotificationDevicesController(NotificationDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<NotificationDeviceDto>>> GetDevices(CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized();
        }

        var devices = await _context.NotificationDevices
            .AsNoTracking()
            .Where(device => device.UserId == userId && device.IsActive)
            .OrderByDescending(device => device.LastSeenAtUtc)
            .Select(device => ToDto(device))
            .ToListAsync(cancellationToken);

        return Ok(devices);
    }

    [HttpPost]
    public async Task<ActionResult<NotificationDeviceDto>> RegisterDevice(
        [FromBody] RegisterNotificationDeviceRequest request,
        CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized();
        }

        var pushToken = request.PushToken?.Trim();
        if (string.IsNullOrWhiteSpace(pushToken) || pushToken.Length > 512)
        {
            return BadRequest("A valid push token is required.");
        }

        var platform = NormalizePlatform(request.Platform);
        var deviceName = string.IsNullOrWhiteSpace(request.DeviceName)
            ? null
            : request.DeviceName.Trim()[..Math.Min(request.DeviceName.Trim().Length, 160)];

        var existing = await _context.NotificationDevices
            .FirstOrDefaultAsync(device => device.UserId == userId && device.PushToken == pushToken, cancellationToken);

        if (existing == null)
        {
            existing = new NotificationDevice
            {
                UserId = userId.Value,
                PushToken = pushToken,
                Platform = platform,
                DeviceName = deviceName
            };
            _context.NotificationDevices.Add(existing);
        }
        else
        {
            existing.Platform = platform;
            existing.DeviceName = deviceName;
            existing.IsActive = true;
            existing.LastSeenAtUtc = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return Ok(ToDto(existing));
    }

    [HttpDelete("{deviceId:guid}")]
    public async Task<IActionResult> UnregisterDevice(Guid deviceId, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized();
        }

        var device = await _context.NotificationDevices
            .FirstOrDefaultAsync(item => item.Id == deviceId && item.UserId == userId, cancellationToken);

        if (device == null)
        {
            return NotFound();
        }

        device.IsActive = false;
        device.LastSeenAtUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpDelete("token")]
    public async Task<IActionResult> UnregisterToken(
        [FromQuery] string pushToken,
        CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized();
        }

        var token = pushToken?.Trim();
        if (string.IsNullOrWhiteSpace(token))
        {
            return BadRequest("A push token is required.");
        }

        var devices = await _context.NotificationDevices
            .Where(item => item.UserId == userId && item.PushToken == token && item.IsActive)
            .ToListAsync(cancellationToken);

        foreach (var device in devices)
        {
            device.IsActive = false;
            device.LastSeenAtUtc = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private Guid? GetCurrentUserId()
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(raw, out var userId) ? userId : null;
    }

    private static string NormalizePlatform(string? platform)
    {
        var normalized = platform?.Trim().ToLowerInvariant();
        return normalized is "ios" or "android" or "web" ? normalized : "unknown";
    }

    private static NotificationDeviceDto ToDto(NotificationDevice device)
    {
        return new NotificationDeviceDto
        {
            Id = device.Id,
            PushToken = device.PushToken,
            Platform = device.Platform,
            DeviceName = device.DeviceName,
            IsActive = device.IsActive,
            LastSeenAtUtc = device.LastSeenAtUtc
        };
    }
}
