using MeetingService.Models;
using MeetingService.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Samvaad.Common.Events;
using Samvaad.Common.Messaging;

namespace MeetingService.Tests;

public class MeetingInviteAndChatTests
{
    [Fact]
    public async Task CreateMeetingAsync_persists_invite_email_events_in_transactional_outbox()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var outbox = new EfIntegrationEventOutbox(db, Options.Create(new RabbitMqOptions
        {
            ExchangeName = "samvaad.events"
        }));
        var service = MeetingTestFactory.CreateService(db, outbox: outbox);

        var meeting = await service.CreateMeetingAsync(Guid.NewGuid(), MeetingTestFactory.CreateMeetingRequest(
            attendees: new[] { "alex@samvaad.test", "priya@samvaad.test" }));

        var invites = await db.MeetingInvites
            .Where(invite => invite.MeetingId == meeting.Id)
            .ToListAsync();
        var outboxMessages = await db.IntegrationEventOutboxMessages
            .OrderBy(message => message.CreatedAtUtc)
            .ToListAsync();

        Assert.Equal(2, invites.Count);
        Assert.Equal(2, outboxMessages.Count);
        Assert.All(outboxMessages, message =>
        {
            Assert.Equal(nameof(MeetingInviteEmailRequestedEvent), message.EventName);
            Assert.Equal("meeting.invite.email.requested", message.RoutingKey);
            Assert.Null(message.ProcessedAtUtc);
            Assert.Null(message.FailedAtUtc);
        });
    }

    [Fact]
    public async Task SendInvitesAsync_adds_unique_invites_updates_attendees_and_sends_email()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var tenant = new FixedTenantContext { OrganizationId = Guid.NewGuid(), OrganizationSlug = "acme" };
        var email = new RecordingEmailSender();
        var service = MeetingTestFactory.CreateService(db, tenant, email);
        var organizerId = Guid.NewGuid();
        var meeting = await service.CreateMeetingAsync(organizerId, MeetingTestFactory.CreateMeetingRequest());

        var invites = await service.SendInvitesAsync(meeting.Id, new[]
        {
            "alex@samvaad.test",
            "Alex@samvaad.test",
            "priya@samvaad.test",
            " "
        });

        var storedMeeting = await db.Meetings.SingleAsync(item => item.Id == meeting.Id);
        Assert.Equal(2, invites.Count);
        Assert.Equal("alex@samvaad.test;priya@samvaad.test", storedMeeting.AttendeeEmails);
        Assert.Equal(new[] { "alex@samvaad.test", "priya@samvaad.test" }, email.MeetingInviteEmails);
    }

    [Fact]
    public async Task UpdateInviteResponseAsync_allows_only_invitee_and_stores_status_reason()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var meeting = await service.CreateMeetingAsync(Guid.NewGuid(), MeetingTestFactory.CreateMeetingRequest(
            attendees: new[] { "alex@samvaad.test" }));
        var invite = await db.MeetingInvites.SingleAsync(item => item.MeetingId == meeting.Id);

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            service.UpdateInviteResponseAsync(
                meeting.Id,
                invite.Id,
                Guid.NewGuid(),
                "other@samvaad.test",
                MeetingInviteResponseStatus.Accepted,
                null));

        var longReason = new string('x', 600);
        var declined = await service.UpdateInviteResponseAsync(
            meeting.Id,
            invite.Id,
            Guid.NewGuid(),
            "Alex@samvaad.test",
            MeetingInviteResponseStatus.Declined,
            longReason);

        Assert.Equal(MeetingInviteResponseStatus.Declined, declined.ResponseStatus);
        Assert.False(declined.HasAccepted);
        Assert.NotNull(declined.RespondedAt);
        Assert.Equal(500, declined.ResponseReason!.Length);

        var accepted = await service.UpdateInviteResponseAsync(
            meeting.Id,
            invite.Id,
            Guid.NewGuid(),
            "alex@samvaad.test",
            MeetingInviteResponseStatus.Accepted,
            "Joining");

        Assert.True(accepted.HasAccepted);
        Assert.Equal("Joining", accepted.ResponseReason);
    }

    [Fact]
    public async Task Participant_status_hand_reaction_and_direct_meeting_chat_visibility_are_consistent()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var organizerId = Guid.NewGuid();
        var alexId = Guid.NewGuid();
        var priyaId = Guid.NewGuid();
        var meeting = await service.CreateMeetingAsync(
            organizerId,
            MeetingTestFactory.CreateMeetingRequest(DateTime.UtcNow.AddMinutes(-5), 60));

        var organizer = await service.JoinMeetingAsync(meeting.Id, organizerId, new JoinMeetingRequest
        {
            UserEmail = "asha@samvaad.test",
            UserName = "Asha"
        });
        var alex = await service.JoinMeetingAsync(meeting.Id, alexId, new JoinMeetingRequest
        {
            UserEmail = "alex@samvaad.test",
            UserName = "Alex"
        });
        var priya = await service.JoinMeetingAsync(meeting.Id, priyaId, new JoinMeetingRequest
        {
            UserEmail = "priya@samvaad.test",
            UserName = "Priya"
        });

        await service.UpdateParticipantStatusAsync(alex.Id, audioEnabled: true, videoEnabled: true, screenSharing: true);
        await service.UpdateParticipantStatusAsync(priya.Id, audioEnabled: true, videoEnabled: true, screenSharing: true);
        await service.UpdateParticipantHandAsync(alex.Id, true);
        await service.UpdateParticipantReactionAsync(alex.Id, "thumbs-up");

        var participants = await service.GetMeetingParticipantsAsync(meeting.Id);
        var storedAlex = participants.Single(item => item.UserId == alexId);
        var storedPriya = participants.Single(item => item.UserId == priyaId);
        Assert.False(storedAlex.IsScreenSharing);
        Assert.True(storedPriya.IsScreenSharing);
        Assert.True(storedAlex.IsHandRaised);
        Assert.Equal("thumbs-up", storedAlex.Reaction);

        await service.AddChatMessageAsync(meeting.Id, new CreateChatMessageRequest
        {
            SenderId = organizerId,
            SenderName = "Asha",
            Message = "Hello everyone"
        });
        await service.AddChatMessageAsync(meeting.Id, new CreateChatMessageRequest
        {
            SenderId = organizerId,
            SenderName = "Asha",
            RecipientUserId = alexId,
            RecipientName = "Alex",
            Message = "Private note"
        });

        Assert.Equal(2, (await service.GetChatMessagesAsync(meeting.Id, organizer.UserId)).Count);
        Assert.Equal(2, (await service.GetChatMessagesAsync(meeting.Id, alexId)).Count);
        var priyaMessages = await service.GetChatMessagesAsync(meeting.Id, priyaId);
        Assert.Single(priyaMessages);
        Assert.Equal(ChatScope.Everyone, priyaMessages[0].Scope);
    }

    [Fact]
    public async Task Lobby_recording_and_end_meeting_lifecycle_updates_state()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var organizerId = Guid.NewGuid();
        var attendeeId = Guid.NewGuid();
        var meeting = await service.CreateMeetingAsync(
            organizerId,
            MeetingTestFactory.CreateMeetingRequest(DateTime.UtcNow.AddMinutes(-5), 60));
        var organizer = await service.JoinMeetingAsync(meeting.Id, organizerId, new JoinMeetingRequest
        {
            UserEmail = "owner@samvaad.test",
            UserName = "Owner"
        });
        await service.JoinMeetingAsync(meeting.Id, attendeeId, new JoinMeetingRequest
        {
            UserEmail = "alex@samvaad.test",
            UserName = "Alex"
        });

        var lobbyRequest = await service.RequestLobbyAccessAsync(meeting.Id, Guid.NewGuid(), new JoinMeetingRequest
        {
            UserEmail = "guest@samvaad.test",
            UserName = "Guest"
        });
        var sameRequest = await service.RequestLobbyAccessAsync(meeting.Id, lobbyRequest.UserId, new JoinMeetingRequest
        {
            UserEmail = "guest@samvaad.test",
            UserName = "Guest"
        });
        Assert.Equal(lobbyRequest.Id, sameRequest.Id);

        var admitted = await service.DecideLobbyRequestAsync(lobbyRequest.Id, admit: true);
        Assert.Equal(LobbyStatus.Admitted, admitted.Status);
        Assert.NotNull(admitted.DecidedAt);

        var recorded = await service.UpdateRecordingAsync(meeting.Id, "/recordings/demo.webm");
        Assert.True(recorded.IsRecorded);
        Assert.Equal("/recordings/demo.webm", recorded.RecordingUrl);

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => service.EndMeetingAsync(meeting.Id, attendeeId));
        var ended = await service.EndMeetingAsync(meeting.Id, organizer.UserId);
        Assert.Equal(MeetingStatus.Completed, ended.Status);
        Assert.All(ended.Participants, participant =>
        {
            Assert.NotNull(participant.LeftAt);
            Assert.False(participant.IsAudioEnabled);
            Assert.False(participant.IsVideoEnabled);
            Assert.False(participant.IsScreenSharing);
        });
    }
}
