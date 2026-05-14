using Microsoft.AspNetCore.SignalR;

namespace NotificationService.Hubs;

public class NotificationHub : Hub
{
    private readonly ILogger<NotificationHub> _logger;

    public NotificationHub(ILogger<NotificationHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client connected: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("Client disconnected: {ConnectionId}", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinMeetingGroup(string meetingId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"meeting_{meetingId}");
        _logger.LogInformation("Client joined meeting group: {ConnectionId}, {MeetingId}", Context.ConnectionId, meetingId);
    }

    public async Task LeaveMeetingGroup(string meetingId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"meeting_{meetingId}");
        _logger.LogInformation("Client left meeting group: {ConnectionId}, {MeetingId}", Context.ConnectionId, meetingId);
    }

    public async Task JoinUserNotifications(string userId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");
        _logger.LogInformation("Client joined user notifications: {ConnectionId}, {UserId}", Context.ConnectionId, userId);
    }

    public async Task JoinConversation(string conversationId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"conversation_{conversationId}");
        _logger.LogInformation("Client joined conversation: {ConnectionId}, {ConversationId}", Context.ConnectionId, conversationId);
    }

    public async Task LeaveConversation(string conversationId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"conversation_{conversationId}");
        _logger.LogInformation("Client left conversation: {ConnectionId}, {ConversationId}", Context.ConnectionId, conversationId);
    }

    public async Task SendPrivateMessage(string userId, string message)
    {
        await Clients.Group($"user_{userId}").SendAsync("ReceiveNotification", message);
    }

    public async Task NotifyUserStatusChanged(string userId, string userName, string status)
    {
        await Clients.All.SendAsync("UserStatusChanged", new
        {
            UserId = userId,
            UserName = userName,
            Status = status,
            Timestamp = DateTime.UtcNow
        });
    }

    public async Task SendMeetingChatMessage(string meetingId, string senderId, string senderName, string message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return;
        }

        await Clients.Group($"meeting_{meetingId}").SendAsync("MeetingChatMessage", new
        {
            MeetingId = meetingId,
            SenderId = senderId,
            SenderName = senderName,
            Message = message.Trim(),
            Timestamp = DateTime.UtcNow
        });
    }

    public async Task SendDirectChatMessage(string meetingId, string recipientUserId, string senderId, string senderName, string recipientName, string message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return;
        }

        var payload = new
        {
            MeetingId = meetingId,
            SenderId = senderId,
            SenderName = senderName,
            RecipientUserId = recipientUserId,
            RecipientName = recipientName,
            Message = message.Trim(),
            Timestamp = DateTime.UtcNow
        };

        await Clients.Group($"user_{recipientUserId}").SendAsync("DirectChatMessage", payload);
        await Clients.Caller.SendAsync("DirectChatMessage", payload);
    }

    public async Task SendConversationMessage(string conversationId, string senderId, string senderName, string message, List<string> recipientUserIds)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return;
        }

        var payload = new
        {
            ConversationId = conversationId,
            SenderId = senderId,
            SenderName = senderName,
            Message = message.Trim(),
            Timestamp = DateTime.UtcNow
        };

        await Clients.OthersInGroup($"conversation_{conversationId}").SendAsync("ConversationMessageReceived", payload);

        foreach (var recipientUserId in recipientUserIds.Distinct())
        {
            await Clients.Group($"user_{recipientUserId}").SendAsync("ConversationMessageReceived", payload);
        }
    }

    public async Task SendWebRtcOffer(string meetingId, string senderUserId, string targetUserId, string sdp)
    {
        await Clients.OthersInGroup($"meeting_{meetingId}").SendAsync("WebRtcOffer", new
        {
            MeetingId = meetingId,
            SenderUserId = senderUserId,
            TargetUserId = targetUserId,
            Sdp = sdp
        });
    }

    public async Task SendWebRtcAnswer(string meetingId, string senderUserId, string targetUserId, string sdp)
    {
        await Clients.OthersInGroup($"meeting_{meetingId}").SendAsync("WebRtcAnswer", new
        {
            MeetingId = meetingId,
            SenderUserId = senderUserId,
            TargetUserId = targetUserId,
            Sdp = sdp
        });
    }

    public async Task SendWebRtcIceCandidate(string meetingId, string senderUserId, string targetUserId, string candidate)
    {
        await Clients.OthersInGroup($"meeting_{meetingId}").SendAsync("WebRtcIceCandidate", new
        {
            MeetingId = meetingId,
            SenderUserId = senderUserId,
            TargetUserId = targetUserId,
            Candidate = candidate
        });
    }

    public async Task NotifyParticipantMediaStatusChanged(string meetingId, string userId, string participantName, bool audioEnabled, bool videoEnabled, bool screenSharing)
    {
        await Clients.OthersInGroup($"meeting_{meetingId}").SendAsync("ParticipantMediaStatusChanged", new
        {
            MeetingId = meetingId,
            UserId = userId,
            ParticipantName = participantName,
            AudioEnabled = audioEnabled,
            VideoEnabled = videoEnabled,
            ScreenSharing = screenSharing,
            Timestamp = DateTime.UtcNow
        });
    }

    public async Task NotifyLobbyRequest(string meetingId, string requestId, string userId, string userName, string userEmail)
    {
        await Clients.Group($"meeting_{meetingId}").SendAsync("LobbyRequestReceived", new
        {
            MeetingId = meetingId,
            RequestId = requestId,
            UserId = userId,
            UserName = userName,
            UserEmail = userEmail,
            Timestamp = DateTime.UtcNow
        });
    }

    public async Task NotifyLobbyDecision(string meetingId, string userId, string userName, bool admitted)
    {
        var payload = new
        {
            MeetingId = meetingId,
            UserId = userId,
            UserName = userName,
            Admitted = admitted,
            Timestamp = DateTime.UtcNow
        };

        await Clients.Group($"user_{userId}").SendAsync("LobbyDecisionReceived", payload);
        await Clients.Group($"meeting_{meetingId}").SendAsync("LobbyDecisionReceived", payload);
    }

    public async Task NotifyParticipantJoined(string meetingId, string participantName)
    {
        await Clients.Group($"meeting_{meetingId}").SendAsync("ParticipantJoined", new
        {
            ParticipantName = participantName,
            Timestamp = DateTime.UtcNow
        });
    }

    public async Task NotifyParticipantLeft(string meetingId, string participantName)
    {
        await Clients.Group($"meeting_{meetingId}").SendAsync("ParticipantLeft", new
        {
            ParticipantName = participantName,
            Timestamp = DateTime.UtcNow
        });
    }

    public async Task NotifyScreenShareStarted(string meetingId, string participantName)
    {
        await Clients.Group($"meeting_{meetingId}").SendAsync("ScreenShareStarted", new
        {
            ParticipantName = participantName,
            Timestamp = DateTime.UtcNow
        });
    }

    public async Task NotifyScreenShareEnded(string meetingId, string participantName)
    {
        await Clients.Group($"meeting_{meetingId}").SendAsync("ScreenShareEnded", new
        {
            ParticipantName = participantName,
            Timestamp = DateTime.UtcNow
        });
    }

    public async Task NotifyMeetingStarted(string meetingId, string meetingTitle)
    {
        await Clients.Group($"meeting_{meetingId}").SendAsync("MeetingStarted", new
        {
            MeetingTitle = meetingTitle,
            Timestamp = DateTime.UtcNow
        });
    }

    public async Task NotifyMeetingEnded(string meetingId)
    {
        await Clients.Group($"meeting_{meetingId}").SendAsync("MeetingEnded", new
        {
            Timestamp = DateTime.UtcNow
        });
    }

    public async Task BroadcastMeetingInvite(string userId, string meetingId, string meetingTitle, string organizerName)
    {
        await Clients.Group($"user_{userId}").SendAsync("MeetingInvite", new
        {
            MeetingId = meetingId,
            MeetingTitle = meetingTitle,
            OrganizerName = organizerName,
            Timestamp = DateTime.UtcNow
        });
    }
}
