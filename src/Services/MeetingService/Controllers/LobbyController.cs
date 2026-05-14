using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MeetingService.Models;
using MeetingService.Services;

namespace MeetingService.Controllers;

[ApiController]
[Route("api/meetings/{meetingId}/lobby")]
[Authorize]
public class LobbyController : ControllerBase
{
    private readonly IMeetingService _meetingService;
    private readonly ILogger<LobbyController> _logger;

    public LobbyController(IMeetingService meetingService, ILogger<LobbyController> logger)
    {
        _meetingService = meetingService;
        _logger = logger;
    }

    [HttpPost("request")]
    [AllowAnonymous]
    public async Task<ActionResult<LobbyRequestDto>> RequestAccess(Guid meetingId, [FromBody] JoinMeetingRequest request)
    {
        try
        {
            var userId = Guid.Empty;
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!string.IsNullOrEmpty(userIdClaim))
                Guid.TryParse(userIdClaim, out userId);

            var lobbyRequest = await _meetingService.RequestLobbyAccessAsync(meetingId, userId, request);
            return Ok(MapToDto(lobbyRequest));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating lobby request");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet]
    public async Task<ActionResult<List<LobbyRequestDto>>> GetLobby(Guid meetingId)
    {
        try
        {
            var requests = await _meetingService.GetLobbyRequestsAsync(meetingId);
            return Ok(requests.Select(MapToDto).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching lobby requests");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPut("{requestId}")]
    public async Task<ActionResult<LobbyRequestDto>> Decide(Guid requestId, [FromBody] AdmitLobbyRequest request)
    {
        try
        {
            var lobbyRequest = await _meetingService.DecideLobbyRequestAsync(requestId, request.Admit);
            return Ok(MapToDto(lobbyRequest));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating lobby request");
            return StatusCode(500, "An error occurred");
        }
    }

    private static LobbyRequestDto MapToDto(LobbyRequest lobbyRequest)
    {
        return new LobbyRequestDto
        {
            Id = lobbyRequest.Id,
            MeetingId = lobbyRequest.MeetingId,
            UserId = lobbyRequest.UserId,
            UserEmail = lobbyRequest.UserEmail,
            UserName = lobbyRequest.UserName,
            Status = lobbyRequest.Status.ToString(),
            RequestedAt = lobbyRequest.RequestedAt
        };
    }
}
