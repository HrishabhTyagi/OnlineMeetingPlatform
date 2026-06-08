using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using MeetingService.Models;
using MeetingService.Services;

namespace MeetingService.Controllers;

[ApiController]
[Route("api/meetings/{meetingId}/chat")]
[Authorize]
public class ChatController : ControllerBase
{
    private const long MaxAttachmentRequestBytes = 512 * 1024 * 1024;
    private static readonly HashSet<string> BlockedAttachmentExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".exe", ".bat", ".cmd", ".com", ".scr", ".ps1", ".vbs", ".js", ".jar", ".msi"
    };

    private readonly IMeetingService _meetingService;
    private readonly IOrganizationStorageService _storageService;
    private readonly ILogger<ChatController> _logger;

    public ChatController(
        IMeetingService meetingService,
        IOrganizationStorageService storageService,
        ILogger<ChatController> logger)
    {
        _meetingService = meetingService;
        _storageService = storageService;
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

    [HttpPost("attachments")]
    [RequestSizeLimit(MaxAttachmentRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxAttachmentRequestBytes)]
    public async Task<ActionResult<ChatMessageDto>> SendAttachment(Guid meetingId, [FromForm] SendMeetingChatAttachmentRequest request)
    {
        try
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized();
            }

            if (request.File == null || request.File.Length == 0)
            {
                return BadRequest("Attachment file is required");
            }

            var settings = await _storageService.GetSettingsAsync();
            var maxAttachmentBytes = (long)settings.MaxAttachmentMegabytes * 1024 * 1024;
            if (request.File.Length > maxAttachmentBytes)
            {
                return BadRequest($"Attachment must be {settings.MaxAttachmentMegabytes} MB or smaller");
            }

            var originalFileName = Path.GetFileName(request.File.FileName);
            if (string.IsNullOrWhiteSpace(originalFileName))
            {
                originalFileName = "attachment";
            }

            var extension = Path.GetExtension(originalFileName);
            if (BlockedAttachmentExtensions.Contains(extension))
            {
                return BadRequest("This file type is not allowed");
            }

            var storedFileName = $"{Guid.NewGuid():N}{extension}";
            var storedFile = await _storageService.SaveAsync(OrganizationFileKind.MeetingChatAttachment, meetingId, request.File, storedFileName);
            var contentType = string.IsNullOrWhiteSpace(request.File.ContentType)
                ? "application/octet-stream"
                : request.File.ContentType;

            var message = await _meetingService.AddChatMessageAsync(meetingId, new CreateChatMessageRequest
            {
                SenderId = userId,
                SenderName = GetCurrentUserName(),
                Message = request.Message ?? string.Empty,
                AttachmentFileName = originalFileName,
                AttachmentUrl = storedFile.PublicUrl,
                AttachmentContentType = contentType,
                AttachmentSizeBytes = request.File.Length
            });

            return Ok(MapToDto(message));
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending meeting chat attachment");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpGet("attachments/{fileName}")]
    public async Task<IActionResult> GetAttachment(Guid meetingId, string fileName)
    {
        try
        {
            Guid? currentUserId = null;
            if (TryGetCurrentUserId(out var parsedUserId))
            {
                currentUserId = parsedUserId;
            }

            var messages = await _meetingService.GetChatMessagesAsync(meetingId, currentUserId);
            var message = messages.FirstOrDefault(item =>
                !string.IsNullOrWhiteSpace(item.AttachmentUrl) &&
                string.Equals(Path.GetFileName(item.AttachmentUrl), fileName, StringComparison.OrdinalIgnoreCase));

            if (message == null)
            {
                return NotFound();
            }

            var filePath = await _storageService.GetPhysicalPathAsync(OrganizationFileKind.MeetingChatAttachment, meetingId, fileName);
            if (filePath == null)
            {
                return NotFound();
            }

            return PhysicalFile(filePath, message.AttachmentContentType ?? "application/octet-stream", Path.GetFileName(message.AttachmentFileName ?? fileName), enableRangeProcessing: true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching meeting chat attachment");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPost]
    public async Task<ActionResult<ChatMessageDto>> SendMessage(Guid meetingId, [FromBody] CreateChatMessageRequest request)
    {
        try
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized();
            }

            if (string.IsNullOrWhiteSpace(request.Message))
            {
                return BadRequest("Message is required");
            }

            request.SenderId = userId;
            request.SenderName = GetCurrentUserName();
            var message = await _meetingService.AddChatMessageAsync(meetingId, request);
            return Ok(MapToDto(message));
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending chat message");
            return StatusCode(500, "An error occurred");
        }
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
            AttachmentFileName = message.AttachmentFileName,
            AttachmentUrl = message.AttachmentUrl,
            AttachmentContentType = message.AttachmentContentType,
            AttachmentSizeBytes = message.AttachmentSizeBytes,
            SentAt = message.SentAt
        };
    }
}

public class SendMeetingChatAttachmentRequest
{
    public string? Message { get; set; }
    public IFormFile? File { get; set; }
}
