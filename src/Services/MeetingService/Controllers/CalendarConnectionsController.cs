using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MeetingService.Models;
using MeetingService.Services;

namespace MeetingService.Controllers;

[ApiController]
[Authorize]
[Route("api/calendar-connections")]
public class CalendarConnectionsController : ControllerBase
{
    private readonly IExternalCalendarSyncService _calendarSyncService;
    private readonly ILogger<CalendarConnectionsController> _logger;

    public CalendarConnectionsController(
        IExternalCalendarSyncService calendarSyncService,
        ILogger<CalendarConnectionsController> logger)
    {
        _calendarSyncService = calendarSyncService;
        _logger = logger;
    }

    [HttpGet("providers")]
    public ActionResult<List<CalendarProviderConfigDto>> GetProviders()
    {
        return Ok(_calendarSyncService.GetProviders());
    }

    [HttpGet]
    public async Task<ActionResult<List<CalendarConnectionDto>>> GetConnections()
    {
        var connections = await _calendarSyncService.GetConnectionsAsync(GetCurrentUserId());
        return Ok(connections.Select(MapToDto).ToList());
    }

    [HttpPost("{provider}/authorize")]
    public async Task<ActionResult<CalendarAuthorizationDto>> CreateAuthorizationUrl(string provider, [FromBody] StartCalendarConnectionRequest request)
    {
        try
        {
            if (!TryParseProvider(provider, out var parsedProvider))
            {
                return BadRequest("Unsupported calendar provider.");
            }

            var authorizationUrl = await _calendarSyncService.BuildAuthorizationUrlAsync(parsedProvider, request.RedirectUri, GetCurrentUserId());
            return Ok(new CalendarAuthorizationDto
            {
                Provider = parsedProvider.ToString(),
                AuthorizationUrl = authorizationUrl
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating calendar authorization URL for {Provider}", provider);
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPost("{provider}/callback")]
    public async Task<ActionResult<CalendarConnectionDto>> CompleteConnection(string provider, [FromBody] CompleteCalendarConnectionRequest request)
    {
        try
        {
            if (!TryParseProvider(provider, out var parsedProvider))
            {
                return BadRequest("Unsupported calendar provider.");
            }

            var connection = await _calendarSyncService.CompleteAuthorizationAsync(parsedProvider, GetCurrentUserId(), request.Code, request.RedirectUri);
            return Ok(MapToDto(connection));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error completing calendar connection for {Provider}", provider);
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpDelete("{provider}")]
    public async Task<IActionResult> Disconnect(string provider)
    {
        try
        {
            if (!TryParseProvider(provider, out var parsedProvider))
            {
                return BadRequest("Unsupported calendar provider.");
            }

            await _calendarSyncService.DisconnectAsync(GetCurrentUserId(), parsedProvider);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error disconnecting calendar provider {Provider}", provider);
            return StatusCode(500, "An error occurred");
        }
    }

    private Guid GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(userIdClaim, out var userId)
            ? userId
            : throw new InvalidOperationException("User id claim is missing.");
    }

    private static bool TryParseProvider(string provider, out ExternalCalendarProvider parsedProvider)
    {
        return Enum.TryParse(provider, true, out parsedProvider);
    }

    private static CalendarConnectionDto MapToDto(CalendarConnection connection)
    {
        return new CalendarConnectionDto
        {
            Id = connection.Id,
            Provider = connection.Provider.ToString(),
            AccountEmail = connection.AccountEmail,
            CalendarId = connection.CalendarId,
            IsEnabled = connection.IsEnabled,
            LastSyncAt = connection.LastSyncAt,
            LastError = connection.LastError,
            CreatedAt = connection.CreatedAt,
            UpdatedAt = connection.UpdatedAt
        };
    }
}
