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
    private const long MaxAttachmentBytes = 50 * 1024 * 1024;
    private readonly IMeetingService _meetingService;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<ConversationsController> _logger;

    public ConversationsController(IMeetingService meetingService, IWebHostEnvironment environment, ILogger<ConversationsController> logger)
    {
        _meetingService = meetingService;
        _environment = environment;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<List<ConversationDto>>> GetConversations()
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var conversations = await _meetingService.GetConversationsAsync(userId, GetCurrentUserEmail(), GetCurrentUserName());
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

    [HttpPost("{conversationId}/messages/attachments")]
    [RequestSizeLimit(MaxAttachmentBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxAttachmentBytes)]
    public async Task<ActionResult<ConversationMessageDto>> SendAttachment(Guid conversationId, [FromForm] SendConversationAttachmentRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        if (request.File == null || request.File.Length == 0)
        {
            return BadRequest("Attachment file is required");
        }

        if (request.File.Length > MaxAttachmentBytes)
        {
            return BadRequest("Attachment must be 50 MB or smaller");
        }

        if (!await _meetingService.CanAccessConversationAsync(conversationId, userId))
        {
            return NotFound("Conversation not found");
        }

        try
        {
            var originalFileName = Path.GetFileName(request.File.FileName);
            if (string.IsNullOrWhiteSpace(originalFileName))
            {
                originalFileName = "attachment";
            }

            var extension = Path.GetExtension(originalFileName);
            var storedFileName = $"{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}{extension}";
            var attachmentDirectory = Path.Combine(_environment.ContentRootPath, "ChatAttachments", conversationId.ToString());
            Directory.CreateDirectory(attachmentDirectory);

            var filePath = Path.Combine(attachmentDirectory, storedFileName);
            await using (var stream = System.IO.File.Create(filePath))
            {
                await request.File.CopyToAsync(stream);
            }

            var attachmentUrl = $"/api/conversations/{conversationId}/attachments/{storedFileName}";
            var contentType = string.IsNullOrWhiteSpace(request.File.ContentType)
                ? "application/octet-stream"
                : request.File.ContentType;

            var message = await _meetingService.AddConversationMessageAsync(conversationId, new SendConversationMessageRequest
            {
                SenderId = userId,
                SenderName = GetCurrentUserName(),
                Message = request.Message ?? string.Empty,
                AttachmentFileName = originalFileName,
                AttachmentUrl = attachmentUrl,
                AttachmentContentType = contentType,
                AttachmentSizeBytes = request.File.Length
            });

            return Ok(MapMessageToDto(message));
        }
        catch (InvalidOperationException)
        {
            return NotFound("Conversation not found");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending conversation attachment");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet("{conversationId}/attachments/{fileName}")]
    public async Task<IActionResult> GetAttachment(Guid conversationId, string fileName)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        if (!await _meetingService.CanAccessConversationAsync(conversationId, userId))
        {
            return NotFound();
        }

        var safeFileName = Path.GetFileName(fileName);
        var filePath = Path.Combine(_environment.ContentRootPath, "ChatAttachments", conversationId.ToString(), safeFileName);
        if (!System.IO.File.Exists(filePath))
        {
            return NotFound();
        }

        return PhysicalFile(filePath, "application/octet-stream", enableRangeProcessing: true);
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(userIdClaim, out userId);
    }

    private string? GetCurrentUserEmail()
    {
        return User.FindFirst(ClaimTypes.Email)?.Value;
    }

    private string GetCurrentUserName()
    {
        var firstName = User.FindFirst(ClaimTypes.GivenName)?.Value;
        var lastName = User.FindFirst(ClaimTypes.Surname)?.Value;
        var fullName = $"{firstName} {lastName}".Trim();
        return string.IsNullOrWhiteSpace(fullName) ? GetCurrentUserEmail() ?? "User" : fullName;
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
            Invites = conversation.Invites
                .OrderBy(invite => invite.Email)
                .Select(invite => new ConversationInviteDto
                {
                    Id = invite.Id,
                    Email = invite.Email,
                    HasAccepted = invite.HasAccepted,
                    CreatedAt = invite.CreatedAt
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
            AttachmentFileName = message.AttachmentFileName,
            AttachmentUrl = message.AttachmentUrl,
            AttachmentContentType = message.AttachmentContentType,
            AttachmentSizeBytes = message.AttachmentSizeBytes,
            SentAt = message.SentAt
        };
    }
}
