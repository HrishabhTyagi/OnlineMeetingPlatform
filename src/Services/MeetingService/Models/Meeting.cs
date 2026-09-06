namespace MeetingService.Models;

public enum MeetingStatus
{
    Scheduled,
    InProgress,
    Completed,
    Cancelled
}

public enum ParticipantRole
{
    Organizer,
    Presenter,
    Attendee
}

public enum LobbyStatus
{
    Waiting,
    Admitted,
    Denied
}

public enum MeetingInviteResponseStatus
{
    Pending,
    Accepted,
    Declined,
    Tentative
}

public enum MeetingCallStatus
{
    Ringing,
    Accepted,
    Declined,
    Cancelled,
    NoResponse,
    Failed
}

public enum ChatScope
{
    Everyone,
    Direct
}

public enum ConversationType
{
    Direct,
    Group
}

public enum TeamMemberRole
{
    Owner,
    Member
}

public enum TeamChannelTabKind
{
    Link,
    Notes,
    Files,
    Meetings
}

public enum ExternalCalendarProvider
{
    Google,
    Outlook
}

public enum ConversationTaskStatus
{
    Pending,
    InProgress,
    Completed
}

public enum ConversationTaskPriority
{
    Low,
    Normal,
    High,
    Urgent
}

public class Meeting
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
    public string? AttendeeEmails { get; set; }
    public string? Location { get; set; }
    public bool IsOnlineMeeting { get; set; } = true;
    public bool LobbyEnabled { get; set; } = true;
    public bool AllowChat { get; set; } = true;
    public bool AllowReactions { get; set; } = true;
    public bool AllowScreenShare { get; set; } = true;
    public bool AllowAttendeeUnmute { get; set; } = true;
    public bool AllowRecording { get; set; } = false;
    public bool AllowTranscription { get; set; } = false;
    public string? RecurrenceRule { get; set; }
    public string? WhiteboardData { get; set; }
    public string? Notes { get; set; }
    public string? Recap { get; set; }
    public MeetingStatus Status { get; set; } = MeetingStatus.Scheduled;
    public string? MeetingLink { get; set; }
    public bool IsRecorded { get; set; }
    public string? RecordingUrl { get; set; }
    public int MaxParticipants { get; set; } = 100;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<Participant> Participants { get; set; } = new List<Participant>();
    public ICollection<MeetingChatMessage> ChatMessages { get; set; } = new List<MeetingChatMessage>();
    public ICollection<MeetingInvite> Invites { get; set; } = new List<MeetingInvite>();
    public ICollection<LobbyRequest> LobbyRequests { get; set; } = new List<LobbyRequest>();
    public ICollection<MeetingReminder> Reminders { get; set; } = new List<MeetingReminder>();
    public ICollection<MeetingCallLog> CallLogs { get; set; } = new List<MeetingCallLog>();
    public MeetingIntelligence? Intelligence { get; set; }
    public TeamChannel? TeamChannel { get; set; }
}

public class MeetingIntelligence
{
    public Guid Id { get; set; }
    public Guid MeetingId { get; set; }
    public string RecordingUrl { get; set; } = string.Empty;
    public string Status { get; set; } = "Pending";
    public string? Transcript { get; set; }
    public string? TranscriptSegmentsJson { get; set; }
    public string? Summary { get; set; }
    public string? ActionItemsJson { get; set; }
    public string? Error { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAtUtc { get; set; }

    public Meeting Meeting { get; set; } = null!;
}

public class Participant
{
    public Guid Id { get; set; }
    public Guid MeetingId { get; set; }
    public Guid UserId { get; set; }
    public string UserEmail { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public ParticipantRole Role { get; set; } = ParticipantRole.Attendee;
    public bool IsAdmitted { get; set; } = true;
    public bool IsHandRaised { get; set; } = false;
    public string? Reaction { get; set; }
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LeftAt { get; set; }
    public bool IsAudioEnabled { get; set; } = true;
    public bool IsVideoEnabled { get; set; } = true;
    public bool IsScreenSharing { get; set; } = false;

    public Meeting Meeting { get; set; } = null!;
}

public class MeetingChatMessage
{
    public Guid Id { get; set; }
    public Guid MeetingId { get; set; }
    public Guid SenderId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public Guid? RecipientUserId { get; set; }
    public string? RecipientName { get; set; }
    public ChatScope Scope { get; set; } = ChatScope.Everyone;
    public string Message { get; set; } = string.Empty;
    public string? AttachmentFileName { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentContentType { get; set; }
    public long? AttachmentSizeBytes { get; set; }
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
    public bool IsDeleted { get; set; } = false;

    public Meeting Meeting { get; set; } = null!;
}

public class MeetingInvite
{
    public Guid Id { get; set; }
    public Guid MeetingId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public ParticipantRole Role { get; set; } = ParticipantRole.Attendee;
    public bool IsRequired { get; set; } = true;
    public bool HasAccepted { get; set; } = false;
    public MeetingInviteResponseStatus ResponseStatus { get; set; } = MeetingInviteResponseStatus.Pending;
    public string? ResponseReason { get; set; }
    public DateTime? RespondedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Meeting Meeting { get; set; } = null!;
}

public class LobbyRequest
{
    public Guid Id { get; set; }
    public Guid MeetingId { get; set; }
    public Guid UserId { get; set; }
    public string UserEmail { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public LobbyStatus Status { get; set; } = LobbyStatus.Waiting;
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DecidedAt { get; set; }

    public Meeting Meeting { get; set; } = null!;
}

public class MeetingReminder
{
    public Guid Id { get; set; }
    public Guid MeetingId { get; set; }
    public string RecipientEmail { get; set; } = string.Empty;
    public DateTime RemindAt { get; set; }
    public bool IsSent { get; set; } = false;
    public DateTime? SentAt { get; set; }

    public Meeting Meeting { get; set; } = null!;
}

public class MeetingCallLog
{
    public Guid Id { get; set; }
    public Guid? OrganizationId { get; set; }
    public Guid MeetingId { get; set; }
    public string? ConversationId { get; set; }
    public Guid CallerUserId { get; set; }
    public string CallerName { get; set; } = string.Empty;
    public Guid RecipientUserId { get; set; }
    public string RecipientEmail { get; set; } = string.Empty;
    public string RecipientName { get; set; } = string.Empty;
    public string CallType { get; set; } = "video";
    public string? JoinUrl { get; set; }
    public MeetingCallStatus Status { get; set; } = MeetingCallStatus.Ringing;
    public string? StatusReason { get; set; }
    public string? CancellationMessage { get; set; }
    public Guid? CancellationMessageId { get; set; }
    public DateTime? CallerSeenAt { get; set; }
    public DateTime? RecipientSeenAt { get; set; }
    public DateTime? CallerHiddenAt { get; set; }
    public DateTime? RecipientHiddenAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? StatusChangedAt { get; set; }

    public Meeting Meeting { get; set; } = null!;
}

public class Conversation
{
    public Guid Id { get; set; }
    public Guid? OrganizationId { get; set; }
    public ConversationType Type { get; set; } = ConversationType.Direct;
    public string? Title { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ICollection<ConversationMember> Members { get; set; } = new List<ConversationMember>();
    public ICollection<ConversationMessage> Messages { get; set; } = new List<ConversationMessage>();
    public ICollection<ConversationInvite> Invites { get; set; } = new List<ConversationInvite>();
    public ICollection<ScheduledConversationMessage> ScheduledMessages { get; set; } = new List<ScheduledConversationMessage>();
    public ICollection<ConversationTask> Tasks { get; set; } = new List<ConversationTask>();
    public ICollection<ConversationDocumentShare> DocumentShares { get; set; } = new List<ConversationDocumentShare>();
}

public class ConversationMember
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public Guid UserId { get; set; }
    public string UserEmail { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastReadAt { get; set; }

    public Conversation Conversation { get; set; } = null!;
}

public class ConversationMessage
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
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }
    public bool IsPinned { get; set; }
    public bool IsImportant { get; set; }
    public bool IsDeleted { get; set; }

    public Conversation Conversation { get; set; } = null!;
    public ICollection<ConversationMessageReaction> Reactions { get; set; } = new List<ConversationMessageReaction>();
    public ICollection<ConversationTask> Tasks { get; set; } = new List<ConversationTask>();
}

public class ConversationMessageReaction
{
    public Guid Id { get; set; }
    public Guid ConversationMessageId { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string Emoji { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ConversationMessage Message { get; set; } = null!;
}

public class ConversationTask
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public Guid? SourceMessageId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public ConversationTaskPriority Priority { get; set; } = ConversationTaskPriority.Normal;
    public ConversationTaskStatus Status { get; set; } = ConversationTaskStatus.Pending;
    public Guid OwnerId { get; set; }
    public string OwnerName { get; set; } = string.Empty;
    public Guid? AssigneeId { get; set; }
    public string? AssigneeEmail { get; set; }
    public string? AssigneeName { get; set; }
    public DateTime? DueDate { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public bool IsDeleted { get; set; }

    public Conversation Conversation { get; set; } = null!;
    public ConversationMessage? SourceMessage { get; set; }
    public ICollection<ConversationTaskNote> Notes { get; set; } = new List<ConversationTaskNote>();
    public ICollection<ConversationTaskActivity> Activities { get; set; } = new List<ConversationTaskActivity>();
}

public class ConversationTaskNote
{
    public Guid Id { get; set; }
    public Guid TaskId { get; set; }
    public Guid AuthorId { get; set; }
    public string AuthorName { get; set; } = string.Empty;
    public string Note { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ConversationTask Task { get; set; } = null!;
}

public class ConversationTaskActivity
{
    public Guid Id { get; set; }
    public Guid TaskId { get; set; }
    public Guid ActorId { get; set; }
    public string ActorName { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string? Details { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ConversationTask Task { get; set; } = null!;
}

public class ConversationDocumentShare
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public Guid MessageId { get; set; }
    public Guid SharedByUserId { get; set; }
    public string SharedByName { get; set; } = string.Empty;
    public string RecipientEmails { get; set; } = string.Empty;
    public string? OptionalMessage { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Conversation Conversation { get; set; } = null!;
    public ConversationMessage Message { get; set; } = null!;
}

public class PlatformAuditLog
{
    public Guid Id { get; set; }
    public Guid? OrganizationId { get; set; }
    public Guid? MeetingId { get; set; }
    public Guid? ConversationId { get; set; }
    public Guid ActorId { get; set; }
    public string ActorName { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string? Details { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Meeting? Meeting { get; set; }
    public Conversation? Conversation { get; set; }
}

public class IntegrationEventOutboxMessage
{
    public Guid Id { get; set; }
    public Guid EventId { get; set; }
    public string EventName { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public string ExchangeName { get; set; } = string.Empty;
    public string RoutingKey { get; set; } = string.Empty;
    public string Payload { get; set; } = string.Empty;
    public DateTime OccurredAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime AvailableAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? LockedUntilUtc { get; set; }
    public string? LockId { get; set; }
    public int RetryCount { get; set; }
    public DateTime? ProcessedAtUtc { get; set; }
    public DateTime? FailedAtUtc { get; set; }
    public string? LastError { get; set; }
}

public class IntegrationEventConsumerCheckpoint
{
    public Guid Id { get; set; }
    public Guid EventId { get; set; }
    public string EventName { get; set; } = string.Empty;
    public string HandlerName { get; set; } = string.Empty;
    public DateTime FirstSeenAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime LastAttemptAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ProcessedAtUtc { get; set; }
    public int AttemptCount { get; set; }
    public string? LastError { get; set; }
}

public class ScheduledConversationMessage
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public Guid SenderId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTime ScheduledFor { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? SentAt { get; set; }
    public string Status { get; set; } = "Pending";

    public Conversation Conversation { get; set; } = null!;
}

public class ConversationInvite
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public string Email { get; set; } = string.Empty;
    public Guid InvitedByUserId { get; set; }
    public string InvitedByName { get; set; } = string.Empty;
    public bool HasAccepted { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? AcceptedAt { get; set; }

    public Conversation Conversation { get; set; } = null!;
}

public class TeamSpace
{
    public Guid Id { get; set; }
    public Guid? OrganizationId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid OwnerUserId { get; set; }
    public bool IsArchived { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ICollection<TeamSpaceMember> Members { get; set; } = new List<TeamSpaceMember>();
    public ICollection<TeamChannel> Channels { get; set; } = new List<TeamChannel>();
}

public class TeamSpaceMember
{
    public Guid Id { get; set; }
    public Guid TeamSpaceId { get; set; }
    public Guid UserId { get; set; }
    public string UserEmail { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public TeamMemberRole Role { get; set; } = TeamMemberRole.Member;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;

    public TeamSpace TeamSpace { get; set; } = null!;
}

public class TeamChannel
{
    public Guid Id { get; set; }
    public Guid TeamSpaceId { get; set; }
    public Guid ConversationId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public TeamSpace TeamSpace { get; set; } = null!;
    public Conversation Conversation { get; set; } = null!;
    public ICollection<TeamChannelTab> Tabs { get; set; } = new List<TeamChannelTab>();
    public ICollection<Meeting> Meetings { get; set; } = new List<Meeting>();
}

public class TeamChannelTab
{
    public Guid Id { get; set; }
    public Guid TeamChannelId { get; set; }
    public string Title { get; set; } = string.Empty;
    public TeamChannelTabKind Kind { get; set; } = TeamChannelTabKind.Link;
    public string? Url { get; set; }
    public string? Content { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public TeamChannel TeamChannel { get; set; } = null!;
}

public class CalendarConnection
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public ExternalCalendarProvider Provider { get; set; }
    public string? AccountEmail { get; set; }
    public string CalendarId { get; set; } = "primary";
    public string AccessToken { get; set; } = string.Empty;
    public string? RefreshToken { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public bool IsEnabled { get; set; } = true;
    public DateTime? LastSyncAt { get; set; }
    public string? LastError { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class ExternalCalendarEvent
{
    public Guid Id { get; set; }
    public Guid MeetingId { get; set; }
    public Guid UserId { get; set; }
    public ExternalCalendarProvider Provider { get; set; }
    public string CalendarId { get; set; } = "primary";
    public string ExternalEventId { get; set; } = string.Empty;
    public string? HtmlLink { get; set; }
    public DateTime LastSyncedAt { get; set; } = DateTime.UtcNow;
    public string? LastError { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Meeting Meeting { get; set; } = null!;
}
