using Microsoft.AspNetCore.SignalR;
using NotificationService.Hubs;
using NotificationService.Services;
using Samvaad.Common.Events;
using Samvaad.Common.Messaging;

namespace NotificationService.Consumers;

public sealed class ConversationMessageCreatedNotificationHandler : IEventHandler<ConversationMessageCreatedEvent>
{
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly INotificationEventCheckpointStore _checkpointStore;
    private readonly INotificationPushSender _pushSender;

    public ConversationMessageCreatedNotificationHandler(IHubContext<NotificationHub> hubContext, INotificationEventCheckpointStore checkpointStore, INotificationPushSender? pushSender = null)
    {
        _hubContext = hubContext;
        _checkpointStore = checkpointStore;
        _pushSender = pushSender ?? new NoopNotificationPushSender();
    }

    public async Task HandleAsync(ConversationMessageCreatedEvent message, CancellationToken cancellationToken)
    {
        await _checkpointStore.ExecuteOnceAsync(message, nameof(ConversationMessageCreatedNotificationHandler), async ct =>
        {
        var payload = new
        {
            Id = message.MessageId,
            message.ConversationId,
            message.SenderId,
            message.SenderName,
            message.Message,
            message.AttachmentFileName,
            message.AttachmentUrl,
            message.AttachmentContentType,
            message.AttachmentSizeBytes,
            message.ReplyToMessageId,
            message.ReplyToSenderName,
            message.ReplyToPreview,
            message.IsImportant,
            message.Timestamp
        };

        await _hubContext.Clients.Group($"conversation_{message.ConversationId}").SendAsync("ConversationMessageReceived", payload, ct);
        foreach (var recipientUserId in DistinctIds(message.RecipientUserIds))
        {
            await _hubContext.Clients.Group($"user_{recipientUserId}").SendAsync("ConversationMessageReceived", payload, ct);
        }
        await _pushSender.SendToUsersAsync(DistinctIds(message.RecipientUserIds), message.SenderName, message.Message, new Dictionary<string, string>
        {
            ["type"] = "chat",
            ["conversationId"] = message.ConversationId,
            ["messageId"] = message.MessageId
        }, ct);
        }, cancellationToken);
    }

    private static IEnumerable<string> DistinctIds(IEnumerable<string> userIds)
    {
        return userIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase);
    }
}

public sealed class ConversationMessageUpdatedNotificationHandler : IEventHandler<ConversationMessageUpdatedEvent>
{
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly INotificationEventCheckpointStore _checkpointStore;

    public ConversationMessageUpdatedNotificationHandler(IHubContext<NotificationHub> hubContext, INotificationEventCheckpointStore checkpointStore)
    {
        _hubContext = hubContext;
        _checkpointStore = checkpointStore;
    }

    public async Task HandleAsync(ConversationMessageUpdatedEvent message, CancellationToken cancellationToken)
    {
        await _checkpointStore.ExecuteOnceAsync(message, nameof(ConversationMessageUpdatedNotificationHandler), async ct =>
        {
        var payload = new
        {
            Id = message.MessageId,
            message.ConversationId,
            message.SenderId,
            message.SenderName,
            message.Message,
            message.EditedAt,
            message.IsImportant,
            Timestamp = message.OccurredAtUtc
        };

        await _hubContext.Clients.Group($"conversation_{message.ConversationId}").SendAsync("ConversationMessageUpdated", payload, ct);
        foreach (var recipientUserId in message.RecipientUserIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            await _hubContext.Clients.Group($"user_{recipientUserId}").SendAsync("ConversationMessageUpdated", payload, ct);
        }
        }, cancellationToken);
    }
}

public sealed class ConversationReactionNotificationHandler : IEventHandler<ConversationMessageReactionUpdatedEvent>
{
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly INotificationEventCheckpointStore _checkpointStore;

    public ConversationReactionNotificationHandler(IHubContext<NotificationHub> hubContext, INotificationEventCheckpointStore checkpointStore)
    {
        _hubContext = hubContext;
        _checkpointStore = checkpointStore;
    }

    public async Task HandleAsync(ConversationMessageReactionUpdatedEvent message, CancellationToken cancellationToken)
    {
        await _checkpointStore.ExecuteOnceAsync(message, nameof(ConversationReactionNotificationHandler), async ct =>
        {
        var payload = new
        {
            message.ConversationId,
            message.MessageId,
            message.Reactions,
            Timestamp = message.OccurredAtUtc
        };

        await _hubContext.Clients.Group($"conversation_{message.ConversationId}").SendAsync("ConversationMessageReactionUpdated", payload, ct);
        foreach (var recipientUserId in message.RecipientUserIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            await _hubContext.Clients.Group($"user_{recipientUserId}").SendAsync("ConversationMessageReactionUpdated", payload, ct);
        }
        }, cancellationToken);
    }
}

public sealed class IncomingMeetingCallNotificationHandler : IEventHandler<IncomingMeetingCallRequestedEvent>
{
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly INotificationEventCheckpointStore _checkpointStore;
    private readonly INotificationPushSender _pushSender;

    public IncomingMeetingCallNotificationHandler(IHubContext<NotificationHub> hubContext, INotificationEventCheckpointStore checkpointStore, INotificationPushSender? pushSender = null)
    {
        _hubContext = hubContext;
        _checkpointStore = checkpointStore;
        _pushSender = pushSender ?? new NoopNotificationPushSender();
    }

    public async Task HandleAsync(IncomingMeetingCallRequestedEvent message, CancellationToken cancellationToken)
    {
        await _checkpointStore.ExecuteOnceAsync(message, nameof(IncomingMeetingCallNotificationHandler), async ct =>
        {
        var payload = new
        {
            message.CallLogId,
            message.ConversationId,
            message.MeetingId,
            message.CallerUserId,
            message.CallerName,
            CallType = string.Equals(message.CallType, "video", StringComparison.OrdinalIgnoreCase) ? "video" : "audio",
            message.JoinUrl,
            Timestamp = message.OccurredAtUtc
        };

        foreach (var recipientUserId in message.RecipientUserIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            await _hubContext.Clients.Group($"user_{recipientUserId}").SendAsync("IncomingCall", payload, ct);
        }
        await _pushSender.SendToUsersAsync(message.RecipientUserIds, $"{message.CallerName} is calling", $"{payload.CallType} call", new Dictionary<string, string>
        {
            ["type"] = "call",
            ["meetingId"] = message.MeetingId,
            ["conversationId"] = message.ConversationId ?? string.Empty,
            ["callLogId"] = message.CallLogId ?? string.Empty
        }, ct);
        }, cancellationToken);
    }
}

public sealed class MeetingCallStatusNotificationHandler : IEventHandler<MeetingCallStatusChangedEvent>
{
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly INotificationEventCheckpointStore _checkpointStore;

    public MeetingCallStatusNotificationHandler(IHubContext<NotificationHub> hubContext, INotificationEventCheckpointStore checkpointStore)
    {
        _hubContext = hubContext;
        _checkpointStore = checkpointStore;
    }

    public async Task HandleAsync(MeetingCallStatusChangedEvent message, CancellationToken cancellationToken)
    {
        await _checkpointStore.ExecuteOnceAsync(message, nameof(MeetingCallStatusNotificationHandler), async ct =>
        {
        var normalizedStatus = message.Status switch
        {
            "Accepted" => "Accepted",
            "Declined" => "Declined",
            "Cancelled" => "Cancelled",
            "Failed" => "Failed",
            _ => "NoResponse"
        };

        if (normalizedStatus is "Cancelled" or "NoResponse")
        {
            await _hubContext.Clients.Group($"user_{message.RecipientUserId}").SendAsync("IncomingCallCancelled", new
            {
                message.ConversationId,
                message.MeetingId,
                message.CallerUserId,
                message.CallerName,
                Message = string.IsNullOrWhiteSpace(message.CancellationMessage)
                    ? normalizedStatus == "NoResponse" ? "Call ended after no response." : "Sorry, I called you by mistake."
                    : message.CancellationMessage,
                Reason = normalizedStatus,
                Timestamp = message.OccurredAtUtc
            }, ct);
        }

        await _hubContext.Clients.Group($"user_{message.CallerUserId}").SendAsync("IncomingCallResponse", new
        {
            message.CallLogId,
            message.ConversationId,
            message.MeetingId,
            message.CallerUserId,
            message.RecipientUserId,
            message.RecipientName,
            Status = normalizedStatus,
            Reason = message.Reason,
            Timestamp = message.OccurredAtUtc
        }, ct);
        }, cancellationToken);
    }
}

public sealed class ConversationTaskAssignedNotificationHandler : IEventHandler<ConversationTaskAssignedEvent>
{
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly INotificationEventCheckpointStore _checkpointStore;
    private readonly INotificationPushSender _pushSender;

    public ConversationTaskAssignedNotificationHandler(IHubContext<NotificationHub> hubContext, INotificationEventCheckpointStore checkpointStore, INotificationPushSender? pushSender = null)
    {
        _hubContext = hubContext;
        _checkpointStore = checkpointStore;
        _pushSender = pushSender ?? new NoopNotificationPushSender();
    }

    public async Task HandleAsync(ConversationTaskAssignedEvent message, CancellationToken cancellationToken)
    {
        await _checkpointStore.ExecuteOnceAsync(message, nameof(ConversationTaskAssignedNotificationHandler), async ct =>
        {
        if (string.IsNullOrWhiteSpace(message.AssigneeUserId))
        {
            return;
        }

        var payload = new
        {
            message.ConversationId,
            message.TaskId,
            message.Title,
            message.AssignedByName,
            message.DueDate,
            Timestamp = message.OccurredAtUtc
        };

        await _hubContext.Clients.Group($"user_{message.AssigneeUserId}").SendAsync("TaskAssigned", payload, ct);
        await _hubContext.Clients.Group($"user_{message.AssigneeUserId}").SendAsync("ReceiveNotification", $"Task assigned: {message.Title}", ct);
        await _pushSender.SendToUsersAsync(new[] { message.AssigneeUserId }, "Task assigned", message.Title, new Dictionary<string, string>
        {
            ["type"] = "tasks",
            ["conversationId"] = message.ConversationId.ToString(),
            ["taskId"] = message.TaskId.ToString()
        }, ct);
        }, cancellationToken);
    }
}

public sealed class MeetingRecordingReadyNotificationHandler : IEventHandler<MeetingRecordingReadyEvent>
{
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly INotificationEventCheckpointStore _checkpointStore;
    private readonly INotificationPushSender _pushSender;

    public MeetingRecordingReadyNotificationHandler(IHubContext<NotificationHub> hubContext, INotificationEventCheckpointStore checkpointStore, INotificationPushSender? pushSender = null)
    {
        _hubContext = hubContext;
        _checkpointStore = checkpointStore;
        _pushSender = pushSender ?? new NoopNotificationPushSender();
    }

    public async Task HandleAsync(MeetingRecordingReadyEvent message, CancellationToken cancellationToken)
    {
        await _checkpointStore.ExecuteOnceAsync(message, nameof(MeetingRecordingReadyNotificationHandler), async ct =>
        {
        var payload = new
        {
            message.MeetingId,
            message.MeetingTitle,
            message.RecordingUrl,
            Timestamp = message.OccurredAtUtc
        };

        foreach (var recipientUserId in message.RecipientUserIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            await _hubContext.Clients.Group($"user_{recipientUserId}").SendAsync("MeetingRecordingReady", payload, ct);
            await _hubContext.Clients.Group($"user_{recipientUserId}").SendAsync("ReceiveNotification", $"Recording is ready: {message.MeetingTitle}", ct);
        }
        await _pushSender.SendToUsersAsync(message.RecipientUserIds, "Recording is ready", message.MeetingTitle, new Dictionary<string, string>
        {
            ["type"] = "recording",
            ["meetingId"] = message.MeetingId.ToString(),
            ["recordingUrl"] = message.RecordingUrl
        }, ct);
        }, cancellationToken);
    }
}
