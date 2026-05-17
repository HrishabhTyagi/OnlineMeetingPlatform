using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MeetingService.Models;
using MeetingService.Services;

namespace MeetingService.Controllers;

[ApiController]
[Authorize]
[Route("api/team-spaces")]
public class TeamSpacesController : ControllerBase
{
    private readonly ITeamSpaceService _teamSpaceService;
    private readonly ILogger<TeamSpacesController> _logger;

    public TeamSpacesController(ITeamSpaceService teamSpaceService, ILogger<TeamSpacesController> logger)
    {
        _teamSpaceService = teamSpaceService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<List<TeamSpaceDto>>> GetTeamSpaces()
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var teams = await _teamSpaceService.GetTeamSpacesAsync(userId);
        return Ok(teams.Select(MapTeamToDto).ToList());
    }

    [HttpGet("{teamSpaceId:guid}")]
    public async Task<ActionResult<TeamSpaceDto>> GetTeamSpace(Guid teamSpaceId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var team = await _teamSpaceService.GetTeamSpaceAsync(teamSpaceId, userId);
        return team == null ? NotFound("Team not found") : Ok(MapTeamToDto(team));
    }

    [HttpPost]
    public async Task<ActionResult<TeamSpaceDto>> CreateTeamSpace([FromBody] CreateTeamSpaceRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var team = await _teamSpaceService.CreateTeamSpaceAsync(userId, GetCurrentUserEmail() ?? string.Empty, GetCurrentUserName(), request);
            return Ok(MapTeamToDto(team));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating team space");
            return StatusCode(500, "An error occurred");
        }
    }

    [HttpPost("{teamSpaceId:guid}/channels")]
    public async Task<ActionResult<TeamChannelDto>> CreateChannel(Guid teamSpaceId, [FromBody] CreateTeamChannelRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var channel = await _teamSpaceService.CreateChannelAsync(teamSpaceId, userId, request);
            return Ok(MapChannelToDto(channel));
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("required") || ex.Message.Contains("already"))
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException)
        {
            return NotFound("Team not found");
        }
    }

    [HttpPost("{teamSpaceId:guid}/members")]
    public async Task<ActionResult<TeamSpaceDto>> AddMembers(Guid teamSpaceId, [FromBody] AddTeamMembersRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var team = await _teamSpaceService.AddMembersAsync(teamSpaceId, userId, request);
            return Ok(MapTeamToDto(team));
        }
        catch (InvalidOperationException)
        {
            return NotFound("Team not found");
        }
    }

    [HttpPost("channels/{channelId:guid}/tabs")]
    public async Task<ActionResult<TeamChannelTabDto>> CreateTab(Guid channelId, [FromBody] CreateTeamChannelTabRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var tab = await _teamSpaceService.CreateTabAsync(channelId, userId, request);
            return Ok(MapTabToDto(tab));
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("required"))
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException)
        {
            return NotFound("Channel not found");
        }
    }

    [HttpDelete("tabs/{tabId:guid}")]
    public async Task<IActionResult> DeleteTab(Guid tabId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await _teamSpaceService.DeleteTabAsync(tabId, userId);
            return NoContent();
        }
        catch (InvalidOperationException)
        {
            return NotFound("Tab not found");
        }
    }

    [HttpGet("channels/{channelId:guid}/files")]
    public async Task<ActionResult<List<TeamChannelFileDto>>> GetChannelFiles(Guid channelId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var files = await _teamSpaceService.GetChannelFilesAsync(channelId, userId);
            return Ok(files);
        }
        catch (InvalidOperationException)
        {
            return NotFound("Channel not found");
        }
    }

    [HttpGet("channels/{channelId:guid}/meetings")]
    public async Task<ActionResult<List<MeetingDto>>> GetChannelMeetings(Guid channelId)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var meetings = await _teamSpaceService.GetChannelMeetingsAsync(channelId, userId);
            return Ok(meetings.Select(MapMeetingToDto).ToList());
        }
        catch (InvalidOperationException)
        {
            return NotFound("Channel not found");
        }
    }

    [HttpPost("channels/{channelId:guid}/meetings")]
    public async Task<ActionResult<MeetingDto>> CreateChannelMeeting(Guid channelId, [FromBody] CreateChannelMeetingRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var meeting = await _teamSpaceService.CreateChannelMeetingAsync(channelId, userId, GetCurrentUserEmail() ?? string.Empty, GetCurrentUserName(), request);
            return Ok(MapMeetingToDto(meeting));
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("required"))
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException)
        {
            return NotFound("Channel not found");
        }
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(userIdClaim, out userId);
    }

    private string? GetCurrentUserEmail()
    {
        return User.FindFirst(ClaimTypes.Email)?.Value;
    }

    private string GetCurrentUserName()
    {
        var firstName = User.FindFirst(ClaimTypes.GivenName)?.Value;
        var lastName = User.FindFirst(ClaimTypes.Surname)?.Value;
        var fullName = $"{firstName} {lastName}".Trim();
        return string.IsNullOrWhiteSpace(fullName) ? GetCurrentUserEmail() ?? "User" : fullName;
    }

    private static TeamSpaceDto MapTeamToDto(TeamSpace team)
    {
        return new TeamSpaceDto
        {
            Id = team.Id,
            OrganizationId = team.OrganizationId,
            Name = team.Name,
            Description = team.Description,
            OwnerUserId = team.OwnerUserId,
            IsArchived = team.IsArchived,
            Members = team.Members.OrderBy(member => member.UserName).Select(MapMemberToDto).ToList(),
            Channels = team.Channels.OrderBy(channel => channel.SortOrder).ThenBy(channel => channel.Name).Select(MapChannelToDto).ToList(),
            CreatedAt = team.CreatedAt,
            UpdatedAt = team.UpdatedAt
        };
    }

    private static TeamMemberDto MapMemberToDto(TeamSpaceMember member)
    {
        return new TeamMemberDto
        {
            UserId = member.UserId,
            UserEmail = member.UserEmail,
            UserName = member.UserName,
            Role = member.Role.ToString()
        };
    }

    private static TeamChannelDto MapChannelToDto(TeamChannel channel)
    {
        return new TeamChannelDto
        {
            Id = channel.Id,
            TeamSpaceId = channel.TeamSpaceId,
            ConversationId = channel.ConversationId,
            Name = channel.Name,
            Description = channel.Description,
            SortOrder = channel.SortOrder,
            Tabs = channel.Tabs.OrderBy(tab => tab.SortOrder).Select(MapTabToDto).ToList(),
            CreatedAt = channel.CreatedAt,
            UpdatedAt = channel.UpdatedAt
        };
    }

    private static TeamChannelTabDto MapTabToDto(TeamChannelTab tab)
    {
        return new TeamChannelTabDto
        {
            Id = tab.Id,
            TeamChannelId = tab.TeamChannelId,
            Title = tab.Title,
            Kind = tab.Kind.ToString(),
            Url = tab.Url,
            Content = tab.Content,
            SortOrder = tab.SortOrder,
            CreatedAt = tab.CreatedAt
        };
    }

    private static MeetingDto MapMeetingToDto(Meeting meeting)
    {
        return new MeetingDto
        {
            Id = meeting.Id,
            OrganizationId = meeting.OrganizationId,
            TeamChannelId = meeting.TeamChannelId,
            OrganizerId = meeting.OrganizerId,
            Title = meeting.Title,
            Description = meeting.Description,
            StartTime = meeting.StartTime,
            EndTime = meeting.EndTime,
            DurationMinutes = meeting.DurationMinutes,
            AttendeeEmails = SplitAttendeeEmails(meeting.AttendeeEmails),
            Location = meeting.Location,
            IsOnlineMeeting = meeting.IsOnlineMeeting,
            LobbyEnabled = meeting.LobbyEnabled,
            AllowChat = meeting.AllowChat,
            AllowReactions = meeting.AllowReactions,
            AllowScreenShare = meeting.AllowScreenShare,
            AllowAttendeeUnmute = meeting.AllowAttendeeUnmute,
            AllowRecording = meeting.AllowRecording,
            AllowTranscription = meeting.AllowTranscription,
            RecurrenceRule = meeting.RecurrenceRule,
            Notes = meeting.Notes,
            Recap = meeting.Recap,
            Status = meeting.Status.ToString(),
            MeetingLink = meeting.MeetingLink,
            IsRecorded = meeting.IsRecorded,
            RecordingUrl = meeting.RecordingUrl,
            MaxParticipants = meeting.MaxParticipants,
            CurrentParticipants = meeting.Participants?.Count(participant => participant.LeftAt == null) ?? 0,
            CreatedAt = meeting.CreatedAt
        };
    }

    private static List<string> SplitAttendeeEmails(string? attendeeEmails)
    {
        return string.IsNullOrWhiteSpace(attendeeEmails)
            ? new List<string>()
            : attendeeEmails.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
    }
}
