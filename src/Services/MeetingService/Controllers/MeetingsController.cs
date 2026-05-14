using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MeetingService.Models;
using MeetingService.Services;

namespace MeetingService.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MeetingsController : ControllerBase
{
    private readonly IMeetingService _meetingService;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<MeetingsController> _logger;

    public MeetingsController(IMeetingService meetingService, IWebHostEnvironment environment, ILogger<MeetingsController> logger)
    {
        _meetingService = meetingService;
        _environment = environment;
        _logger = logger;
    }

    [HttpPost]
    public async Task<ActionResult<MeetingDto>> CreateMeeting([FromBody] CreateMeetingRequest request)
    {
        try
        {
            var organizerId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            var meeting = await _meetingService.CreateMeetingAsync(organizerId, request);
            return CreatedAtAction(nameof(GetMeetingById), new { id = meeting.Id }, MapToDto(meeting));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating meeting");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet("{id}")]
    [AllowAnonymous]
    public async Task<ActionResult<MeetingDto>> GetMeetingById(Guid id)
    {
        try
        {
            var meeting = await _meetingService.GetMeetingByIdAsync(id);
            if (meeting == null)
                return NotFound();

            return Ok(MapToDto(meeting));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching meeting");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet("organizer/list")]
    public async Task<ActionResult<List<MeetingDto>>> GetMyMeetings()
    {
        try
        {
            var organizerId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            var meetings = await _meetingService.GetMeetingsByOrganizerAsync(organizerId);
            return Ok(meetings.Select(MapToDto).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching user meetings");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet("upcoming")]
    [AllowAnonymous]
    public async Task<ActionResult<List<MeetingDto>>> GetUpcomingMeetings()
    {
        try
        {
            var meetings = await _meetingService.GetUpcomingMeetingsAsync();
            return Ok(meetings.Select(MapToDto).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching upcoming meetings");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<MeetingDto>> UpdateMeeting(Guid id, [FromBody] UpdateMeetingRequest request)
    {
        try
        {
            var meeting = await _meetingService.UpdateMeetingAsync(id, request);
            return Ok(MapToDto(meeting));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating meeting");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteMeeting(Guid id)
    {
        try
        {
            await _meetingService.DeleteMeetingAsync(id);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting meeting");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet("{id}/invites")]
    public async Task<ActionResult<List<MeetingInviteDto>>> GetInvites(Guid id)
    {
        try
        {
            var invites = await _meetingService.GetInvitesAsync(id);
            return Ok(invites.Select(invite => new MeetingInviteDto
            {
                Id = invite.Id,
                MeetingId = invite.MeetingId,
                Email = invite.Email,
                DisplayName = invite.DisplayName,
                Role = invite.Role.ToString(),
                IsRequired = invite.IsRequired,
                HasAccepted = invite.HasAccepted,
                CreatedAt = invite.CreatedAt
            }).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching meeting invites");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPost("{id}/invites/send")]
    public async Task<ActionResult<List<MeetingInviteDto>>> SendInvites(Guid id, [FromBody] SendMeetingInvitesRequest request)
    {
        try
        {
            if (request.Emails.Count == 0)
            {
                return BadRequest("At least one email is required");
            }

            var invites = await _meetingService.SendInvitesAsync(id, request.Emails);
            return Ok(invites.Select(invite => new MeetingInviteDto
            {
                Id = invite.Id,
                MeetingId = invite.MeetingId,
                Email = invite.Email,
                DisplayName = invite.DisplayName,
                Role = invite.Role.ToString(),
                IsRequired = invite.IsRequired,
                HasAccepted = invite.HasAccepted,
                CreatedAt = invite.CreatedAt
            }).ToList());
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending meeting invites");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPut("{id}/notes")]
    public async Task<ActionResult<MeetingDto>> UpdateNotes(Guid id, [FromBody] UpdateNotesRequest request)
    {
        try
        {
            var meeting = await _meetingService.UpdateNotesAsync(id, request.Notes);
            return Ok(MapToDto(meeting));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating meeting notes");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPost("{id}/recordings")]
    [RequestSizeLimit(750_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 750_000_000)]
    public async Task<ActionResult<MeetingDto>> UploadRecording(Guid id, [FromForm] IFormFile recording)
    {
        try
        {
            var currentUserIdText = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!Guid.TryParse(currentUserIdText, out var currentUserId))
            {
                return Unauthorized();
            }

            if (recording == null || recording.Length == 0)
            {
                return BadRequest("Recording file is required");
            }

            var meeting = await _meetingService.GetMeetingByIdAsync(id);
            if (meeting == null)
            {
                return NotFound("Meeting not found");
            }

            if (meeting.OrganizerId != currentUserId)
            {
                return Forbid();
            }

            if (!meeting.AllowRecording)
            {
                return BadRequest("Recording is not enabled for this meeting");
            }

            var recordingDirectory = Path.Combine(_environment.ContentRootPath, "Recordings", id.ToString());
            Directory.CreateDirectory(recordingDirectory);

            var fileName = $"{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}.webm";
            var filePath = Path.Combine(recordingDirectory, fileName);

            await using (var stream = System.IO.File.Create(filePath))
            {
                await recording.CopyToAsync(stream);
            }

            var recordingUrl = $"/api/meetings/{id}/recordings/{fileName}";
            var updatedMeeting = await _meetingService.UpdateRecordingAsync(id, recordingUrl);
            return Ok(MapToDto(updatedMeeting));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading meeting recording");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet("{id}/recordings/{fileName}")]
    [AllowAnonymous]
    public IActionResult GetRecording(Guid id, string fileName)
    {
        var safeFileName = Path.GetFileName(fileName);
        var filePath = Path.Combine(_environment.ContentRootPath, "Recordings", id.ToString(), safeFileName);
        if (!System.IO.File.Exists(filePath))
        {
            return NotFound();
        }

        return PhysicalFile(filePath, "video/webm", enableRangeProcessing: true);
    }

    private MeetingDto MapToDto(Meeting meeting)
    {
        return new MeetingDto
        {
            Id = meeting.Id,
            OrganizerId = meeting.OrganizerId,
            Title = meeting.Title,
            Description = meeting.Description,
            StartTime = meeting.StartTime,
            EndTime = meeting.EndTime,
            DurationMinutes = meeting.DurationMinutes,
            AttendeeEmails = SplitAttendeeEmails(meeting.AttendeeEmails),
            Location = meeting.Location,
            IsOnlineMeeting = meeting.IsOnlineMeeting,
            LobbyEnabled = meeting.LobbyEnabled,
            AllowChat = meeting.AllowChat,
            AllowReactions = meeting.AllowReactions,
            AllowScreenShare = meeting.AllowScreenShare,
            AllowAttendeeUnmute = meeting.AllowAttendeeUnmute,
            AllowRecording = meeting.AllowRecording,
            AllowTranscription = meeting.AllowTranscription,
            RecurrenceRule = meeting.RecurrenceRule,
            Notes = meeting.Notes,
            Recap = meeting.Recap,
            Status = meeting.Status.ToString(),
            MeetingLink = meeting.MeetingLink,
            IsRecorded = meeting.IsRecorded,
            RecordingUrl = meeting.RecordingUrl,
            MaxParticipants = meeting.MaxParticipants,
            CurrentParticipants = meeting.Participants.Count(p => p.LeftAt == null),
            CreatedAt = meeting.CreatedAt
        };
    }

    private static List<string> SplitAttendeeEmails(string? attendeeEmails)
    {
        if (string.IsNullOrWhiteSpace(attendeeEmails))
        {
            return new List<string>();
        }

        return attendeeEmails
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();
    }
}
