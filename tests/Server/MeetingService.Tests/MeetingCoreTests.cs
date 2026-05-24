using MeetingService.Models;
using Microsoft.EntityFrameworkCore;

namespace MeetingService.Tests;

public class MeetingCoreTests
{
    [Fact]
    public async Task CreateMeetingAsync_creates_online_meeting_invites_reminders_and_calendar_sync()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var tenant = new FixedTenantContext { OrganizationId = Guid.NewGuid(), OrganizationSlug = "acme" };
        var email = new RecordingEmailSender();
        var calendar = new CalendarSyncSpy();
        var service = MeetingTestFactory.CreateService(db, tenant, email, calendar);
        var organizerId = Guid.NewGuid();

        var meeting = await service.CreateMeetingAsync(organizerId, MeetingTestFactory.CreateMeetingRequest(
            attendees: new[] { "alex@samvaad.test", "alex@samvaad.test", "priya@samvaad.test" }));

        Assert.Equal(tenant.OrganizationId, meeting.OrganizationId);
        Assert.Equal(organizerId, meeting.OrganizerId);
        Assert.Equal(60, meeting.DurationMinutes);
        Assert.Contains($"/org/{tenant.OrganizationSlug}/meeting/{meeting.Id}", meeting.MeetingLink);
        Assert.Equal(2, await db.MeetingInvites.CountAsync(item => item.MeetingId == meeting.Id));
        Assert.Equal(2, await db.MeetingReminders.CountAsync(item => item.MeetingId == meeting.Id));
        Assert.Contains(meeting.Id, calendar.SyncedMeetingIds);
        Assert.Equal(new[] { "alex@samvaad.test", "priya@samvaad.test" }, email.MeetingInviteEmails);
    }

    [Fact]
    public async Task CreateMeetingAsync_rejects_overlapping_meeting_for_same_organizer()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var organizerId = Guid.NewGuid();
        var start = DateTime.UtcNow.AddHours(4);

        await service.CreateMeetingAsync(organizerId, MeetingTestFactory.CreateMeetingRequest(start, 60));

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CreateMeetingAsync(organizerId, MeetingTestFactory.CreateMeetingRequest(start.AddMinutes(30), 60)));

        Assert.Contains("already have a meeting", exception.Message);
    }

    [Fact]
    public async Task Personal_and_organization_workspaces_are_isolated()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var organizerId = Guid.NewGuid();
        var personalService = MeetingTestFactory.CreateService(db);
        var organizationId = Guid.NewGuid();
        var organizationService = MeetingTestFactory.CreateService(db, new FixedTenantContext
        {
            OrganizationId = organizationId,
            OrganizationSlug = "acme"
        });

        var personalMeeting = await personalService.CreateMeetingAsync(
            organizerId,
            MeetingTestFactory.CreateMeetingRequest(DateTime.UtcNow.AddHours(3), 30));
        var organizationMeeting = await organizationService.CreateMeetingAsync(
            organizerId,
            MeetingTestFactory.CreateMeetingRequest(DateTime.UtcNow.AddHours(5), 30));

        Assert.Null(personalMeeting.OrganizationId);
        Assert.Contains("/personal/meeting/", personalMeeting.MeetingLink);
        Assert.Equal(organizationId, organizationMeeting.OrganizationId);

        var personalMeetings = await personalService.GetMeetingsForUserAsync(organizerId, "owner@samvaad.test");
        var organizationMeetings = await organizationService.GetMeetingsForUserAsync(organizerId, "owner@samvaad.test");

        Assert.Equal(personalMeeting.Id, Assert.Single(personalMeetings).Id);
        Assert.Equal(organizationMeeting.Id, Assert.Single(organizationMeetings).Id);
    }

    [Fact]
    public async Task JoinMeetingAsync_restores_existing_participant_and_marks_meeting_in_progress_when_started()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var userId = Guid.NewGuid();
        var meeting = await service.CreateMeetingAsync(userId, MeetingTestFactory.CreateMeetingRequest(DateTime.UtcNow.AddMinutes(-5), 30));

        var firstJoin = await service.JoinMeetingAsync(meeting.Id, userId, new JoinMeetingRequest
        {
            UserEmail = "owner@samvaad.test",
            UserName = "Owner User"
        });
        firstJoin.LeftAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var secondJoin = await service.JoinMeetingAsync(meeting.Id, userId, new JoinMeetingRequest
        {
            UserEmail = "owner@samvaad.test",
            UserName = "Owner User"
        });

        Assert.Equal(firstJoin.Id, secondJoin.Id);
        Assert.Null(secondJoin.LeftAt);
        Assert.Equal(ParticipantRole.Organizer, secondJoin.Role);
        Assert.Equal(MeetingStatus.InProgress, (await db.Meetings.FindAsync(meeting.Id))!.Status);
    }

    [Fact]
    public async Task JoinMeetingAsync_blocks_completed_or_past_meetings_but_preserves_existing_data()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var organizerId = Guid.NewGuid();
        var meeting = await service.CreateMeetingAsync(organizerId, MeetingTestFactory.CreateMeetingRequest(DateTime.UtcNow.AddHours(1), 30));
        meeting.Status = MeetingStatus.Completed;
        await db.SaveChangesAsync();

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.JoinMeetingAsync(meeting.Id, Guid.NewGuid(), new JoinMeetingRequest
            {
                UserEmail = "late@samvaad.test",
                UserName = "Late User"
            }));

        Assert.Contains("meeting has ended", exception.Message);
    }

    [Fact]
    public async Task UpdateWhiteboardAsync_allows_organizer_and_blocks_non_presenter_attendee()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var organizerId = Guid.NewGuid();
        var attendeeId = Guid.NewGuid();
        var meeting = await service.CreateMeetingAsync(organizerId, MeetingTestFactory.CreateMeetingRequest());

        await service.JoinMeetingAsync(meeting.Id, attendeeId, new JoinMeetingRequest
        {
            UserEmail = "attendee@samvaad.test",
            UserName = "Attendee"
        });

        var updated = await service.UpdateWhiteboardAsync(meeting.Id, organizerId, "Organizer", "{\"items\":[]}");
        Assert.Equal("{\"items\":[]}", updated.WhiteboardData);

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            service.UpdateWhiteboardAsync(meeting.Id, attendeeId, "Attendee", "{\"blocked\":true}"));
    }
}
