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
    private const long MaxAttachmentRequestBytes = 512 * 1024 * 1024;
    private static readonly HashSet<string> BlockedAttachmentExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".bat",
        ".cmd",
        ".com",
        ".dll",
        ".exe",
        ".hta",
        ".js",
        ".jse",
        ".msi",
        ".ps1",
        ".scr",
        ".sh",
        ".vbs",
        ".wsf"
    };

    private readonly IMeetingService _meetingService;
    private readonly IOrganizationStorageService _storageService;
    private readonly ILogger<ConversationsController> _logger;

    public ConversationsController(IMeetingService meetingService, IOrganizationStorageService storageService, ILogger<ConversationsController> logger)
    {
        _meetingService = meetingService;
        _storageService = storageService;
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
        return Ok(conversations.Select(conversation => MapToDto(conversation, userId)).ToList());
    }

    [HttpGet("search")]
    public async Task<ActionResult<List<GlobalSearchResultDto>>> Search([FromQuery] string query)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var results = await _meetingService.SearchAsync(userId, query);
        return Ok(results);
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
            return Ok(MapToDto(conversation, userId));
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

    [HttpPost("{conversationId}/read")]
    public async Task<IActionResult> MarkRead(Guid conversationId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await _meetingService.MarkConversationReadAsync(conversationId, userId);
            return NoContent();
        }
        catch (InvalidOperationException)
        {
            return NotFound("Conversation not found");
        }
    }

    [HttpPost("{conversationId}/messages/{messageId}/unread")]
    public async Task<IActionResult> MarkUnread(Guid conversationId, Guid messageId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await _meetingService.MarkConversationUnreadAsync(conversationId, messageId, userId);
            return NoContent();
        }
        catch (InvalidOperationException ex) when (ex.Message == "Message not found")
        {
            return NotFound(ex.Message);
        }
        catch (InvalidOperationException)
        {
            return NotFound("Conversation not found");
        }
    }

    [HttpPost("{conversationId}/messages")]
    public async Task<ActionResult<ConversationMessageDto>> SendMessage(Guid conversationId, [FromBody] SendConversationMessageRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest("Message is required");
        }

        try
        {
            request.SenderId = userId;
            request.SenderName = GetCurrentUserName();
            var message = await _meetingService.AddConversationMessageAsync(conversationId, request);
            return Ok(MapMessageToDto(message));
        }
        catch (InvalidOperationException)
        {
            return NotFound("Conversation not found");
        }
    }

    [HttpGet("{conversationId}/tasks")]
    public async Task<ActionResult<List<ConversationTaskDto>>> GetTasks(
        Guid conversationId,
        [FromQuery] string? status,
        [FromQuery] string? priority,
        [FromQuery] Guid? assigneeId,
        [FromQuery] DateTime? dueBefore,
        [FromQuery] string? query)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var tasks = await _meetingService.GetConversationTasksAsync(conversationId, userId, status, priority, assigneeId, dueBefore, query);
            return Ok(tasks.Select(MapTaskToDto).ToList());
        }
        catch (InvalidOperationException)
        {
            return NotFound("Conversation not found");
        }
    }

    [HttpPost("{conversationId}/tasks")]
    public async Task<ActionResult<ConversationTaskDto>> CreateTask(Guid conversationId, [FromBody] CreateConversationTaskRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var task = await _meetingService.CreateConversationTaskAsync(conversationId, userId, GetCurrentUserName(), request);
            return Ok(MapTaskToDto(task));
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("required", StringComparison.OrdinalIgnoreCase) || ex.Message.Contains("Assignee", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException)
        {
            return NotFound("Conversation not found");
        }
    }

    [HttpPut("{conversationId}/tasks/{taskId}")]
    public async Task<ActionResult<ConversationTaskDto>> UpdateTask(Guid conversationId, Guid taskId, [FromBody] UpdateConversationTaskRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var task = await _meetingService.UpdateConversationTaskAsync(conversationId, taskId, userId, GetCurrentUserName(), request);
            return Ok(MapTaskToDto(task));
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("required", StringComparison.OrdinalIgnoreCase) || ex.Message.Contains("Assignee", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException)
        {
            return NotFound("Task not found");
        }
    }

    [HttpPost("{conversationId}/tasks/{taskId}/notes")]
    public async Task<ActionResult<ConversationTaskNoteDto>> AddTaskNote(Guid conversationId, Guid taskId, [FromBody] AddConversationTaskNoteRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var note = await _meetingService.AddConversationTaskNoteAsync(conversationId, taskId, userId, GetCurrentUserName(), request);
            return Ok(MapTaskNoteToDto(note));
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("required", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException)
        {
            return NotFound("Task not found");
        }
    }

    [HttpDelete("{conversationId}/tasks/{taskId}")]
    public async Task<IActionResult> DeleteTask(Guid conversationId, Guid taskId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await _meetingService.DeleteConversationTaskAsync(conversationId, taskId, userId, GetCurrentUserName());
            return NoContent();
        }
        catch (InvalidOperationException)
        {
            return NotFound("Task not found");
        }
    }

    [HttpPut("{conversationId}/messages/{messageId}")]
    public async Task<ActionResult<ConversationMessageDto>> UpdateMessage(Guid conversationId, Guid messageId, [FromBody] UpdateConversationMessageRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest("Message is required");
        }

        try
        {
            var message = await _meetingService.UpdateConversationMessageAsync(conversationId, messageId, userId, request);
            return Ok(MapMessageToDto(message));
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, ex.Message);
        }
        catch (InvalidOperationException ex) when (ex.Message == "Message is required")
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException)
        {
            return NotFound("Message not found");
        }
    }

    [HttpPost("{conversationId}/messages/{messageId}/pin")]
    public async Task<ActionResult<ConversationMessageDto>> TogglePin(Guid conversationId, Guid messageId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var message = await _meetingService.ToggleConversationMessagePinAsync(conversationId, messageId, userId);
            return Ok(MapMessageToDto(message));
        }
        catch (InvalidOperationException ex) when (ex.Message == "Message not found")
        {
            return NotFound(ex.Message);
        }
        catch (InvalidOperationException)
        {
            return NotFound("Conversation not found");
        }
    }

    [HttpDelete("{conversationId}/messages/{messageId}")]
    public async Task<IActionResult> DeleteMessage(Guid conversationId, Guid messageId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await _meetingService.DeleteConversationMessageAsync(conversationId, messageId, userId);
            return NoContent();
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, ex.Message);
        }
        catch (InvalidOperationException)
        {
            return NotFound("Message not found");
        }
    }

    [HttpPost("{conversationId}/messages/{messageId}/reactions")]
    public async Task<ActionResult<List<ConversationMessageReactionDto>>> ToggleReaction(Guid conversationId, Guid messageId, [FromBody] ToggleConversationMessageReactionRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Emoji))
        {
            return BadRequest("Reaction is required");
        }

        try
        {
            var reactions = await _meetingService.ToggleConversationMessageReactionAsync(conversationId, messageId, userId, GetCurrentUserName(), request);
            return Ok(reactions.Select(MapReactionToDto).ToList());
        }
        catch (InvalidOperationException ex) when (ex.Message == "Reaction is required")
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException ex) when (ex.Message == "Message not found")
        {
            return NotFound(ex.Message);
        }
        catch (InvalidOperationException)
        {
            return NotFound("Conversation not found");
        }
    }

    [HttpGet("{conversationId}/scheduled-messages")]
    public async Task<ActionResult<List<ScheduledConversationMessageDto>>> GetScheduledMessages(Guid conversationId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var messages = await _meetingService.GetScheduledConversationMessagesAsync(conversationId, userId);
            return Ok(messages.Select(MapScheduledMessageToDto).ToList());
        }
        catch (InvalidOperationException)
        {
            return NotFound("Conversation not found");
        }
    }

    [HttpPost("{conversationId}/scheduled-messages")]
    public async Task<ActionResult<ScheduledConversationMessageDto>> ScheduleMessage(Guid conversationId, [FromBody] ScheduleConversationMessageRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var message = await _meetingService.ScheduleConversationMessageAsync(conversationId, userId, GetCurrentUserName(), request);
            return Ok(MapScheduledMessageToDto(message));
        }
        catch (InvalidOperationException ex) when (ex.Message == "Message is required" || ex.Message == "Schedule time must be in the future")
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException)
        {
            return NotFound("Conversation not found");
        }
    }

    [HttpDelete("{conversationId}/scheduled-messages/{scheduledMessageId}")]
    public async Task<IActionResult> CancelScheduledMessage(Guid conversationId, Guid scheduledMessageId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await _meetingService.CancelScheduledConversationMessageAsync(conversationId, scheduledMessageId, userId);
            return NoContent();
        }
        catch (InvalidOperationException)
        {
            return NotFound("Scheduled message not found");
        }
    }

    [HttpPost("{conversationId}/messages/attachments")]
    [RequestSizeLimit(MaxAttachmentRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxAttachmentRequestBytes)]
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

        var organizationSettings = await _storageService.GetSettingsAsync();
        var maxAttachmentBytes = (long)organizationSettings.MaxAttachmentMegabytes * 1024 * 1024;
        if (request.File.Length > maxAttachmentBytes)
        {
            return BadRequest($"Attachment must be {organizationSettings.MaxAttachmentMegabytes} MB or smaller");
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
            if (BlockedAttachmentExtensions.Contains(extension))
            {
                return BadRequest("This attachment type is not allowed");
            }

            var contentType = string.IsNullOrWhiteSpace(request.File.ContentType)
                ? "application/octet-stream"
                : request.File.ContentType;

            if (contentType.Equals("text/html", StringComparison.OrdinalIgnoreCase)
                || contentType.Equals("application/x-msdownload", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest("This attachment content type is not allowed");
            }

            var storedFileName = $"{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}{extension}";
            var storedFile = await _storageService.SaveAsync(OrganizationFileKind.ChatAttachment, conversationId, request.File, storedFileName);

            var message = await _meetingService.AddConversationMessageAsync(conversationId, new SendConversationMessageRequest
            {
                SenderId = userId,
                SenderName = GetCurrentUserName(),
                Message = request.Message ?? string.Empty,
                ReplyToMessageId = request.ReplyToMessageId,
                IsImportant = request.IsImportant,
                AttachmentFileName = originalFileName,
                AttachmentUrl = storedFile.PublicUrl,
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

    [HttpPost("{conversationId}/messages/{messageId}/share-email")]
    public async Task<ActionResult<List<ConversationDocumentShareDto>>> ShareDocument(Guid conversationId, Guid messageId, [FromBody] ShareConversationDocumentRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var shares = await _meetingService.ShareConversationDocumentAsync(conversationId, messageId, userId, GetCurrentUserName(), request);
            return Ok(shares.Select(MapDocumentShareToDto).ToList());
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("email", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException)
        {
            return NotFound("Document not found");
        }
    }

    [HttpGet("{conversationId}/document-shares")]
    public async Task<ActionResult<List<ConversationDocumentShareDto>>> GetDocumentShares(Guid conversationId, [FromQuery] Guid? messageId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var shares = await _meetingService.GetConversationDocumentSharesAsync(conversationId, userId, messageId);
            return Ok(shares.Select(MapDocumentShareToDto).ToList());
        }
        catch (InvalidOperationException)
        {
            return NotFound("Conversation not found");
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

        var filePath = await _storageService.GetPhysicalPathAsync(OrganizationFileKind.ChatAttachment, conversationId, fileName);
        if (filePath == null)
        {
            return NotFound();
        }

        return PhysicalFile(filePath, "application/octet-stream", enableRangeProcessing: true);
    }

    [HttpGet("{conversationId}/messages/{messageId}/attachment-preview")]
    public async Task<IActionResult> PreviewAttachment(Guid conversationId, Guid messageId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        if (!await _meetingService.CanAccessConversationAsync(conversationId, userId))
        {
            return NotFound();
        }

        var message = (await _meetingService.GetConversationMessagesAsync(conversationId, userId))
            .FirstOrDefault(item => item.Id == messageId);

        if (message == null || string.IsNullOrWhiteSpace(message.AttachmentUrl))
        {
            return NotFound();
        }

        var fileName = Path.GetFileName(message.AttachmentUrl);
        var filePath = await _storageService.GetPhysicalPathAsync(OrganizationFileKind.ChatAttachment, conversationId, fileName);
        if (filePath == null)
        {
            return NotFound();
        }

        return PhysicalFile(filePath, message.AttachmentContentType ?? "application/octet-stream", enableRangeProcessing: true);
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

    private static ConversationDto MapToDto(Conversation conversation, Guid currentUserId)
    {
        var currentMember = conversation.Members.FirstOrDefault(member => member.UserId == currentUserId);
        var readAfter = currentMember?.LastReadAt ?? currentMember?.JoinedAt ?? DateTime.MinValue;

        return new ConversationDto
        {
            Id = conversation.Id,
            OrganizationId = conversation.OrganizationId,
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
            UnreadCount = currentMember == null
                ? 0
                : conversation.Messages.Count(message => !message.IsDeleted && message.SenderId != currentUserId && message.SentAt > readAfter),
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
            ClientMessageId = message.ClientMessageId,
            Message = message.Message,
            AttachmentFileName = message.AttachmentFileName,
            AttachmentUrl = message.AttachmentUrl,
            AttachmentContentType = message.AttachmentContentType,
            AttachmentSizeBytes = message.AttachmentSizeBytes,
            ReplyToMessageId = message.ReplyToMessageId,
            ReplyToSenderName = message.ReplyToSenderName,
            ReplyToPreview = message.ReplyToPreview,
            SentAt = message.SentAt,
            EditedAt = message.EditedAt,
            IsPinned = message.IsPinned,
            IsImportant = message.IsImportant,
            Reactions = message.Reactions
                .OrderBy(reaction => reaction.CreatedAt)
                .Select(MapReactionToDto)
                .ToList()
        };
    }

    private static ConversationMessageReactionDto MapReactionToDto(ConversationMessageReaction reaction)
    {
        return new ConversationMessageReactionDto
        {
            Id = reaction.Id,
            MessageId = reaction.ConversationMessageId,
            UserId = reaction.UserId,
            UserName = reaction.UserName,
            Emoji = reaction.Emoji,
            CreatedAt = reaction.CreatedAt
        };
    }

    private static ScheduledConversationMessageDto MapScheduledMessageToDto(ScheduledConversationMessage message)
    {
        return new ScheduledConversationMessageDto
        {
            Id = message.Id,
            ConversationId = message.ConversationId,
            SenderId = message.SenderId,
            SenderName = message.SenderName,
            Message = message.Message,
            ScheduledFor = message.ScheduledFor,
            CreatedAt = message.CreatedAt,
            SentAt = message.SentAt,
            Status = message.Status
        };
    }

    private static ConversationTaskDto MapTaskToDto(ConversationTask task)
    {
        return new ConversationTaskDto
        {
            Id = task.Id,
            ConversationId = task.ConversationId,
            SourceMessageId = task.SourceMessageId,
            Title = task.Title,
            Description = task.Description,
            Priority = task.Priority.ToString(),
            Status = task.Status.ToString(),
            OwnerId = task.OwnerId,
            OwnerName = task.OwnerName,
            AssigneeId = task.AssigneeId,
            AssigneeEmail = task.AssigneeEmail,
            AssigneeName = task.AssigneeName,
            DueDate = task.DueDate,
            CreatedAt = task.CreatedAt,
            UpdatedAt = task.UpdatedAt,
            CompletedAt = task.CompletedAt,
            SourceMessagePreview = task.SourceMessage == null ? null : BuildMessagePreview(task.SourceMessage),
            Notes = task.Notes.OrderByDescending(note => note.CreatedAt).Select(MapTaskNoteToDto).ToList(),
            Activities = task.Activities.OrderByDescending(activity => activity.CreatedAt).Select(MapTaskActivityToDto).ToList()
        };
    }

    private static ConversationTaskNoteDto MapTaskNoteToDto(ConversationTaskNote note)
    {
        return new ConversationTaskNoteDto
        {
            Id = note.Id,
            TaskId = note.TaskId,
            AuthorId = note.AuthorId,
            AuthorName = note.AuthorName,
            Note = note.Note,
            CreatedAt = note.CreatedAt
        };
    }

    private static ConversationTaskActivityDto MapTaskActivityToDto(ConversationTaskActivity activity)
    {
        return new ConversationTaskActivityDto
        {
            Id = activity.Id,
            TaskId = activity.TaskId,
            ActorId = activity.ActorId,
            ActorName = activity.ActorName,
            Action = activity.Action,
            Details = activity.Details,
            CreatedAt = activity.CreatedAt
        };
    }

    private static ConversationDocumentShareDto MapDocumentShareToDto(ConversationDocumentShare share)
    {
        return new ConversationDocumentShareDto
        {
            Id = share.Id,
            ConversationId = share.ConversationId,
            MessageId = share.MessageId,
            SharedByUserId = share.SharedByUserId,
            SharedByName = share.SharedByName,
            RecipientEmails = SplitEmails(share.RecipientEmails),
            OptionalMessage = share.OptionalMessage,
            CreatedAt = share.CreatedAt
        };
    }

    private static string BuildMessagePreview(ConversationMessage message)
    {
        var preview = string.IsNullOrWhiteSpace(message.Message)
            ? message.AttachmentFileName ?? "Attachment"
            : message.Message.Trim().Replace("\r", " ").Replace("\n", " ");

        return preview.Length <= 160 ? preview : $"{preview[..157]}...";
    }

    private static List<string> SplitEmails(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return new List<string>();
        }

        return value.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
    }
}
