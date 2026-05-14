using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MeetingService.Models;
using MeetingService.Services;

namespace MeetingService.Controllers;

[ApiController]
[Route("api/conversations")]
[Authorize]
public class ConversationsController : ControllerBase
{
    private readonly IMeetingService _meetingService;
    private readonly ILogger<ConversationsController> _logger;

    public ConversationsController(IMeetingService meetingService, ILogger<ConversationsController> logger)
    {
        _meetingService = meetingService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<List<ConversationDto>>> GetConversations()
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var conversations = await _meetingService.GetConversationsAsync(userId);
        return Ok(conversations.Select(MapToDto).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<ConversationDto>> CreateConversation([FromBody] CreateConversationRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var conversation = await _meetingService.CreateConversationAsync(userId, request);
            return Ok(MapToDto(conversation));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating conversation");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet("{conversationId}/messages")]
    public async Task<ActionResult<List<ConversationMessageDto>>> GetMessages(Guid conversationId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var messages = await _meetingService.GetConversationMessagesAsync(conversationId, userId);
            return Ok(messages.Select(MapMessageToDto).ToList());
        }
        catch (InvalidOperationException)
        {
            return NotFound("Conversation not found");
        }
    }

    [HttpPost("{conversationId}/messages")]
    public async Task<ActionResult<ConversationMessageDto>> SendMessage(Guid conversationId, [FromBody] SendConversationMessageRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest("Message is required");
        }

        try
        {
            var message = await _meetingService.AddConversationMessageAsync(conversationId, request);
            return Ok(MapMessageToDto(message));
        }
        catch (InvalidOperationException)
        {
            return NotFound("Conversation not found");
        }
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(userIdClaim, out userId);
    }

    private static ConversationDto MapToDto(Conversation conversation)
    {
        return new ConversationDto
        {
            Id = conversation.Id,
            Type = conversation.Type.ToString(),
            Title = conversation.Title,
            Members = conversation.Members
                .OrderBy(member => member.UserName)
                .Select(member => new ConversationMemberDto
                {
                    UserId = member.UserId,
                    UserEmail = member.UserEmail,
                    UserName = member.UserName
                })
                .ToList(),
            LastMessage = conversation.Messages
                .Where(message => !message.IsDeleted)
                .OrderByDescending(message => message.SentAt)
                .Select(MapMessageToDto)
                .FirstOrDefault(),
            CreatedAt = conversation.CreatedAt,
            UpdatedAt = conversation.UpdatedAt
        };
    }

    private static ConversationMessageDto MapMessageToDto(ConversationMessage message)
    {
        return new ConversationMessageDto
        {
            Id = message.Id,
            ConversationId = message.ConversationId,
            SenderId = message.SenderId,
            SenderName = message.SenderName,
            Message = message.Message,
            SentAt = message.SentAt
        };
    }
}
