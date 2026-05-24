using MeetingService.Models;
using MeetingService.Services;
using Microsoft.EntityFrameworkCore;

namespace MeetingService.Tests;

public class TeamSpaceServiceTests
{
    [Fact]
    public async Task CreateTeamSpaceAsync_creates_general_channel_conversation_tabs_and_members()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var tenant = new FixedTenantContext { OrganizationId = Guid.NewGuid(), OrganizationSlug = "wipro" };
        var service = CreateTeamService(db, tenant);
        var ownerId = Guid.NewGuid();
        var alexId = Guid.NewGuid();

        var team = await service.CreateTeamSpaceAsync(ownerId, "owner@samvaad.test", "Owner", new CreateTeamSpaceRequest
        {
            Name = " Engineering ",
            Description = new string('d', 700),
            Members = new List<ConversationMemberDto>
            {
                MeetingTestFactory.Member(alexId, "alex@samvaad.test", "Alex"),
                MeetingTestFactory.Member(alexId, "alex.duplicate@samvaad.test", "Duplicate")
            }
        });

        var general = Assert.Single(team.Channels);
        Assert.Equal(tenant.OrganizationId, team.OrganizationId);
        Assert.Equal("Engineering", team.Name);
        Assert.Equal(600, team.Description!.Length);
        Assert.Equal(2, team.Members.Count);
        Assert.Equal("General", general.Name);
        Assert.Contains(general.Tabs, tab => tab.Kind == TeamChannelTabKind.Files);
        Assert.Contains(general.Tabs, tab => tab.Kind == TeamChannelTabKind.Meetings);
        Assert.Equal(2, await db.ConversationMembers.CountAsync(member => member.ConversationId == general.ConversationId));
    }

    [Fact]
    public async Task Channels_tabs_files_and_members_stay_in_sync()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = CreateTeamService(db);
        var ownerId = Guid.NewGuid();
        var alexId = Guid.NewGuid();
        var team = await service.CreateTeamSpaceAsync(ownerId, "owner@samvaad.test", "Owner", new CreateTeamSpaceRequest
        {
            Name = "Product"
        });

        var planning = await service.CreateChannelAsync(team.Id, ownerId, new CreateTeamChannelRequest
        {
            Name = "Planning",
            Description = "Backlog and grooming"
        });
        Assert.Equal(1, planning.SortOrder);

        team = await service.AddMembersAsync(team.Id, ownerId, new AddTeamMembersRequest
        {
            Members = new List<ConversationMemberDto>
            {
                MeetingTestFactory.Member(alexId, "alex@samvaad.test", "Alex"),
                MeetingTestFactory.Member(alexId, "alex@samvaad.test", "Alex")
            }
        });
        Assert.Equal(2, team.Members.Count);
        Assert.Equal(2, await db.ConversationMembers.CountAsync(member => member.UserId == alexId));

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CreateTabAsync(planning.Id, ownerId, new CreateTeamChannelTabRequest
            {
                Title = "Docs",
                Kind = "Link"
            }));

        var tab = await service.CreateTabAsync(planning.Id, ownerId, new CreateTeamChannelTabRequest
        {
            Title = "Roadmap",
            Kind = "Link",
            Url = "https://example.com/roadmap"
        });
        Assert.Equal(TeamChannelTabKind.Link, tab.Kind);

        await db.ConversationMessages.AddAsync(new ConversationMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = planning.ConversationId,
            SenderId = ownerId,
            SenderName = "Owner",
            Message = "Roadmap file",
            AttachmentFileName = "roadmap.pdf",
            AttachmentUrl = "/uploads/roadmap.pdf",
            AttachmentContentType = "application/pdf",
            AttachmentSizeBytes = 4096
        });
        await db.SaveChangesAsync();

        var files = await service.GetChannelFilesAsync(planning.Id, alexId);
        Assert.Single(files);
        Assert.Equal("roadmap.pdf", files[0].FileName);

        await service.DeleteTabAsync(tab.Id, alexId);
        Assert.False(await db.TeamChannelTabs.AnyAsync(item => item.Id == tab.Id));
    }

    [Fact]
    public async Task CreateChannelMeetingAsync_invites_team_members_and_posts_join_link_to_channel()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var email = new RecordingEmailSender();
        var tenant = new FixedTenantContext { OrganizationId = Guid.NewGuid(), OrganizationSlug = "samvaad-demo" };
        var service = CreateTeamService(db, tenant, email);
        var ownerId = Guid.NewGuid();
        var alexId = Guid.NewGuid();
        var team = await service.CreateTeamSpaceAsync(ownerId, "owner@samvaad.test", "Owner", new CreateTeamSpaceRequest
        {
            Name = "Delivery",
            Members = new List<ConversationMemberDto>
            {
                MeetingTestFactory.Member(alexId, "alex@samvaad.test", "Alex")
            }
        });
        var channel = team.Channels.Single();

        var meeting = await service.CreateChannelMeetingAsync(channel.Id, ownerId, "owner@samvaad.test", "Owner", new CreateChannelMeetingRequest
        {
            Title = "Release readiness",
            StartTime = DateTime.UtcNow.AddHours(3),
            DurationMinutes = 45
        });

        Assert.Equal(channel.Id, meeting.TeamChannelId);
        Assert.Equal("alex@samvaad.test", meeting.AttendeeEmails);
        Assert.Contains("/org/samvaad-demo/meeting/", meeting.MeetingLink);
        Assert.Equal(new[] { "alex@samvaad.test" }, email.MeetingInviteEmails);
        var channelMessages = await db.ConversationMessages
            .Where(message => message.ConversationId == channel.ConversationId)
            .ToListAsync();
        Assert.Single(channelMessages);
        Assert.Contains(meeting.MeetingLink!, channelMessages[0].Message);
    }

    private static TeamSpaceService CreateTeamService(
        MeetingService.Data.MeetingDbContext db,
        FixedTenantContext? tenant = null,
        RecordingEmailSender? email = null)
    {
        var resolvedTenant = tenant ?? new FixedTenantContext();
        var meetingService = MeetingTestFactory.CreateService(db, resolvedTenant, email);
        return new TeamSpaceService(db, meetingService, resolvedTenant);
    }
}
