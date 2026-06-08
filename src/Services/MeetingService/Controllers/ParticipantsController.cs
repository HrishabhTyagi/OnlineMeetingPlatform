using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MeetingService.Models;
using MeetingService.Services;
using Samvaad.Common.Caching;

namespace MeetingService.Controllers;

[ApiController]
[Route("api/meetings/{meetingId}/[controller]")]
[Authorize]
public class ParticipantsController : ControllerBase
{
    private static readonly TimeSpan ParticipantListTtl = TimeSpan.FromSeconds(10);

    private readonly IMeetingService _meetingService;
    private readonly IMeetingAuthorizationService _authorizationService;
    private readonly IAppCache _cache;
    private readonly ILogger<ParticipantsController> _logger;

    public ParticipantsController(
        IMeetingService meetingService,
        IMeetingAuthorizationService authorizationService,
        IAppCache cache,
        ILogger<ParticipantsController> logger)
    {
        _meetingService = meetingService;
        _authorizationService = authorizationService;
        _cache = cache;
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
            await BumpMeetingCacheAsync();
            return Ok(MapToDto(participant));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
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
            if (!TryGetCurrentUserId(out var currentUserId))
            {
                return Unauthorized();
            }

            var authorization = await AuthorizeParticipantMutationAsync(meetingId, participantId, currentUserId, allowOrganizer: true);
            if (authorization == ParticipantAuthorization.NotFound)
            {
                return NotFound();
            }

            if (authorization == ParticipantAuthorization.Forbidden)
            {
                return Forbid();
            }

            var success = await _meetingService.LeaveMeetingAsync(meetingId, participantId);
            if (!success)
                return NotFound();

            await BumpMeetingCacheAsync();
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
            var version = await GetMeetingCacheVersionAsync();
            var participants = await _cache.GetOrCreateAsync(
                $"meetings:{TenantCacheKey()}:participants:{meetingId:N}:v{version}",
                async _ => (await _meetingService.GetMeetingParticipantsAsync(meetingId))
                    .Select(MapToDto)
                    .ToList(),
                ParticipantListTtl);

            return Ok(participants);
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
            if (!TryGetCurrentUserId(out var currentUserId))
            {
                return Unauthorized();
            }

            var authorization = await AuthorizeParticipantMutationAsync(meetingId, participantId, currentUserId, allowOrganizer: true);
            if (authorization == ParticipantAuthorization.NotFound)
            {
                return NotFound();
            }

            if (authorization == ParticipantAuthorization.Forbidden)
            {
                return Forbid();
            }

            var success = await _meetingService.UpdateParticipantStatusAsync(participantId, request.AudioEnabled, request.VideoEnabled, request.ScreenSharing);
            if (!success)
                return NotFound();

            await BumpMeetingCacheAsync();
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating participant status");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPut("{participantId}/role")]
    public async Task<IActionResult> UpdateParticipantRole(Guid meetingId, Guid participantId, [FromBody] UpdateParticipantRoleRequest request)
    {
        try
        {
            if (!TryGetCurrentUserId(out var currentUserId))
            {
                return Unauthorized();
            }

            if (!await _authorizationService.IsOrganizerAsync(meetingId, currentUserId))
            {
                return Forbid();
            }

            if (!Enum.TryParse<ParticipantRole>(request.Role, true, out var role))
            {
                return BadRequest("Invalid participant role");
            }

            var success = await _meetingService.UpdateParticipantRoleAsync(participantId, role);
            if (!success)
                return NotFound();

            await BumpMeetingCacheAsync();
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating participant role");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPut("{participantId}/hand")]
    public async Task<ActionResult<ParticipantDto>> UpdateParticipantHand(Guid meetingId, Guid participantId, [FromBody] UpdateParticipantHandRequest request)
    {
        try
        {
            if (!TryGetCurrentUserId(out var currentUserId))
            {
                return Unauthorized();
            }

            var authorization = await AuthorizeParticipantMutationAsync(meetingId, participantId, currentUserId, allowOrganizer: true);
            if (authorization == ParticipantAuthorization.NotFound)
            {
                return NotFound();
            }

            if (authorization == ParticipantAuthorization.Forbidden)
            {
                return Forbid();
            }

            var participant = await _meetingService.UpdateParticipantHandAsync(participantId, request.IsHandRaised);
            if (participant == null)
                return NotFound();

            await BumpMeetingCacheAsync();
            return Ok(MapToDto(participant));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating participant hand status");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPut("{participantId}/reaction")]
    public async Task<ActionResult<ParticipantDto>> UpdateParticipantReaction(Guid meetingId, Guid participantId, [FromBody] UpdateParticipantReactionRequest request)
    {
        try
        {
            if (!TryGetCurrentUserId(out var currentUserId))
            {
                return Unauthorized();
            }

            var authorization = await AuthorizeParticipantMutationAsync(meetingId, participantId, currentUserId, allowOrganizer: false);
            if (authorization == ParticipantAuthorization.NotFound)
            {
                return NotFound();
            }

            if (authorization == ParticipantAuthorization.Forbidden)
            {
                return Forbid();
            }

            var participant = await _meetingService.UpdateParticipantReactionAsync(participantId, request.Reaction);
            if (participant == null)
                return NotFound();

            await BumpMeetingCacheAsync();
            return Ok(MapToDto(participant));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating participant reaction");
            return StatusCode(500, "An error occurred");
        }
    }

    private async Task<ParticipantAuthorization> AuthorizeParticipantMutationAsync(
        Guid meetingId,
        Guid participantId,
        Guid currentUserId,
        bool allowOrganizer)
    {
        var participant = (await _meetingService.GetMeetingParticipantsAsync(meetingId))
            .FirstOrDefault(item => item.Id == participantId);
        if (participant == null)
        {
            return ParticipantAuthorization.NotFound;
        }

        if (await _authorizationService.CanManageParticipantAsync(meetingId, participantId, currentUserId, allowOrganizer))
        {
            return ParticipantAuthorization.Allowed;
        }

        return ParticipantAuthorization.Forbidden;
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(userIdClaim, out userId);
    }

    private enum ParticipantAuthorization
    {
        Allowed,
        Forbidden,
        NotFound
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

    private async Task<long> GetMeetingCacheVersionAsync()
    {
        return await _cache.GetOrCreateAsync(MeetingVersionKey(), _ => Task.FromResult(1L), TimeSpan.FromDays(30));
    }

    private Task BumpMeetingCacheAsync()
    {
        return _cache.IncrementAsync(MeetingVersionKey(), TimeSpan.FromDays(30));
    }

    private string MeetingVersionKey()
    {
        return $"meetings:{TenantCacheKey()}:version";
    }

    private string TenantCacheKey()
    {
        var organizationId = Request.Headers["X-Organization-Id"].FirstOrDefault();
        if (Guid.TryParse(organizationId, out var parsedOrganizationId))
        {
            return CacheKey.Tenant(parsedOrganizationId);
        }

        return CacheKey.Tenant(null, Request.Headers["X-Organization-Slug"].FirstOrDefault());
    }
}

public class UpdateParticipantStatusRequest
{
    public bool AudioEnabled { get; set; }
    public bool VideoEnabled { get; set; }
    public bool ScreenSharing { get; set; }
}

public class UpdateParticipantHandRequest
{
    public bool IsHandRaised { get; set; }
}

public class UpdateParticipantReactionRequest
{
    public string? Reaction { get; set; }
}
