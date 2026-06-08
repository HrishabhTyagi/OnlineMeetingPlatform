using MeetingService.Models;
using MeetingService.Services;

namespace MeetingService.Tests;

public class MeetingAuthorizationTests
{
    [Fact]
    public async Task Meeting_authorization_respects_tenant_boundary_for_recordings()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var organizationA = Guid.NewGuid();
        var organizationB = Guid.NewGuid();
        var organizerId = Guid.NewGuid();
        var attendeeId = Guid.NewGuid();

        var meeting = new Meeting
        {
            Id = Guid.NewGuid(),
            OrganizationId = organizationA,
            OrganizerId = organizerId,
            Title = "Tenant recording",
            StartTime = DateTime.UtcNow.AddHours(1),
            AllowRecording = true,
            AttendeeEmails = "attendee@samvaad.test"
        };
        db.Meetings.Add(meeting);
        db.Participants.Add(new Participant
        {
            Id = Guid.NewGuid(),
            MeetingId = meeting.Id,
            UserId = attendeeId,
            UserEmail = "attendee@samvaad.test",
            UserName = "Attendee",
            JoinedAt = DateTime.UtcNow
        });
        db.MeetingInvites.Add(new MeetingInvite
        {
            Id = Guid.NewGuid(),
            MeetingId = meeting.Id,
            Email = "invited@samvaad.test"
        });
        await db.SaveChangesAsync();

        var tenantA = new FixedTenantContext { OrganizationId = organizationA };
        var tenantB = new FixedTenantContext { OrganizationId = organizationB };
        var authA = new MeetingAuthorizationService(db, tenantA);
        var authB = new MeetingAuthorizationService(db, tenantB);

        Assert.True(await authA.CanViewRecordingAsync(meeting.Id, organizerId, "owner@samvaad.test"));
        Assert.True(await authA.CanViewRecordingAsync(meeting.Id, attendeeId, "attendee@samvaad.test"));
        Assert.True(await authA.CanViewRecordingAsync(meeting.Id, Guid.NewGuid(), "invited@samvaad.test"));
        Assert.False(await authA.CanViewRecordingAsync(meeting.Id, Guid.NewGuid(), "outsider@samvaad.test"));
        Assert.False(await authB.CanViewRecordingAsync(meeting.Id, organizerId, "owner@samvaad.test"));
    }
}
