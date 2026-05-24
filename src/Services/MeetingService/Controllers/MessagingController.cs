using MeetingService.Data;
using MeetingService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Samvaad.Common.Messaging;

namespace MeetingService.Controllers;

[ApiController]
[Route("api/messaging")]
[Authorize]
public class MessagingController : ControllerBase
{
    private readonly MeetingDbContext _context;
    private readonly RabbitMqOptions _rabbitOptions;
    private readonly IntegrationEventOutboxOptions _outboxOptions;

    public MessagingController(
        MeetingDbContext context,
        IOptions<RabbitMqOptions> rabbitOptions,
        IOptions<IntegrationEventOutboxOptions> outboxOptions)
    {
        _context = context;
        _rabbitOptions = rabbitOptions.Value;
        _outboxOptions = outboxOptions.Value;
    }

    [HttpGet("outbox/summary")]
    public async Task<ActionResult<IntegrationOutboxSummaryDto>> GetOutboxSummary(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var pendingQuery = _context.IntegrationEventOutboxMessages
            .Where(message => message.ProcessedAtUtc == null && message.FailedAtUtc == null);

        var summary = new IntegrationOutboxSummaryDto
        {
            RabbitMqEnabled = _rabbitOptions.Enabled,
            RequireRoutableMessages = _rabbitOptions.RequireRoutableMessages,
            OutboxEnabled = _outboxOptions.Enabled,
            BatchSize = _outboxOptions.BatchSize,
            MaxRetries = _outboxOptions.MaxRetries,
            PendingCount = await pendingQuery.CountAsync(cancellationToken),
            ReadyCount = await pendingQuery.CountAsync(message => message.AvailableAtUtc <= now, cancellationToken),
            LockedCount = await pendingQuery.CountAsync(message => message.LockedUntilUtc != null && message.LockedUntilUtc > now, cancellationToken),
            FailedCount = await _context.IntegrationEventOutboxMessages.CountAsync(message => message.FailedAtUtc != null, cancellationToken),
            ProcessedLastHourCount = await _context.IntegrationEventOutboxMessages.CountAsync(message => message.ProcessedAtUtc >= now.AddHours(-1), cancellationToken),
            OldestPendingAtUtc = await pendingQuery.MinAsync(message => (DateTime?)message.CreatedAtUtc, cancellationToken)
        };

        return Ok(summary);
    }

    [HttpGet("outbox/failed")]
    public async Task<ActionResult<List<IntegrationOutboxMessageDto>>> GetFailedOutboxMessages([FromQuery] int take = 50, CancellationToken cancellationToken = default)
    {
        var messages = await _context.IntegrationEventOutboxMessages
            .Where(message => message.FailedAtUtc != null)
            .OrderByDescending(message => message.FailedAtUtc)
            .Take(Math.Clamp(take, 1, 200))
            .Select(message => new IntegrationOutboxMessageDto
            {
                Id = message.Id,
                EventId = message.EventId,
                EventName = message.EventName,
                RoutingKey = message.RoutingKey,
                CreatedAtUtc = message.CreatedAtUtc,
                AvailableAtUtc = message.AvailableAtUtc,
                RetryCount = message.RetryCount,
                ProcessedAtUtc = message.ProcessedAtUtc,
                FailedAtUtc = message.FailedAtUtc,
                LastError = message.LastError
            })
            .ToListAsync(cancellationToken);

        return Ok(messages);
    }

    [HttpPost("outbox/{id:guid}/retry")]
    public async Task<IActionResult> RetryOutboxMessage(Guid id, CancellationToken cancellationToken)
    {
        var message = await _context.IntegrationEventOutboxMessages
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);

        if (message == null)
        {
            return NotFound();
        }

        message.FailedAtUtc = null;
        message.LockId = null;
        message.LockedUntilUtc = null;
        message.AvailableAtUtc = DateTime.UtcNow;
        message.LastError = null;
        _context.IntegrationEventOutboxMessages.Update(message);
        await _context.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}

public sealed class IntegrationOutboxSummaryDto
{
    public bool RabbitMqEnabled { get; set; }
    public bool RequireRoutableMessages { get; set; }
    public bool OutboxEnabled { get; set; }
    public int BatchSize { get; set; }
    public int MaxRetries { get; set; }
    public int PendingCount { get; set; }
    public int ReadyCount { get; set; }
    public int LockedCount { get; set; }
    public int FailedCount { get; set; }
    public int ProcessedLastHourCount { get; set; }
    public DateTime? OldestPendingAtUtc { get; set; }
}

public sealed class IntegrationOutboxMessageDto
{
    public Guid Id { get; set; }
    public Guid EventId { get; set; }
    public string EventName { get; set; } = string.Empty;
    public string RoutingKey { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime AvailableAtUtc { get; set; }
    public int RetryCount { get; set; }
    public DateTime? ProcessedAtUtc { get; set; }
    public DateTime? FailedAtUtc { get; set; }
    public string? LastError { get; set; }
}
