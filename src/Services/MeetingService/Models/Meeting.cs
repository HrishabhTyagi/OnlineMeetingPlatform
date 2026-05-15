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

public class Meeting
{
    public Guid Id { get; set; }
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

public class Conversation
{
    public Guid Id { get; set; }
    public ConversationType Type { get; set; } = ConversationType.Direct;
    public string? Title { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ICollection<ConversationMember> Members { get; set; } = new List<ConversationMember>();
    public ICollection<ConversationMessage> Messages { get; set; } = new List<ConversationMessage>();
    public ICollection<ConversationInvite> Invites { get; set; } = new List<ConversationInvite>();
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
    public string Message { get; set; } = string.Empty;
    public string? AttachmentFileName { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentContentType { get; set; }
    public long? AttachmentSizeBytes { get; set; }
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }
    public bool IsDeleted { get; set; }

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
