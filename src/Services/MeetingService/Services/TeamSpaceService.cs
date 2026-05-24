using Microsoft.EntityFrameworkCore;
using MeetingService.Data;
using MeetingService.Models;

namespace MeetingService.Services;

public interface ITeamSpaceService
{
    Task<List<TeamSpace>> GetTeamSpacesAsync(Guid userId);
    Task<TeamSpace?> GetTeamSpaceAsync(Guid teamSpaceId, Guid userId);
    Task<TeamSpace> CreateTeamSpaceAsync(Guid ownerUserId, string ownerEmail, string ownerName, CreateTeamSpaceRequest request);
    Task<TeamChannel> CreateChannelAsync(Guid teamSpaceId, Guid userId, CreateTeamChannelRequest request);
    Task<TeamSpace> AddMembersAsync(Guid teamSpaceId, Guid userId, AddTeamMembersRequest request);
    Task<TeamChannelTab> CreateTabAsync(Guid channelId, Guid userId, CreateTeamChannelTabRequest request);
    Task DeleteTabAsync(Guid tabId, Guid userId);
    Task<List<TeamChannelFileDto>> GetChannelFilesAsync(Guid channelId, Guid userId);
    Task<List<Meeting>> GetChannelMeetingsAsync(Guid channelId, Guid userId);
    Task<Meeting> CreateChannelMeetingAsync(Guid channelId, Guid organizerId, string organizerEmail, string organizerName, CreateChannelMeetingRequest request);
}

public class TeamSpaceService : ITeamSpaceService
{
    private readonly MeetingDbContext _context;
    private readonly IMeetingService _meetingService;
    private readonly IOrganizationTenantContext _tenantContext;

    public TeamSpaceService(MeetingDbContext context, IMeetingService meetingService, IOrganizationTenantContext tenantContext)
    {
        _context = context;
        _meetingService = meetingService;
        _tenantContext = tenantContext;
    }

    public Task<List<TeamSpace>> GetTeamSpacesAsync(Guid userId)
    {
        return TeamSpacesForTenant()
            .Include(team => team.Members)
            .Include(team => team.Channels.OrderBy(channel => channel.SortOrder).ThenBy(channel => channel.Name))
                .ThenInclude(channel => channel.Tabs.OrderBy(tab => tab.SortOrder))
            .Where(team => !team.IsArchived && team.Members.Any(member => member.UserId == userId))
            .OrderBy(team => team.Name)
            .ToListAsync();
    }

    public Task<TeamSpace?> GetTeamSpaceAsync(Guid teamSpaceId, Guid userId)
    {
        return TeamSpacesForTenant()
            .Include(team => team.Members)
            .Include(team => team.Channels.OrderBy(channel => channel.SortOrder).ThenBy(channel => channel.Name))
                .ThenInclude(channel => channel.Tabs.OrderBy(tab => tab.SortOrder))
            .FirstOrDefaultAsync(team => team.Id == teamSpaceId && !team.IsArchived && team.Members.Any(member => member.UserId == userId));
    }

    public async Task<TeamSpace> CreateTeamSpaceAsync(Guid ownerUserId, string ownerEmail, string ownerName, CreateTeamSpaceRequest request)
    {
        var name = NormalizeRequired(request.Name, "Team name is required", 160);
        var members = NormalizeMembers(ownerUserId, ownerEmail, ownerName, request.Members);
        var teamId = Guid.NewGuid();
        var conversationId = Guid.NewGuid();
        var generalChannelId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var conversation = new Conversation
        {
            Id = conversationId,
            OrganizationId = _tenantContext.OrganizationId,
            Type = ConversationType.Group,
            Title = $"{name} - General",
            CreatedAt = now,
            Members = members.Select(member => new ConversationMember
            {
                Id = Guid.NewGuid(),
                ConversationId = conversationId,
                UserId = member.UserId,
                UserEmail = member.UserEmail,
                UserName = member.UserName,
                JoinedAt = now,
                LastReadAt = now
            }).ToList()
        };

        var team = new TeamSpace
        {
            Id = teamId,
            OrganizationId = _tenantContext.OrganizationId,
            Name = name,
            Description = TrimToLength(request.Description, 600),
            OwnerUserId = ownerUserId,
            CreatedAt = now,
            Members = members.Select(member => new TeamSpaceMember
            {
                Id = Guid.NewGuid(),
                TeamSpaceId = teamId,
                UserId = member.UserId,
                UserEmail = member.UserEmail,
                UserName = member.UserName,
                Role = member.UserId == ownerUserId ? TeamMemberRole.Owner : TeamMemberRole.Member,
                JoinedAt = now
            }).ToList(),
            Channels = new List<TeamChannel>
            {
                new()
                {
                    Id = generalChannelId,
                    TeamSpaceId = teamId,
                    ConversationId = conversationId,
                    Name = "General",
                    Description = "Team-wide announcements and discussion",
                    SortOrder = 0,
                    CreatedAt = now,
                    Tabs = new List<TeamChannelTab>
                    {
                        new()
                        {
                            Id = Guid.NewGuid(),
                            TeamChannelId = generalChannelId,
                            Title = "Files",
                            Kind = TeamChannelTabKind.Files,
                            SortOrder = 0,
                            CreatedAt = now
                        },
                        new()
                        {
                            Id = Guid.NewGuid(),
                            TeamChannelId = generalChannelId,
                            Title = "Meetings",
                            Kind = TeamChannelTabKind.Meetings,
                            SortOrder = 1,
                            CreatedAt = now
                        }
                    }
                }
            }
        };

        _context.Conversations.Add(conversation);
        _context.TeamSpaces.Add(team);
        await _context.SaveChangesAsync();
        return (await GetTeamSpaceAsync(team.Id, ownerUserId))!;
    }

    public async Task<TeamChannel> CreateChannelAsync(Guid teamSpaceId, Guid userId, CreateTeamChannelRequest request)
    {
        var team = await TeamSpacesForTenant()
            .Include(item => item.Members)
            .Include(item => item.Channels)
            .FirstOrDefaultAsync(item => item.Id == teamSpaceId && item.Members.Any(member => member.UserId == userId));

        if (team == null)
        {
            throw new InvalidOperationException("Team not found");
        }

        var name = NormalizeRequired(request.Name, "Channel name is required", 120);
        if (team.Channels.Any(channel => string.Equals(channel.Name, name, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException("Channel already exists");
        }

        var now = DateTime.UtcNow;
        var conversationId = Guid.NewGuid();
        var conversation = new Conversation
        {
            Id = conversationId,
            OrganizationId = _tenantContext.OrganizationId,
            Type = ConversationType.Group,
            Title = $"{team.Name} - {name}",
            CreatedAt = now,
            Members = team.Members.Select(member => new ConversationMember
            {
                Id = Guid.NewGuid(),
                ConversationId = conversationId,
                UserId = member.UserId,
                UserEmail = member.UserEmail,
                UserName = member.UserName,
                JoinedAt = now,
                LastReadAt = now
            }).ToList()
        };

        var channel = new TeamChannel
        {
            Id = Guid.NewGuid(),
            TeamSpaceId = team.Id,
            ConversationId = conversationId,
            Name = name,
            Description = TrimToLength(request.Description, 400),
            SortOrder = team.Channels.Count,
            CreatedAt = now
        };

        _context.Conversations.Add(conversation);
        _context.TeamChannels.Add(channel);
        team.UpdatedAt = now;
        await _context.SaveChangesAsync();
        return (await LoadChannelAsync(channel.Id))!;
    }

    public async Task<TeamSpace> AddMembersAsync(Guid teamSpaceId, Guid userId, AddTeamMembersRequest request)
    {
        var team = await TeamSpacesForTenant()
            .Include(item => item.Members)
            .Include(item => item.Channels)
            .FirstOrDefaultAsync(item => item.Id == teamSpaceId && item.Members.Any(member => member.UserId == userId));

        if (team == null)
        {
            throw new InvalidOperationException("Team not found");
        }

        var now = DateTime.UtcNow;
        var existingIds = team.Members.Select(member => member.UserId).ToHashSet();
        var incomingMembers = request.Members
            .Where(member => member.UserId != Guid.Empty && !existingIds.Contains(member.UserId))
            .GroupBy(member => member.UserId)
            .Select(group => group.First())
            .ToList();

        foreach (var member in incomingMembers)
        {
            var userName = string.IsNullOrWhiteSpace(member.UserName) ? member.UserEmail : member.UserName.Trim();
            _context.TeamSpaceMembers.Add(new TeamSpaceMember
            {
                Id = Guid.NewGuid(),
                TeamSpaceId = team.Id,
                UserId = member.UserId,
                UserEmail = member.UserEmail.Trim(),
                UserName = userName,
                Role = TeamMemberRole.Member,
                JoinedAt = now
            });

            foreach (var channel in team.Channels)
            {
                _context.ConversationMembers.Add(new ConversationMember
                {
                    Id = Guid.NewGuid(),
                    ConversationId = channel.ConversationId,
                    UserId = member.UserId,
                    UserEmail = member.UserEmail.Trim(),
                    UserName = userName,
                    JoinedAt = now,
                    LastReadAt = now
                });
            }
        }

        team.UpdatedAt = now;
        await _context.SaveChangesAsync();
        return (await GetTeamSpaceAsync(team.Id, userId))!;
    }

    public async Task<TeamChannelTab> CreateTabAsync(Guid channelId, Guid userId, CreateTeamChannelTabRequest request)
    {
        var channel = await LoadAccessibleChannelAsync(channelId, userId);
        var title = NormalizeRequired(request.Title, "Tab title is required", 120);
        var kind = Enum.TryParse<TeamChannelTabKind>(request.Kind, true, out var parsedKind)
            ? parsedKind
            : TeamChannelTabKind.Link;

        if (kind == TeamChannelTabKind.Link && string.IsNullOrWhiteSpace(request.Url))
        {
            throw new InvalidOperationException("Link tab URL is required");
        }

        var sortOrder = await _context.TeamChannelTabs.CountAsync(tab => tab.TeamChannelId == channel.Id);
        var tab = new TeamChannelTab
        {
            Id = Guid.NewGuid(),
            TeamChannelId = channel.Id,
            Title = title,
            Kind = kind,
            Url = TrimToLength(request.Url, 2000),
            Content = request.Content,
            SortOrder = sortOrder,
            CreatedAt = DateTime.UtcNow
        };

        _context.TeamChannelTabs.Add(tab);
        await _context.SaveChangesAsync();
        return tab;
    }

    public async Task DeleteTabAsync(Guid tabId, Guid userId)
    {
        var tab = await _context.TeamChannelTabs
            .Include(item => item.TeamChannel)
                .ThenInclude(channel => channel.TeamSpace)
                    .ThenInclude(team => team.Members)
            .FirstOrDefaultAsync(item => item.Id == tabId);

        if (tab == null || !CanAccessTeam(tab.TeamChannel.TeamSpace, userId) || !MatchesTenant(tab.TeamChannel.TeamSpace.OrganizationId))
        {
            throw new InvalidOperationException("Tab not found");
        }

        _context.TeamChannelTabs.Remove(tab);
        await _context.SaveChangesAsync();
    }

    public async Task<List<TeamChannelFileDto>> GetChannelFilesAsync(Guid channelId, Guid userId)
    {
        var channel = await LoadAccessibleChannelAsync(channelId, userId);
        return await _context.ConversationMessages
            .Where(message => message.ConversationId == channel.ConversationId && !message.IsDeleted && !string.IsNullOrWhiteSpace(message.AttachmentUrl))
            .OrderByDescending(message => message.SentAt)
            .Select(message => new TeamChannelFileDto
            {
                MessageId = message.Id,
                ConversationId = message.ConversationId,
                FileName = message.AttachmentFileName ?? "Attachment",
                Url = message.AttachmentUrl,
                ContentType = message.AttachmentContentType,
                SizeBytes = message.AttachmentSizeBytes,
                SenderName = message.SenderName,
                SentAt = message.SentAt
            })
            .ToListAsync();
    }

    public async Task<List<Meeting>> GetChannelMeetingsAsync(Guid channelId, Guid userId)
    {
        await LoadAccessibleChannelAsync(channelId, userId);
        return await _context.Meetings
            .Where(meeting => meeting.TeamChannelId == channelId && meeting.IsActive)
            .OrderByDescending(meeting => meeting.StartTime)
            .ToListAsync();
    }

    public async Task<Meeting> CreateChannelMeetingAsync(Guid channelId, Guid organizerId, string organizerEmail, string organizerName, CreateChannelMeetingRequest request)
    {
        var channel = await LoadAccessibleChannelAsync(channelId, organizerId);
        var team = channel.TeamSpace;
        var startTime = request.StartTime ?? DateTime.UtcNow;
        var durationMinutes = Math.Max(15, request.DurationMinutes);
        var attendeeEmails = team.Members
            .Where(member => member.UserId != organizerId)
            .Select(member => member.UserEmail)
            .Where(email => !string.IsNullOrWhiteSpace(email))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var meeting = await _meetingService.CreateMeetingAsync(organizerId, new CreateMeetingRequest
        {
            TeamChannelId = channel.Id,
            Title = string.IsNullOrWhiteSpace(request.Title) ? $"{channel.Name} meeting" : request.Title.Trim(),
            Description = request.Description,
            StartTime = startTime,
            EndTime = startTime.AddMinutes(durationMinutes),
            DurationMinutes = durationMinutes,
            AttendeeEmails = attendeeEmails,
            Location = channel.Name,
            IsOnlineMeeting = true,
            LobbyEnabled = false,
            AllowChat = true,
            AllowReactions = true,
            AllowScreenShare = true,
            AllowAttendeeUnmute = true,
            AllowRecording = true,
            AllowTranscription = false,
            MaxParticipants = Math.Max(2, team.Members.Count)
        });

        await _meetingService.AddConversationMessageAsync(channel.ConversationId, new SendConversationMessageRequest
        {
            SenderId = organizerId,
            SenderName = organizerName,
            Message = $"{organizerName} scheduled a channel meeting: {meeting.Title}\n{meeting.MeetingLink}"
        });

        return meeting;
    }

    private IQueryable<TeamSpace> TeamSpacesForTenant()
    {
        var organizationId = _tenantContext.OrganizationId;
        var query = _context.TeamSpaces.AsQueryable();
        return organizationId.HasValue
            ? query.Where(team => team.OrganizationId == organizationId.Value)
            : query.Where(team => team.OrganizationId == null);
    }

    private async Task<TeamChannel?> LoadChannelAsync(Guid channelId)
    {
        return await _context.TeamChannels
            .Include(channel => channel.Tabs.OrderBy(tab => tab.SortOrder))
            .FirstOrDefaultAsync(channel => channel.Id == channelId);
    }

    private async Task<TeamChannel> LoadAccessibleChannelAsync(Guid channelId, Guid userId)
    {
        var channel = await _context.TeamChannels
            .Include(item => item.TeamSpace)
                .ThenInclude(team => team.Members)
            .Include(item => item.Tabs)
            .FirstOrDefaultAsync(item => item.Id == channelId);

        if (channel == null || !CanAccessTeam(channel.TeamSpace, userId) || !MatchesTenant(channel.TeamSpace.OrganizationId))
        {
            throw new InvalidOperationException("Channel not found");
        }

        return channel;
    }

    private bool MatchesTenant(Guid? organizationId)
    {
        return _tenantContext.OrganizationId.HasValue
            ? organizationId == _tenantContext.OrganizationId.Value
            : organizationId == null;
    }

    private static bool CanAccessTeam(TeamSpace team, Guid userId)
    {
        return !team.IsArchived && team.Members.Any(member => member.UserId == userId);
    }

    private static List<ConversationMemberDto> NormalizeMembers(Guid ownerUserId, string ownerEmail, string ownerName, IEnumerable<ConversationMemberDto>? members)
    {
        var normalized = new Dictionary<Guid, ConversationMemberDto>
        {
            [ownerUserId] = new()
            {
                UserId = ownerUserId,
                UserEmail = ownerEmail,
                UserName = ownerName
            }
        };

        foreach (var member in members ?? Enumerable.Empty<ConversationMemberDto>())
        {
            if (member.UserId == Guid.Empty || string.IsNullOrWhiteSpace(member.UserEmail))
            {
                continue;
            }

            normalized[member.UserId] = new ConversationMemberDto
            {
                UserId = member.UserId,
                UserEmail = member.UserEmail.Trim(),
                UserName = string.IsNullOrWhiteSpace(member.UserName) ? member.UserEmail.Trim() : member.UserName.Trim()
            };
        }

        return normalized.Values.ToList();
    }

    private static string NormalizeRequired(string value, string error, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException(error);
        }

        return TrimToLength(value.Trim(), maxLength)!;
    }

    private static string? TrimToLength(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length > maxLength ? trimmed[..maxLength] : trimmed;
    }
}
