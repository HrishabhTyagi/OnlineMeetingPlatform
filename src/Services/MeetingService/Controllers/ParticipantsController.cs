using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MeetingService.Models;
using MeetingService.Services;

namespace MeetingService.Controllers;

[ApiController]
[Route("api/meetings/{meetingId}/[controller]")]
[Authorize]
public class ParticipantsController : ControllerBase
{
    private readonly IMeetingService _meetingService;
    private readonly ILogger<ParticipantsController> _logger;

    public ParticipantsController(IMeetingService meetingService, ILogger<ParticipantsController> logger)
    {
        _meetingService = meetingService;
        _logger = logger;
    }

    [HttpPost("join")]
    [AllowAnonymous]
    public async Task<ActionResult<ParticipantDto>> JoinMeeting(Guid meetingId, [FromBody] JoinMeetingRequest request)
    {
        try
        {
            var userId = Guid.Empty;
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!string.IsNullOrEmpty(userIdClaim))
                Guid.TryParse(userIdClaim, out userId);

            var participant = await _meetingService.JoinMeetingAsync(meetingId, userId, request);
            return Ok(MapToDto(participant));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error joining meeting");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPost("{participantId}/leave")]
    public async Task<IActionResult> LeaveMeeting(Guid meetingId, Guid participantId)
    {
        try
        {
            var success = await _meetingService.LeaveMeetingAsync(meetingId, participantId);
            if (!success)
                return NotFound();

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error leaving meeting");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<List<ParticipantDto>>> GetParticipants(Guid meetingId)
    {
        try
        {
            var participants = await _meetingService.GetMeetingParticipantsAsync(meetingId);
            return Ok(participants.Select(MapToDto).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching participants");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPut("{participantId}/status")]
    public async Task<IActionResult> UpdateParticipantStatus(Guid meetingId, Guid participantId, [FromBody] UpdateParticipantStatusRequest request)
    {
        try
        {
            var success = await _meetingService.UpdateParticipantStatusAsync(participantId, request.AudioEnabled, request.VideoEnabled, request.ScreenSharing);
            if (!success)
                return NotFound();

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating participant status");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPut("{participantId}/role")]
    public async Task<IActionResult> UpdateParticipantRole(Guid participantId, [FromBody] UpdateParticipantRoleRequest request)
    {
        try
        {
            if (!Enum.TryParse<ParticipantRole>(request.Role, true, out var role))
            {
                return BadRequest("Invalid participant role");
            }

            var success = await _meetingService.UpdateParticipantRoleAsync(participantId, role);
            if (!success)
                return NotFound();

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating participant role");
            return StatusCode(500, "An error occurred");
        }
    }

    private ParticipantDto MapToDto(Participant participant)
    {
        return new ParticipantDto
        {
            Id = participant.Id,
            UserId = participant.UserId,
            UserEmail = participant.UserEmail,
            UserName = participant.UserName,
            Role = participant.Role.ToString(),
            IsAdmitted = participant.IsAdmitted,
            IsHandRaised = participant.IsHandRaised,
            Reaction = participant.Reaction,
            JoinedAt = participant.JoinedAt,
            LeftAt = participant.LeftAt,
            IsAudioEnabled = participant.IsAudioEnabled,
            IsVideoEnabled = participant.IsVideoEnabled,
            IsScreenSharing = participant.IsScreenSharing
        };
    }
}

public class UpdateParticipantStatusRequest
{
    public bool AudioEnabled { get; set; }
    public bool VideoEnabled { get; set; }
    public bool ScreenSharing { get; set; }
}
