using Samvaad.Common.Messaging;

namespace Samvaad.Common.Events;

[RabbitEvent("conversation.message.created")]
public sealed record ConversationMessageCreatedEvent(
    Guid EventId,
    DateTime OccurredAtUtc,
    Guid? OrganizationId,
    string ConversationId,
    string MessageId,
    string SenderId,
    string SenderName,
    string Message,
    string? AttachmentFileName,
    string? AttachmentUrl,
    string? AttachmentContentType,
    long? AttachmentSizeBytes,
    string? ReplyToMessageId,
    string? ReplyToSenderName,
    string? ReplyToPreview,
    bool IsImportant,
    DateTime Timestamp,
    List<string> RecipientUserIds) : IEvent;

[RabbitEvent("conversation.message.updated")]
public sealed record ConversationMessageUpdatedEvent(
    Guid EventId,
    DateTime OccurredAtUtc,
    Guid? OrganizationId,
    string ConversationId,
    string MessageId,
    string SenderId,
    string SenderName,
    string Message,
    DateTime EditedAt,
    bool IsImportant,
    List<string> RecipientUserIds) : IEvent;

[RabbitEvent("conversation.message.reactions.updated")]
public sealed record ConversationMessageReactionUpdatedEvent(
    Guid EventId,
    DateTime OccurredAtUtc,
    Guid? OrganizationId,
    string ConversationId,
    string MessageId,
    List<ConversationReactionEventItem> Reactions,
    List<string> RecipientUserIds) : IEvent;

public sealed record ConversationReactionEventItem(
    string Id,
    string MessageId,
    string UserId,
    string UserName,
    string Emoji,
    DateTime CreatedAt);

[RabbitEvent("conversation.invite.email.requested")]
public sealed record ConversationInviteEmailRequestedEvent(
    Guid EventId,
    DateTime OccurredAtUtc,
    Guid? OrganizationId,
    Guid ConversationId,
    string RecipientEmail,
    string InviterName) : IEvent;

[RabbitEvent("conversation.document.email.requested")]
public sealed record DocumentShareEmailRequestedEvent(
    Guid EventId,
    DateTime OccurredAtUtc,
    Guid? OrganizationId,
    Guid ConversationId,
    Guid MessageId,
    string RecipientEmail,
    string SenderName,
    string? OptionalMessage) : IEvent;

[RabbitEvent("conversation.task.assigned")]
public sealed record ConversationTaskAssignedEvent(
    Guid EventId,
    DateTime OccurredAtUtc,
    Guid? OrganizationId,
    Guid ConversationId,
    Guid TaskId,
    string Title,
    string? AssigneeUserId,
    string? AssigneeEmail,
    string? AssigneeName,
    string AssignedByName,
    DateTime? DueDate) : IEvent;
