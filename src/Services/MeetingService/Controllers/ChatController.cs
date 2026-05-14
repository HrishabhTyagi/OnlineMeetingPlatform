using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MeetingService.Models;
using MeetingService.Services;

namespace MeetingService.Controllers;

[ApiController]
[Route("api/meetings/{meetingId}/chat")]
[Authorize]
public class ChatController : ControllerBase
{
    private readonly IMeetingService _meetingService;
    private readonly ILogger<ChatController> _logger;

    public ChatController(IMeetingService meetingService, ILogger<ChatController> logger)
    {
        _meetingService = meetingService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<List<ChatMessageDto>>> GetMessages(Guid meetingId)
    {
        try
        {
            Guid? currentUserId = null;
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (Guid.TryParse(userIdClaim, out var parsedUserId))
            {
                currentUserId = parsedUserId;
            }

            var messages = await _meetingService.GetChatMessagesAsync(meetingId, currentUserId);
            return Ok(messages.Select(MapToDto).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching chat messages");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPost]
    public async Task<ActionResult<ChatMessageDto>> SendMessage(Guid meetingId, [FromBody] CreateChatMessageRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Message))
            {
                return BadRequest("Message is required");
            }

            var message = await _meetingService.AddChatMessageAsync(meetingId, request);
            return Ok(MapToDto(message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending chat message");
            return StatusCode(500, "An error occurred");
        }
    }

    private static ChatMessageDto MapToDto(MeetingChatMessage message)
    {
        return new ChatMessageDto
        {
            Id = message.Id,
            MeetingId = message.MeetingId,
            SenderId = message.SenderId,
            SenderName = message.SenderName,
            RecipientUserId = message.RecipientUserId,
            RecipientName = message.RecipientName,
            Scope = message.Scope.ToString(),
            Message = message.Message,
            SentAt = message.SentAt
        };
    }
}
