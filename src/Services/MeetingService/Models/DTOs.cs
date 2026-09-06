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
    public bool AllowOrganizerOverlap { get; set; }
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
    public string? WhiteboardData { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? MeetingLink { get; set; }
    public bool IsRecorded { get; set; }
    public string? RecordingUrl { get; set; }
    public int MaxParticipants { get; set; }
    public int CurrentParticipants { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class MeetingIntelligenceDto
{
    public Guid MeetingId { get; set; }
    public string RecordingUrl { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? Transcript { get; set; }
    public string? TranscriptSegmentsJson { get; set; }
    public string? Summary { get; set; }
    public string? ActionItemsJson { get; set; }
    public string? Error { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
}

public class CompleteMeetingIntelligenceRequest
{
    public Guid? OrganizationId { get; set; }
    public string RecordingUrl { get; set; } = string.Empty;
    public string Status { get; set; } = "Completed";
    public string? Transcript { get; set; }
    public string? TranscriptSegmentsJson { get; set; }
    public string? Summary { get; set; }
    public string? ActionItemsJson { get; set; }
    public string? Error { get; set; }
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

public class LicensePurchaseRequest
{
    public string PlanName { get; set; } = string.Empty;
    public string BillingCycle { get; set; } = "Monthly";
    public int SeatCount { get; set; } = 1;
    public decimal EstimatedAmount { get; set; }
    public string Currency { get; set; } = "INR";
    public string CompanyName { get; set; } = string.Empty;
    public string? CompanySamvaadEmail { get; set; }
    public string? OrganizationName { get; set; }
    public string? OrganizationSlug { get; set; }
    public string ContactName { get; set; } = string.Empty;
    public string ContactEmail { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Notes { get; set; }
    public string? PaymentLast4 { get; set; }
}

public class LicensePurchaseResponse
{
    public string Reference { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
}

public class LicenseRequestEmail
{
    public string Reference { get; set; } = string.Empty;
    public Guid RequestedByUserId { get; set; }
    public DateTime RequestedAtUtc { get; set; }
    public Guid? OrganizationId { get; set; }
    public string? OrganizationSlug { get; set; }
    public string CompanyName { get; set; } = string.Empty;
    public string CompanySamvaadEmail { get; set; } = string.Empty;
    public string PlanName { get; set; } = string.Empty;
    public string BillingCycle { get; set; } = string.Empty;
    public int SeatCount { get; set; }
    public decimal EstimatedAmount { get; set; }
    public string Currency { get; set; } = string.Empty;
    public string RequestedByName { get; set; } = string.Empty;
    public string RequestedByEmail { get; set; } = string.Empty;
    public string ContactName { get; set; } = string.Empty;
    public string ContactEmail { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Notes { get; set; }
    public string? PaymentLast4 { get; set; }
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
    public string? AttachmentFileName { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentContentType { get; set; }
    public long? AttachmentSizeBytes { get; set; }
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
    public string? AttachmentFileName { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentContentType { get; set; }
    public long? AttachmentSizeBytes { get; set; }
    public DateTime SentAt { get; set; }
}

public class MeetingCallLogDto
{
    public Guid Id { get; set; }
    public Guid MeetingId { get; set; }
    public string MeetingTitle { get; set; } = string.Empty;
    public DateTime? MeetingStartTime { get; set; }
    public DateTime? MeetingEndTime { get; set; }
    public string? ConversationId { get; set; }
    public Guid CallerUserId { get; set; }
    public string CallerName { get; set; } = string.Empty;
    public Guid RecipientUserId { get; set; }
    public string RecipientEmail { get; set; } = string.Empty;
    public string RecipientName { get; set; } = string.Empty;
    public string CallType { get; set; } = "video";
    public string? JoinUrl { get; set; }
    public string Status { get; set; } = "Ringing";
    public string? StatusReason { get; set; }
    public string? CancellationMessage { get; set; }
    public Guid? CancellationMessageId { get; set; }
    public bool IsSeen { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? StatusChangedAt { get; set; }
}

public class CreateMeetingCallLogRequest
{
    public string? ConversationId { get; set; }
    public Guid RecipientUserId { get; set; }
    public string RecipientEmail { get; set; } = string.Empty;
    public string RecipientName { get; set; } = string.Empty;
    public string CallType { get; set; } = "video";
    public string? JoinUrl { get; set; }
}

public class UpdateMeetingCallLogRequest
{
    public string Status { get; set; } = "Ringing";
    public string? Reason { get; set; }
    public string? CancellationMessage { get; set; }
    public Guid? CancellationMessageId { get; set; }
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

public class UpdateWhiteboardRequest
{
    public string? WhiteboardData { get; set; }
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
    public string ResponseStatus { get; set; } = "Pending";
    public string? ResponseReason { get; set; }
    public DateTime? RespondedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class SendMeetingInvitesRequest
{
    public List<string> Emails { get; set; } = new();
}

public class UpdateMeetingInviteResponseRequest
{
    public string Status { get; set; } = "Accepted";
    public string? Reason { get; set; }
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
    public bool IsImportant { get; set; }
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
    public bool IsImportant { get; set; }
}

public class SendConversationAttachmentRequest
{
    public Guid SenderId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public string? Message { get; set; }
    public bool IsImportant { get; set; }
    public Guid? ReplyToMessageId { get; set; }
    public IFormFile? File { get; set; }
}

public class UpdateConversationMessageRequest
{
    public string Message { get; set; } = string.Empty;
    public bool? IsImportant { get; set; }
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

public class ConversationTaskDto
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public Guid? SourceMessageId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Priority { get; set; } = "Normal";
    public string Status { get; set; } = "Pending";
    public Guid OwnerId { get; set; }
    public string OwnerName { get; set; } = string.Empty;
    public Guid? AssigneeId { get; set; }
    public string? AssigneeEmail { get; set; }
    public string? AssigneeName { get; set; }
    public DateTime? DueDate { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? SourceMessagePreview { get; set; }
    public List<ConversationTaskNoteDto> Notes { get; set; } = new();
    public List<ConversationTaskActivityDto> Activities { get; set; } = new();
}

public class ConversationTaskNoteDto
{
    public Guid Id { get; set; }
    public Guid TaskId { get; set; }
    public Guid AuthorId { get; set; }
    public string AuthorName { get; set; } = string.Empty;
    public string Note { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class ConversationTaskActivityDto
{
    public Guid Id { get; set; }
    public Guid TaskId { get; set; }
    public Guid ActorId { get; set; }
    public string ActorName { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string? Details { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class CreateConversationTaskRequest
{
    public Guid? SourceMessageId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Priority { get; set; } = "Normal";
    public Guid? AssigneeId { get; set; }
    public string? AssigneeEmail { get; set; }
    public string? AssigneeName { get; set; }
    public DateTime? DueDate { get; set; }
}

public class UpdateConversationTaskRequest
{
    public string? Title { get; set; }
    public string? Description { get; set; }
    public string? Priority { get; set; }
    public string? Status { get; set; }
    public Guid? AssigneeId { get; set; }
    public string? AssigneeEmail { get; set; }
    public string? AssigneeName { get; set; }
    public DateTime? DueDate { get; set; }
}

public class AddConversationTaskNoteRequest
{
    public string Note { get; set; } = string.Empty;
}

public class ShareConversationDocumentRequest
{
    public List<string> Emails { get; set; } = new();
    public string? Message { get; set; }
}

public class ConversationDocumentShareDto
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public Guid MessageId { get; set; }
    public Guid SharedByUserId { get; set; }
    public string SharedByName { get; set; } = string.Empty;
    public List<string> RecipientEmails { get; set; } = new();
    public string? OptionalMessage { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class GlobalSearchResultDto
{
    public string Kind { get; set; } = string.Empty;
    public Guid Id { get; set; }
    public Guid? ConversationId { get; set; }
    public Guid? MeetingId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Snippet { get; set; }
    public DateTime? OccurredAt { get; set; }
}
