using MeetingService.Data;
using MeetingService.Models;
using MeetingService.Services;
using Microsoft.EntityFrameworkCore;
using Samvaad.Common.Events;
using Samvaad.Common.Messaging;

namespace MeetingService.Consumers;

public sealed class MeetingInviteEmailRequestedHandler : IEventHandler<MeetingInviteEmailRequestedEvent>
{
    private readonly MeetingDbContext _context;
    private readonly IEmailSender _emailSender;
    private readonly IIntegrationEventConsumerCheckpointStore _checkpointStore;
    private readonly ILogger<MeetingInviteEmailRequestedHandler> _logger;

    public MeetingInviteEmailRequestedHandler(
        MeetingDbContext context,
        IEmailSender emailSender,
        IIntegrationEventConsumerCheckpointStore checkpointStore,
        ILogger<MeetingInviteEmailRequestedHandler> logger)
    {
        _context = context;
        _emailSender = emailSender;
        _checkpointStore = checkpointStore;
        _logger = logger;
    }

    public async Task HandleAsync(MeetingInviteEmailRequestedEvent message, CancellationToken cancellationToken)
    {
        await _checkpointStore.ExecuteOnceAsync(message, nameof(MeetingInviteEmailRequestedHandler), async ct =>
        {
        var invite = await _context.MeetingInvites
            .Include(item => item.Meeting)
            .FirstOrDefaultAsync(item => item.Id == message.InviteId && item.MeetingId == message.MeetingId, ct);

        if (invite == null)
        {
            _logger.LogWarning("Meeting invite email event skipped because invite was not found. Invite: {InviteId}", message.InviteId);
            return;
        }

        await _emailSender.SendMeetingInviteAsync(invite.Meeting, invite);
        }, cancellationToken);
    }
}

public sealed class ConversationInviteEmailRequestedHandler : IEventHandler<ConversationInviteEmailRequestedEvent>
{
    private readonly MeetingDbContext _context;
    private readonly IEmailSender _emailSender;
    private readonly IIntegrationEventConsumerCheckpointStore _checkpointStore;
    private readonly ILogger<ConversationInviteEmailRequestedHandler> _logger;

    public ConversationInviteEmailRequestedHandler(
        MeetingDbContext context,
        IEmailSender emailSender,
        IIntegrationEventConsumerCheckpointStore checkpointStore,
        ILogger<ConversationInviteEmailRequestedHandler> logger)
    {
        _context = context;
        _emailSender = emailSender;
        _checkpointStore = checkpointStore;
        _logger = logger;
    }

    public async Task HandleAsync(ConversationInviteEmailRequestedEvent message, CancellationToken cancellationToken)
    {
        await _checkpointStore.ExecuteOnceAsync(message, nameof(ConversationInviteEmailRequestedHandler), async ct =>
        {
        var conversation = await _context.Conversations
            .FirstOrDefaultAsync(item => item.Id == message.ConversationId, ct);

        if (conversation == null)
        {
            _logger.LogWarning("Conversation invite email event skipped because conversation was not found. Conversation: {ConversationId}", message.ConversationId);
            return;
        }

        await _emailSender.SendConversationInviteAsync(conversation, message.RecipientEmail, message.InviterName);
        }, cancellationToken);
    }
}

public sealed class DocumentShareEmailRequestedHandler : IEventHandler<DocumentShareEmailRequestedEvent>
{
    private readonly MeetingDbContext _context;
    private readonly IEmailSender _emailSender;
    private readonly IIntegrationEventConsumerCheckpointStore _checkpointStore;
    private readonly ILogger<DocumentShareEmailRequestedHandler> _logger;

    public DocumentShareEmailRequestedHandler(
        MeetingDbContext context,
        IEmailSender emailSender,
        IIntegrationEventConsumerCheckpointStore checkpointStore,
        ILogger<DocumentShareEmailRequestedHandler> logger)
    {
        _context = context;
        _emailSender = emailSender;
        _checkpointStore = checkpointStore;
        _logger = logger;
    }

    public async Task HandleAsync(DocumentShareEmailRequestedEvent message, CancellationToken cancellationToken)
    {
        await _checkpointStore.ExecuteOnceAsync(message, nameof(DocumentShareEmailRequestedHandler), async ct =>
        {
        var sharedMessage = await _context.ConversationMessages
            .Include(item => item.Conversation)
            .FirstOrDefaultAsync(item => item.Id == message.MessageId && item.ConversationId == message.ConversationId, ct);

        if (sharedMessage == null || string.IsNullOrWhiteSpace(sharedMessage.AttachmentUrl))
        {
            _logger.LogWarning("Document share email event skipped because message was not found. Message: {MessageId}", message.MessageId);
            return;
        }

        await _emailSender.SendDocumentShareAsync(sharedMessage.Conversation, sharedMessage, message.RecipientEmail, message.SenderName, message.OptionalMessage);
        }, cancellationToken);
    }
}

public sealed class LicenseRequestSubmittedHandler : IEventHandler<LicenseRequestSubmittedEvent>
{
    private readonly IEmailSender _emailSender;
    private readonly IIntegrationEventConsumerCheckpointStore _checkpointStore;

    public LicenseRequestSubmittedHandler(IEmailSender emailSender, IIntegrationEventConsumerCheckpointStore checkpointStore)
    {
        _emailSender = emailSender;
        _checkpointStore = checkpointStore;
    }

    public Task HandleAsync(LicenseRequestSubmittedEvent message, CancellationToken cancellationToken)
    {
        return _checkpointStore.ExecuteOnceAsync(message, nameof(LicenseRequestSubmittedHandler), _ =>
            _emailSender.SendLicenseRequestAsync(new LicenseRequestEmail
        {
            Reference = message.Reference,
            RequestedByUserId = message.RequestedByUserId,
            RequestedAtUtc = message.RequestedAtUtc,
            OrganizationId = message.OrganizationId,
            OrganizationSlug = message.OrganizationSlug,
            CompanyName = message.CompanyName,
            CompanySamvaadEmail = message.CompanySamvaadEmail,
            PlanName = message.PlanName,
            BillingCycle = message.BillingCycle,
            SeatCount = message.SeatCount,
            EstimatedAmount = message.EstimatedAmount,
            Currency = message.Currency,
            RequestedByName = message.RequestedByName,
            RequestedByEmail = message.RequestedByEmail,
            ContactName = message.ContactName,
            ContactEmail = message.ContactEmail,
            Phone = message.Phone,
            Notes = message.Notes,
            PaymentLast4 = message.PaymentLast4
        }), cancellationToken);
    }
}
