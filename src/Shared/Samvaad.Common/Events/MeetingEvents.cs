using Samvaad.Common.Messaging;

namespace Samvaad.Common.Events;

[RabbitEvent("meeting.invite.email.requested")]
public sealed record MeetingInviteEmailRequestedEvent(
    Guid EventId,
    DateTime OccurredAtUtc,
    Guid? OrganizationId,
    Guid MeetingId,
    Guid InviteId,
    string RecipientEmail) : IEvent;

[RabbitEvent("meeting.call.requested")]
public sealed record IncomingMeetingCallRequestedEvent(
    Guid EventId,
    DateTime OccurredAtUtc,
    Guid? OrganizationId,
    string ConversationId,
    string MeetingId,
    string CallLogId,
    string CallerUserId,
    string CallerName,
    string CallType,
    string JoinUrl,
    List<string> RecipientUserIds) : IEvent;

[RabbitEvent("meeting.call.status.changed")]
public sealed record MeetingCallStatusChangedEvent(
    Guid EventId,
    DateTime OccurredAtUtc,
    Guid? OrganizationId,
    string ConversationId,
    string MeetingId,
    string? CallLogId,
    string CallerUserId,
    string CallerName,
    string RecipientUserId,
    string RecipientName,
    string Status,
    string? Reason,
    string? CancellationMessage) : IEvent;

[RabbitEvent("meeting.recording.ready")]
public sealed record MeetingRecordingReadyEvent(
    Guid EventId,
    DateTime OccurredAtUtc,
    Guid? OrganizationId,
    Guid MeetingId,
    string MeetingTitle,
    string RecordingUrl,
    List<string> RecipientUserIds) : IEvent;
