using MeetingService.Models;
using Samvaad.Common.Events;

namespace MeetingService.Tests;

public class MeetingIntelligenceTests
{
    [Fact]
    public async Task Completing_intelligence_persists_result_updates_recap_and_publishes_event()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var organizationId = Guid.NewGuid();
        var organizerId = Guid.NewGuid();
        var attendeeId = Guid.NewGuid();
        var meeting = new Meeting
        {
            Id = Guid.NewGuid(),
            OrganizationId = organizationId,
            OrganizerId = organizerId,
            Title = "Sprint planning",
            StartTime = DateTime.UtcNow,
            AllowRecording = true,
            AllowTranscription = true
        };
        db.Meetings.Add(meeting);
        db.Participants.Add(new Participant
        {
            Id = Guid.NewGuid(),
            MeetingId = meeting.Id,
            UserId = attendeeId,
            UserEmail = "attendee@samvaad.test",
            UserName = "Attendee"
        });
        await db.SaveChangesAsync();

        var outbox = new RecordingIntegrationEventOutbox();
        var service = MeetingTestFactory.CreateService(
            db,
            new FixedTenantContext { OrganizationId = organizationId },
            outbox: outbox);

        var result = await service.CompleteMeetingIntelligenceAsync(meeting.Id, new CompleteMeetingIntelligenceRequest
        {
            OrganizationId = organizationId,
            RecordingUrl = "/recordings/sprint.webm",
            Transcript = "We agreed to release on Friday.",
            TranscriptSegmentsJson = "[{\"start\":0,\"end\":3,\"text\":\"We agreed to release on Friday.\"}]",
            Summary = "The team agreed to release on Friday.",
            ActionItemsJson = "[{\"title\":\"Prepare release notes\",\"owner\":\"Attendee\"}]"
        });

        Assert.Equal("Completed", result.Status);
        Assert.Equal("The team agreed to release on Friday.", (await db.Meetings.FindAsync(meeting.Id))!.Recap);
        Assert.Equal("We agreed to release on Friday.", (await service.GetMeetingIntelligenceAsync(meeting.Id))!.Transcript);
        var notification = Assert.Single(outbox.Events.OfType<MeetingIntelligenceReadyEvent>());
        Assert.Equal(meeting.Id, notification.MeetingId);
        Assert.Contains(organizerId.ToString(), notification.RecipientUserIds);
        Assert.Contains(attendeeId.ToString(), notification.RecipientUserIds);
    }
}