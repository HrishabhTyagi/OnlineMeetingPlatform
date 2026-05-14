namespace MeetingService.Models;

public class CreateMeetingRequest
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public int? DurationMinutes { get; set; }
    public List<string> AttendeeEmails { get; set; } = new();
    public string? Location { get; set; }
    public bool IsOnlineMeeting { get; set; } = true;
    public bool LobbyEnabled { get; set; } = true;
    public bool AllowChat { get; set; } = true;
    public bool AllowReactions { get; set; } = true;
    public bool AllowScreenShare { get; set; } = true;
    public bool AllowAttendeeUnmute { get; set; } = true;
    public bool AllowRecording { get; set; }
    public bool AllowTranscription { get; set; }
    public string? RecurrenceRule { get; set; }
    public int MaxParticipants { get; set; } = 100;
    public bool IsRecorded { get; set; }
}

public class UpdateMeetingRequest
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public int? DurationMinutes { get; set; }
    public List<string> AttendeeEmails { get; set; } = new();
    public string? Location { get; set; }
    public bool IsOnlineMeeting { get; set; } = true;
    public bool LobbyEnabled { get; set; } = true;
    public bool AllowChat { get; set; } = true;
    public bool AllowReactions { get; set; } = true;
    public bool AllowScreenShare { get; set; } = true;
    public bool AllowAttendeeUnmute { get; set; } = true;
    public bool AllowRecording { get; set; }
    public bool AllowTranscription { get; set; }
    public string? RecurrenceRule { get; set; }
    public int MaxParticipants { get; set; } = 100;
}

public class MeetingDto
{
    public Guid Id { get; set; }
    public Guid OrganizerId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public int? DurationMinutes { get; set; }
    public List<string> AttendeeEmails { get; set; } = new();
    public string? Location { get; set; }
    public bool IsOnlineMeeting { get; set; }
    public bool LobbyEnabled { get; set; }
    public bool AllowChat { get; set; }
    public bool AllowReactions { get; set; }
    public bool AllowScreenShare { get; set; }
    public bool AllowAttendeeUnmute { get; set; }
    public bool AllowRecording { get; set; }
    public bool AllowTranscription { get; set; }
    public string? RecurrenceRule { get; set; }
    public string? Notes { get; set; }
    public string? Recap { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? MeetingLink { get; set; }
    public bool IsRecorded { get; set; }
    public string? RecordingUrl { get; set; }
    public int MaxParticipants { get; set; }
    public int CurrentParticipants { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class ParticipantDto
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string UserEmail { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public bool IsAdmitted { get; set; }
    public bool IsHandRaised { get; set; }
    public string? Reaction { get; set; }
    public DateTime JoinedAt { get; set; }
    public DateTime? LeftAt { get; set; }
    public bool IsAudioEnabled { get; set; }
    public bool IsVideoEnabled { get; set; }
    public bool IsScreenSharing { get; set; }
}

public class JoinMeetingRequest
{
    public string UserEmail { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
}

public class CreateChatMessageRequest
{
    public Guid SenderId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public Guid? RecipientUserId { get; set; }
    public string? RecipientName { get; set; }
    public string Message { get; set; } = string.Empty;
}

public class ChatMessageDto
{
    public Guid Id { get; set; }
    public Guid MeetingId { get; set; }
    public Guid SenderId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public Guid? RecipientUserId { get; set; }
    public string? RecipientName { get; set; }
    public string Scope { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTime SentAt { get; set; }
}

public class LobbyRequestDto
{
    public Guid Id { get; set; }
    public Guid MeetingId { get; set; }
    public Guid UserId { get; set; }
    public string UserEmail { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime RequestedAt { get; set; }
}

public class AdmitLobbyRequest
{
    public bool Admit { get; set; } = true;
}

public class UpdateParticipantRoleRequest
{
    public string Role { get; set; } = "Attendee";
}

public class UpdateNotesRequest
{
    public string? Notes { get; set; }
}

public class MeetingInviteDto
{
    public Guid Id { get; set; }
    public Guid MeetingId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string Role { get; set; } = string.Empty;
    public bool IsRequired { get; set; }
    public bool HasAccepted { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class SendMeetingInvitesRequest
{
    public List<string> Emails { get; set; } = new();
}

public class ConversationMemberDto
{
    public Guid UserId { get; set; }
    public string UserEmail { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
}

public class ConversationInviteDto
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public bool HasAccepted { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class ConversationDto
{
    public Guid Id { get; set; }
    public string Type { get; set; } = string.Empty;
    public string? Title { get; set; }
    public List<ConversationMemberDto> Members { get; set; } = new();
    public List<ConversationInviteDto> Invites { get; set; } = new();
    public ConversationMessageDto? LastMessage { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class ConversationMessageDto
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public Guid SenderId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTime SentAt { get; set; }
}

public class CreateConversationRequest
{
    public string Type { get; set; } = "Direct";
    public string? Title { get; set; }
    public List<ConversationMemberDto> Members { get; set; } = new();
    public List<string> InviteEmails { get; set; } = new();
}

public class SendConversationMessageRequest
{
    public Guid SenderId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
}
