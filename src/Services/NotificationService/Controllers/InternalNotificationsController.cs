using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using NotificationService.Hubs;

namespace NotificationService.Controllers;

[ApiController]
[Route("api/internal/notifications")]
public class InternalNotificationsController : ControllerBase
{
    private readonly IHubContext<NotificationHub> _hubContext;

    public InternalNotificationsController(IHubContext<NotificationHub> hubContext)
    {
        _hubContext = hubContext;
    }

    [HttpPost("conversation-message")]
    public async Task<IActionResult> SendConversationMessage([FromBody] InternalConversationMessageNotification request)
    {
        if (string.IsNullOrWhiteSpace(request.ConversationId) || string.IsNullOrWhiteSpace(request.MessageId))
        {
            return BadRequest("Conversation and message are required");
        }

        var payload = new
        {
            Id = request.MessageId,
            ConversationId = request.ConversationId,
            SenderId = request.SenderId,
            SenderName = request.SenderName,
            Message = request.Message,
            Timestamp = request.Timestamp
        };

        await _hubContext.Clients.Group($"conversation_{request.ConversationId}").SendAsync("ConversationMessageReceived", payload);

        foreach (var recipientUserId in request.RecipientUserIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct())
        {
            await _hubContext.Clients.Group($"user_{recipientUserId}").SendAsync("ConversationMessageReceived", payload);
        }

        return Accepted();
    }
}

public class InternalConversationMessageNotification
{
    public string ConversationId { get; set; } = string.Empty;
    public string MessageId { get; set; } = string.Empty;
    public string SenderId { get; set; } = string.Empty;
    public string SenderName { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public List<string> RecipientUserIds { get; set; } = new();
}
