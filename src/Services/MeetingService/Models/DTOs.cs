using Microsoft.AspNetCore.Http;

namespace MeetingService.Models;

public class CreateMeetingRequest
{
    public Guid? TeamChannelId { get; set; }
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
    public Guid? TeamChannelId { get; set; }
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
    public Guid? OrganizationId { get; set; }
    public Guid? TeamChannelId { get; set; }
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

public class OrganizationMeetingUsageDto
{
    public Guid OrganizationId { get; set; }
    public int TotalMeetings { get; set; }
    public int UpcomingMeetings { get; set; }
    public int ActiveMeetings { get; set; }
    public int RecordedMeetings { get; set; }
    public int MeetingInvites { get; set; }
    public int ParticipantJoins { get; set; }
    public int Conversations { get; set; }
    public int ChatMessages { get; set; }
    public int Attachments { get; set; }
    public long AttachmentBytes { get; set; }
    public DateTime? LastMeetingAt { get; set; }
    public DateTime? LastMessageAt { get; set; }
}

public class TeamSpaceDto
{
    public Guid Id { get; set; }
    public Guid? OrganizationId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid OwnerUserId { get; set; }
    public bool IsArchived { get; set; }
    public List<TeamMemberDto> Members { get; set; } = new();
    public List<TeamChannelDto> Channels { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class TeamMemberDto
{
    public Guid UserId { get; set; }
    public string UserEmail { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
}

public class TeamChannelDto
{
    public Guid Id { get; set; }
    public Guid TeamSpaceId { get; set; }
    public Guid ConversationId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int SortOrder { get; set; }
    public List<TeamChannelTabDto> Tabs { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class TeamChannelTabDto
{
    public Guid Id { get; set; }
    public Guid TeamChannelId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string? Url { get; set; }
    public string? Content { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class TeamChannelFileDto
{
    public Guid MessageId { get; set; }
    public Guid ConversationId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string? Url { get; set; }
    public string? ContentType { get; set; }
    public long? SizeBytes { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public DateTime SentAt { get; set; }
}

public class CreateTeamSpaceRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<ConversationMemberDto> Members { get; set; } = new();
}

public class CreateTeamChannelRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
}

public class AddTeamMembersRequest
{
    public List<ConversationMemberDto> Members { get; set; } = new();
}

public class CreateTeamChannelTabRequest
{
    public string Title { get; set; } = string.Empty;
    public string Kind { get; set; } = "Link";
    public string? Url { get; set; }
    public string? Content { get; set; }
}

public class CreateChannelMeetingRequest
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime? StartTime { get; set; }
    public int DurationMinutes { get; set; } = 60;
}

public class CalendarProviderConfigDto
{
    public string Provider { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public bool IsConfigured { get; set; }
    public List<string> Scopes { get; set; } = new();
}

public class CalendarConnectionDto
{
    public Guid Id { get; set; }
    public string Provider { get; set; } = string.Empty;
    public string? AccountEmail { get; set; }
    public string CalendarId { get; set; } = "primary";
    public bool IsEnabled { get; set; }
    public DateTime? LastSyncAt { get; set; }
    public string? LastError { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class StartCalendarConnectionRequest
{
    public string RedirectUri { get; set; } = string.Empty;
}

public class CompleteCalendarConnectionRequest
{
    public string Code { get; set; } = string.Empty;
    public string RedirectUri { get; set; } = string.Empty;
}

public class CalendarAuthorizationDto
{
    public string Provider { get; set; } = string.Empty;
    public string AuthorizationUrl { get; set; } = string.Empty;
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
    public Guid? OrganizationId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string? Title { get; set; }
    public List<ConversationMemberDto> Members { get; set; } = new();
    public List<ConversationInviteDto> Invites { get; set; } = new();
    public ConversationMessageDto? LastMessage { get; set; }
    public int UnreadCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class ConversationMessageDto
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public Guid SenderId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public string? ClientMessageId { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? AttachmentFileName { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentContentType { get; set; }
    public long? AttachmentSizeBytes { get; set; }
    public Guid? ReplyToMessageId { get; set; }
    public string? ReplyToSenderName { get; set; }
    public string? ReplyToPreview { get; set; }
    public DateTime SentAt { get; set; }
    public DateTime? EditedAt { get; set; }
    public bool IsPinned { get; set; }
    public List<ConversationMessageReactionDto> Reactions { get; set; } = new();
}

public class ConversationMessageReactionDto
{
    public Guid Id { get; set; }
    public Guid MessageId { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string Emoji { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class ScheduledConversationMessageDto
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public Guid SenderId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTime ScheduledFor { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? SentAt { get; set; }
    public string Status { get; set; } = string.Empty;
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
    public string? ClientMessageId { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? AttachmentFileName { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentContentType { get; set; }
    public long? AttachmentSizeBytes { get; set; }
    public Guid? ReplyToMessageId { get; set; }
}

public class SendConversationAttachmentRequest
{
    public Guid SenderId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public string? Message { get; set; }
    public Guid? ReplyToMessageId { get; set; }
    public IFormFile? File { get; set; }
}

public class UpdateConversationMessageRequest
{
    public string Message { get; set; } = string.Empty;
}

public class ToggleConversationMessageReactionRequest
{
    public string Emoji { get; set; } = string.Empty;
}

public class ScheduleConversationMessageRequest
{
    public string Message { get; set; } = string.Empty;
    public DateTime ScheduledFor { get; set; }
}
