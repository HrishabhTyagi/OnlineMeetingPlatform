using MeetingService.Data;
using MeetingService.Models;
using MeetingService.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Samvaad.Common.Events;
using Samvaad.Common.Messaging;

namespace MeetingService.Tests;

internal sealed class FixedTenantContext : IOrganizationTenantContext
{
    public Guid? OrganizationId { get; set; }
    public string? OrganizationSlug { get; set; }
}

internal sealed class RecordingEmailSender : IEmailSender
{
    public List<string> MeetingInviteEmails { get; } = new();
    public List<string> ConversationInviteEmails { get; } = new();
    public List<string> DocumentShareEmails { get; } = new();
    public List<LicenseRequestEmail> LicenseRequests { get; } = new();

    public Task SendMeetingInviteAsync(Meeting meeting, MeetingInvite invite)
    {
        MeetingInviteEmails.Add(invite.Email);
        return Task.CompletedTask;
    }

    public Task SendConversationInviteAsync(Conversation conversation, string recipientEmail, string inviterName)
    {
        ConversationInviteEmails.Add(recipientEmail);
        return Task.CompletedTask;
    }

    public Task SendDocumentShareAsync(Conversation conversation, ConversationMessage message, string recipientEmail, string senderName, string? optionalMessage)
    {
        DocumentShareEmails.Add(recipientEmail);
        return Task.CompletedTask;
    }

    public Task SendLicenseRequestAsync(LicenseRequestEmail request)
    {
        LicenseRequests.Add(request);
        return Task.CompletedTask;
    }
}

internal sealed class CalendarSyncSpy : IExternalCalendarSyncService
{
    public List<Guid> SyncedMeetingIds { get; } = new();
    public List<Guid> DeletedMeetingIds { get; } = new();

    public IReadOnlyList<CalendarProviderConfigDto> GetProviders() => Array.Empty<CalendarProviderConfigDto>();

    public Task<string> BuildAuthorizationUrlAsync(ExternalCalendarProvider provider, string redirectUri, Guid userId) =>
        Task.FromResult("https://calendar.example/connect");

    public Task<CalendarConnection> CompleteAuthorizationAsync(ExternalCalendarProvider provider, Guid userId, string code, string redirectUri) =>
        Task.FromResult(new CalendarConnection { Id = Guid.NewGuid(), Provider = provider, UserId = userId, CalendarId = "primary" });

    public Task<List<CalendarConnection>> GetConnectionsAsync(Guid userId) =>
        Task.FromResult(new List<CalendarConnection>());

    public Task DisconnectAsync(Guid userId, ExternalCalendarProvider provider) => Task.CompletedTask;

    public Task SyncMeetingAsync(Meeting meeting, Guid organizerId)
    {
        SyncedMeetingIds.Add(meeting.Id);
        return Task.CompletedTask;
    }

    public Task DeleteExternalEventsAsync(Meeting meeting)
    {
        DeletedMeetingIds.Add(meeting.Id);
        return Task.CompletedTask;
    }
}

internal sealed class RecordingIntegrationEventOutbox : IIntegrationEventOutbox
{
    private readonly RecordingEmailSender? _email;

    public RecordingIntegrationEventOutbox()
    {
    }

    public RecordingIntegrationEventOutbox(RecordingEmailSender email)
    {
        _email = email;
    }

    public List<IEvent> Events { get; } = new();

    public Task EnqueueAsync<TEvent>(TEvent message, CancellationToken cancellationToken = default)
        where TEvent : class, IEvent
    {
        Events.Add(message);
        return DispatchEmailSideEffectAsync(message, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return Task.CompletedTask;
    }

    private async Task DispatchEmailSideEffectAsync(IEvent message, CancellationToken cancellationToken)
    {
        if (_email == null)
        {
            return;
        }

        switch (message)
        {
            case MeetingInviteEmailRequestedEvent meetingInvite:
            {
                await _email.SendMeetingInviteAsync(
                    new Meeting { Id = meetingInvite.MeetingId, OrganizationId = meetingInvite.OrganizationId },
                    new MeetingInvite { Id = meetingInvite.InviteId, MeetingId = meetingInvite.MeetingId, Email = meetingInvite.RecipientEmail });
                break;
            }
            case ConversationInviteEmailRequestedEvent conversationInvite:
            {
                await _email.SendConversationInviteAsync(
                    new Conversation { Id = conversationInvite.ConversationId, OrganizationId = conversationInvite.OrganizationId },
                    conversationInvite.RecipientEmail,
                    conversationInvite.InviterName);
                break;
            }
            case DocumentShareEmailRequestedEvent documentShare:
            {
                await _email.SendDocumentShareAsync(
                    new Conversation { Id = documentShare.ConversationId, OrganizationId = documentShare.OrganizationId },
                    new ConversationMessage { Id = documentShare.MessageId, ConversationId = documentShare.ConversationId },
                    documentShare.RecipientEmail,
                    documentShare.SenderName,
                    documentShare.OptionalMessage);
                break;
            }
        }
    }
}

internal static class MeetingTestFactory
{
    public static MeetingDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<MeetingDbContext>()
            .UseInMemoryDatabase($"meeting-tests-{Guid.NewGuid():N}")
            .Options;
        return new MeetingDbContext(options);
    }

    public static MeetingServiceImpl CreateService(
        MeetingDbContext db,
        FixedTenantContext? tenant = null,
        RecordingEmailSender? email = null,
        CalendarSyncSpy? calendar = null,
        IIntegrationEventOutbox? outbox = null)
    {
        var resolvedEmail = email ?? new RecordingEmailSender();
        return new MeetingServiceImpl(
            db,
            outbox ?? new RecordingIntegrationEventOutbox(resolvedEmail),
            tenant ?? new FixedTenantContext(),
            calendar ?? new CalendarSyncSpy(),
            NullLogger<MeetingServiceImpl>.Instance);
    }

    public static CreateMeetingRequest CreateMeetingRequest(
        DateTime? start = null,
        int durationMinutes = 60,
        IEnumerable<string>? attendees = null)
    {
        return new CreateMeetingRequest
        {
            Title = "Sprint planning",
            Description = "Plan sprint scope",
            StartTime = start ?? DateTime.UtcNow.AddHours(2),
            DurationMinutes = durationMinutes,
            AttendeeEmails = attendees?.ToList() ?? new List<string>(),
            IsOnlineMeeting = true,
            LobbyEnabled = true,
            AllowChat = true,
            AllowReactions = true,
            AllowScreenShare = true,
            AllowAttendeeUnmute = true,
            MaxParticipants = 10
        };
    }

    public static UpdateMeetingRequest CreateUpdateMeetingRequest(
        DateTime? start = null,
        int durationMinutes = 60,
        IEnumerable<string>? attendees = null)
    {
        return new UpdateMeetingRequest
        {
            Title = "Updated sprint planning",
            Description = "Updated sprint scope",
            StartTime = start ?? DateTime.UtcNow.AddHours(3),
            DurationMinutes = durationMinutes,
            AttendeeEmails = attendees?.ToList() ?? new List<string>(),
            IsOnlineMeeting = true,
            LobbyEnabled = true,
            AllowChat = true,
            AllowReactions = true,
            AllowScreenShare = true,
            AllowAttendeeUnmute = true,
            MaxParticipants = 10
        };
    }

    public static ConversationMemberDto Member(Guid userId, string email, string name) => new()
    {
        UserId = userId,
        UserEmail = email,
        UserName = name
    };
}
