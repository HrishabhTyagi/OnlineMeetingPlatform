using MeetingService.Consumers;
using MeetingService.Controllers;
using MeetingService.Models;
using MeetingService.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Samvaad.Common.Events;
using Samvaad.Common.Messaging;

namespace MeetingService.Tests;

public class RabbitMessagingReliabilityTests
{
    [Fact]
    public async Task Meeting_invite_email_consumer_is_idempotent_by_event_and_handler()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var email = new RecordingEmailSender();
        var checkpointStore = new EfIntegrationEventConsumerCheckpointStore(
            db,
            NullLogger<EfIntegrationEventConsumerCheckpointStore>.Instance);
        var handler = new MeetingInviteEmailRequestedHandler(
            db,
            email,
            checkpointStore,
            NullLogger<MeetingInviteEmailRequestedHandler>.Instance);

        var meeting = new Meeting
        {
            Id = Guid.NewGuid(),
            OrganizerId = Guid.NewGuid(),
            Title = "Reliable invite",
            StartTime = DateTime.UtcNow.AddHours(1),
            MeetingLink = "http://localhost:5173/meeting/reliable"
        };
        var invite = new MeetingInvite
        {
            Id = Guid.NewGuid(),
            MeetingId = meeting.Id,
            Email = "alex@samvaad.test"
        };
        db.Meetings.Add(meeting);
        db.MeetingInvites.Add(invite);
        await db.SaveChangesAsync();

        var @event = new MeetingInviteEmailRequestedEvent(
            Guid.NewGuid(),
            DateTime.UtcNow,
            null,
            meeting.Id,
            invite.Id,
            invite.Email);

        await handler.HandleAsync(@event, CancellationToken.None);
        await handler.HandleAsync(@event, CancellationToken.None);

        Assert.Equal(new[] { "alex@samvaad.test" }, email.MeetingInviteEmails);
        var checkpoint = await db.IntegrationEventConsumerCheckpoints.SingleAsync();
        Assert.Equal(@event.EventId, checkpoint.EventId);
        Assert.Equal(nameof(MeetingInviteEmailRequestedHandler), checkpoint.HandlerName);
        Assert.NotNull(checkpoint.ProcessedAtUtc);
    }

    [Fact]
    public async Task Messaging_controller_reports_and_retries_failed_outbox_messages()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var failedMessage = new IntegrationEventOutboxMessage
        {
            Id = Guid.NewGuid(),
            EventId = Guid.NewGuid(),
            EventName = nameof(MeetingInviteEmailRequestedEvent),
            EventType = typeof(MeetingInviteEmailRequestedEvent).AssemblyQualifiedName!,
            ExchangeName = "samvaad.events",
            RoutingKey = "meeting.invite.email.requested",
            Payload = "{}",
            OccurredAtUtc = DateTime.UtcNow.AddMinutes(-3),
            CreatedAtUtc = DateTime.UtcNow.AddMinutes(-3),
            AvailableAtUtc = DateTime.UtcNow.AddMinutes(5),
            RetryCount = 12,
            FailedAtUtc = DateTime.UtcNow.AddMinutes(-1),
            LastError = "broker unavailable"
        };
        db.IntegrationEventOutboxMessages.Add(failedMessage);
        db.IntegrationEventOutboxMessages.Add(new IntegrationEventOutboxMessage
        {
            Id = Guid.NewGuid(),
            EventId = Guid.NewGuid(),
            EventName = nameof(ConversationMessageCreatedEvent),
            EventType = typeof(ConversationMessageCreatedEvent).AssemblyQualifiedName!,
            ExchangeName = "samvaad.events",
            RoutingKey = "conversation.message.created",
            Payload = "{}",
            OccurredAtUtc = DateTime.UtcNow,
            CreatedAtUtc = DateTime.UtcNow,
            AvailableAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var controller = new MessagingController(
            db,
            Options.Create(new RabbitMqOptions { Enabled = true, RequireRoutableMessages = true }),
            Options.Create(new IntegrationEventOutboxOptions { Enabled = true, BatchSize = 50, MaxRetries = 12 }));

        var summaryResult = await controller.GetOutboxSummary(CancellationToken.None);
        var summaryOk = Assert.IsType<OkObjectResult>(summaryResult.Result);
        var summary = Assert.IsType<IntegrationOutboxSummaryDto>(summaryOk.Value);
        Assert.Equal(1, summary.PendingCount);
        Assert.Equal(1, summary.FailedCount);
        Assert.True(summary.RequireRoutableMessages);

        var failedResult = await controller.GetFailedOutboxMessages(cancellationToken: CancellationToken.None);
        var failedOk = Assert.IsType<OkObjectResult>(failedResult.Result);
        var failedRows = Assert.IsType<List<IntegrationOutboxMessageDto>>(failedOk.Value);
        Assert.Single(failedRows);

        var retryResult = await controller.RetryOutboxMessage(failedMessage.Id, CancellationToken.None);
        Assert.IsType<NoContentResult>(retryResult);

        var retried = await db.IntegrationEventOutboxMessages.SingleAsync(message => message.Id == failedMessage.Id);
        Assert.Null(retried.FailedAtUtc);
        Assert.Null(retried.LastError);
        Assert.True(retried.AvailableAtUtc <= DateTime.UtcNow);
    }
}
