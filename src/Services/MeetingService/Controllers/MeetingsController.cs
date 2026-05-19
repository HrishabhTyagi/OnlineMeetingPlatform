using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using MeetingService.Data;
using MeetingService.Models;
using MeetingService.Services;

namespace MeetingService.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MeetingsController : ControllerBase
{
    private readonly MeetingDbContext _context;
    private readonly IMeetingService _meetingService;
    private readonly IOrganizationStorageService _storageService;
    private readonly ILogger<MeetingsController> _logger;

    public MeetingsController(MeetingDbContext context, IMeetingService meetingService, IOrganizationStorageService storageService, ILogger<MeetingsController> logger)
    {
        _context = context;
        _meetingService = meetingService;
        _storageService = storageService;
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
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
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
            var currentUserId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            var currentUserEmail = User.FindFirst(ClaimTypes.Email)?.Value;
            var meetings = await _meetingService.GetMeetingsForUserAsync(currentUserId, currentUserEmail);
            return Ok(meetings.Select(MapToDto).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching user meetings");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet("organizations/{organizationId:guid}/usage")]
    public async Task<ActionResult<OrganizationMeetingUsageDto>> GetOrganizationUsage(Guid organizationId)
    {
        try
        {
            var now = DateTime.UtcNow;
            var meetings = _context.Meetings.Where(meeting => meeting.OrganizationId == organizationId);
            var conversationIds = _context.Conversations
                .Where(conversation => conversation.OrganizationId == organizationId)
                .Select(conversation => conversation.Id);
            var conversationMessages = _context.ConversationMessages
                .Where(message => conversationIds.Contains(message.ConversationId));

            var totalMeetings = await meetings.CountAsync();
            var upcomingMeetings = await meetings.CountAsync(meeting => meeting.IsActive && meeting.StartTime > now && meeting.Status == MeetingStatus.Scheduled);
            var activeMeetings = await meetings.CountAsync(meeting => meeting.IsActive && meeting.Status == MeetingStatus.InProgress);
            var recordedMeetings = await meetings.CountAsync(meeting => !string.IsNullOrWhiteSpace(meeting.RecordingUrl));
            var meetingInvites = await _context.MeetingInvites.CountAsync(invite => invite.Meeting.OrganizationId == organizationId);
            var participantJoins = await _context.Participants.CountAsync(participant => participant.Meeting.OrganizationId == organizationId);
            var conversations = await _context.Conversations.CountAsync(conversation => conversation.OrganizationId == organizationId);
            var directChatMessages = await conversationMessages.CountAsync();
            var meetingChatMessages = await _context.MeetingChatMessages.CountAsync(message => message.Meeting.OrganizationId == organizationId);
            var attachments = await conversationMessages.CountAsync(message => !string.IsNullOrWhiteSpace(message.AttachmentUrl));
            var attachmentBytes = await conversationMessages
                .Where(message => message.AttachmentSizeBytes.HasValue)
                .SumAsync(message => message.AttachmentSizeBytes ?? 0);
            var lastMeetingAt = await meetings
                .OrderByDescending(meeting => meeting.CreatedAt)
                .Select(meeting => (DateTime?)meeting.CreatedAt)
                .FirstOrDefaultAsync();
            var lastDirectMessageAt = await conversationMessages
                .OrderByDescending(message => message.SentAt)
                .Select(message => (DateTime?)message.SentAt)
                .FirstOrDefaultAsync();
            var lastMeetingMessageAt = await _context.MeetingChatMessages
                .Where(message => message.Meeting.OrganizationId == organizationId)
                .OrderByDescending(message => message.SentAt)
                .Select(message => (DateTime?)message.SentAt)
                .FirstOrDefaultAsync();

            return Ok(new OrganizationMeetingUsageDto
            {
                OrganizationId = organizationId,
                TotalMeetings = totalMeetings,
                UpcomingMeetings = upcomingMeetings,
                ActiveMeetings = activeMeetings,
                RecordedMeetings = recordedMeetings,
                MeetingInvites = meetingInvites,
                ParticipantJoins = participantJoins,
                Conversations = conversations,
                ChatMessages = directChatMessages + meetingChatMessages,
                Attachments = attachments,
                AttachmentBytes = attachmentBytes,
                LastMeetingAt = lastMeetingAt,
                LastMessageAt = MaxDate(lastDirectMessageAt, lastMeetingMessageAt)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching organization usage");
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
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating meeting");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPost("{id}/end")]
    public async Task<ActionResult<MeetingDto>> EndMeeting(Guid id)
    {
        try
        {
            var organizerId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            var meeting = await _meetingService.EndMeetingAsync(id, organizerId);
            await _meetingService.LogAuditAsync(organizerId, GetCurrentActorName(), "Meeting ended", meeting.Title, meetingId: id);
            return Ok(MapToDto(meeting));
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ending meeting");
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
            return Ok(invites.Select(MapInviteToDto).ToList());
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
            return Ok(invites.Select(MapInviteToDto).ToList());
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

    [HttpPut("{id}/invites/{inviteId}/response")]
    public async Task<ActionResult<MeetingInviteDto>> UpdateInviteResponse(Guid id, Guid inviteId, [FromBody] UpdateMeetingInviteResponseRequest request)
    {
        try
        {
            var currentUserIdText = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!Guid.TryParse(currentUserIdText, out var currentUserId))
            {
                return Unauthorized();
            }

            if (!Enum.TryParse<MeetingInviteResponseStatus>(request.Status, true, out var responseStatus))
            {
                return BadRequest("Response status must be Accepted, Declined, Tentative, or Pending");
            }

            var currentUserEmail = User.FindFirst(ClaimTypes.Email)?.Value;
            var invite = await _meetingService.UpdateInviteResponseAsync(id, inviteId, currentUserId, currentUserEmail, responseStatus, request.Reason);
            return Ok(MapInviteToDto(invite));
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating meeting invite response");
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

    [HttpPut("{id}/whiteboard")]
    public async Task<ActionResult<MeetingDto>> UpdateWhiteboard(Guid id, [FromBody] UpdateWhiteboardRequest request)
    {
        try
        {
            var currentUserIdText = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!Guid.TryParse(currentUserIdText, out var currentUserId))
            {
                return Unauthorized();
            }

            var firstName = User.FindFirst(ClaimTypes.GivenName)?.Value;
            var lastName = User.FindFirst(ClaimTypes.Surname)?.Value;
            var fullName = $"{firstName} {lastName}".Trim();
            var actorName = string.IsNullOrWhiteSpace(fullName)
                ? User.FindFirst(ClaimTypes.Email)?.Value ?? "User"
                : fullName;

            var meeting = await _meetingService.UpdateWhiteboardAsync(id, currentUserId, actorName, request.WhiteboardData);
            return Ok(MapToDto(meeting));
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating meeting whiteboard");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet("{id}/exports/chat")]
    public async Task<IActionResult> ExportChat(Guid id)
    {
        var currentUserIdText = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(currentUserIdText, out var currentUserId))
        {
            return Unauthorized();
        }

        var meeting = await _meetingService.GetMeetingByIdAsync(id);
        if (meeting == null)
        {
            return NotFound();
        }

        if (meeting.OrganizerId != currentUserId)
        {
            return Forbid();
        }

        var messages = await _meetingService.GetChatMessagesAsync(id);
        var lines = messages.Select(message => $"[{message.SentAt:u}] {message.SenderName}: {message.Message}");
        var content = string.Join(Environment.NewLine, lines);
        return File(System.Text.Encoding.UTF8.GetBytes(content), "text/plain", $"{meeting.Title}-chat.txt");
    }

    [HttpGet("{id}/exports/whiteboard")]
    public async Task<IActionResult> ExportWhiteboard(Guid id)
    {
        var currentUserIdText = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(currentUserIdText, out var currentUserId))
        {
            return Unauthorized();
        }

        var meeting = await _meetingService.GetMeetingByIdAsync(id);
        if (meeting == null)
        {
            return NotFound();
        }

        if (meeting.OrganizerId != currentUserId)
        {
            return Forbid();
        }

        return File(System.Text.Encoding.UTF8.GetBytes(meeting.WhiteboardData ?? "[]"), "application/json", $"{meeting.Title}-whiteboard.json");
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

            var organizationSettings = await _storageService.GetSettingsAsync();
            var maxRecordingBytes = (long)organizationSettings.MaxRecordingMegabytes * 1024 * 1024;
            if (recording.Length > maxRecordingBytes)
            {
                return BadRequest($"Recording must be {organizationSettings.MaxRecordingMegabytes} MB or smaller");
            }

            var fileName = $"{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}.webm";
            var storedFile = await _storageService.SaveAsync(OrganizationFileKind.Recording, id, recording, fileName);
            var updatedMeeting = await _meetingService.UpdateRecordingAsync(id, storedFile.PublicUrl);
            await _meetingService.LogAuditAsync(currentUserId, GetCurrentActorName(), "Recording stopped", storedFile.PublicUrl, meetingId: id);
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
    public async Task<IActionResult> GetRecording(Guid id, string fileName)
    {
        var filePath = await _storageService.GetPhysicalPathAsync(OrganizationFileKind.Recording, id, fileName);
        if (filePath == null)
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
            OrganizationId = meeting.OrganizationId,
            TeamChannelId = meeting.TeamChannelId,
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
            WhiteboardData = meeting.WhiteboardData,
            Status = meeting.Status.ToString(),
            MeetingLink = meeting.MeetingLink,
            IsRecorded = meeting.IsRecorded,
            RecordingUrl = meeting.RecordingUrl,
            MaxParticipants = meeting.MaxParticipants,
            CurrentParticipants = meeting.Participants.Count(p => p.LeftAt == null),
            CreatedAt = meeting.CreatedAt
        };
    }

    private static MeetingInviteDto MapInviteToDto(MeetingInvite invite)
    {
        return new MeetingInviteDto
        {
            Id = invite.Id,
            MeetingId = invite.MeetingId,
            Email = invite.Email,
            DisplayName = invite.DisplayName,
            Role = invite.Role.ToString(),
            IsRequired = invite.IsRequired,
            HasAccepted = invite.HasAccepted,
            ResponseStatus = invite.ResponseStatus.ToString(),
            ResponseReason = invite.ResponseReason,
            RespondedAt = invite.RespondedAt,
            CreatedAt = invite.CreatedAt
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

    private static DateTime? MaxDate(DateTime? left, DateTime? right)
    {
        if (!left.HasValue)
        {
            return right;
        }

        if (!right.HasValue)
        {
            return left;
        }

        return left.Value >= right.Value ? left : right;
    }

    private string GetCurrentActorName()
    {
        var firstName = User.FindFirst(ClaimTypes.GivenName)?.Value;
        var lastName = User.FindFirst(ClaimTypes.Surname)?.Value;
        var fullName = $"{firstName} {lastName}".Trim();
        return string.IsNullOrWhiteSpace(fullName)
            ? User.FindFirst(ClaimTypes.Email)?.Value ?? "User"
            : fullName;
    }
}
