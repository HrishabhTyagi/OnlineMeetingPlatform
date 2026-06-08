using MeetingService.Data;
using MeetingService.Models;
using Microsoft.EntityFrameworkCore;

namespace MeetingService.Services;

public interface IMeetingAuthorizationService
{
    Task<bool> CanViewMeetingAsync(Guid meetingId, Guid userId, string? userEmail);
    Task<bool> IsOrganizerAsync(Guid meetingId, Guid userId);
    Task<bool> CanManageParticipantAsync(Guid meetingId, Guid participantId, Guid userId, bool allowOrganizer);
    Task<bool> CanViewRecordingAsync(Guid meetingId, Guid userId, string? userEmail);
    Task<bool> CanUploadRecordingAsync(Guid meetingId, Guid userId);
}

public sealed class MeetingAuthorizationService : IMeetingAuthorizationService
{
    private readonly MeetingDbContext _context;
    private readonly IOrganizationTenantContext _tenantContext;

    public MeetingAuthorizationService(MeetingDbContext context, IOrganizationTenantContext tenantContext)
    {
        _context = context;
        _tenantContext = tenantContext;
    }

    public async Task<bool> CanViewMeetingAsync(Guid meetingId, Guid userId, string? userEmail)
    {
        var normalizedEmail = userEmail?.Trim().ToLowerInvariant();
        return await MeetingsForTenant().AnyAsync(meeting => meeting.Id == meetingId && meeting.OrganizerId == userId)
            || await ParticipantsForTenant().AnyAsync(participant => participant.MeetingId == meetingId && participant.UserId == userId)
            || (!string.IsNullOrWhiteSpace(normalizedEmail)
                && await MeetingInvitesForTenant().AnyAsync(invite => invite.MeetingId == meetingId && invite.Email.ToLower() == normalizedEmail));
    }

    public async Task<bool> IsOrganizerAsync(Guid meetingId, Guid userId)
    {
        return await MeetingsForTenant().AnyAsync(meeting => meeting.Id == meetingId && meeting.OrganizerId == userId);
    }

    public async Task<bool> CanManageParticipantAsync(Guid meetingId, Guid participantId, Guid userId, bool allowOrganizer)
    {
        var participant = await ParticipantsForTenant()
            .Where(item => item.MeetingId == meetingId && item.Id == participantId)
            .Select(item => new { item.UserId })
            .FirstOrDefaultAsync();

        if (participant == null)
        {
            return false;
        }

        return participant.UserId == userId || (allowOrganizer && await IsOrganizerAsync(meetingId, userId));
    }

    public Task<bool> CanViewRecordingAsync(Guid meetingId, Guid userId, string? userEmail)
    {
        return CanViewMeetingAsync(meetingId, userId, userEmail);
    }

    public async Task<bool> CanUploadRecordingAsync(Guid meetingId, Guid userId)
    {
        return await MeetingsForTenant().AnyAsync(meeting =>
            meeting.Id == meetingId &&
            meeting.OrganizerId == userId &&
            meeting.AllowRecording);
    }

    private IQueryable<Meeting> MeetingsForTenant()
    {
        var query = _context.Meetings.AsQueryable();
        return _tenantContext.OrganizationId.HasValue
            ? query.Where(meeting => meeting.OrganizationId == _tenantContext.OrganizationId.Value)
            : query.Where(meeting => meeting.OrganizationId == null);
    }

    private IQueryable<Participant> ParticipantsForTenant()
    {
        var query = _context.Participants.AsQueryable();
        return _tenantContext.OrganizationId.HasValue
            ? query.Where(participant => participant.Meeting.OrganizationId == _tenantContext.OrganizationId.Value)
            : query.Where(participant => participant.Meeting.OrganizationId == null);
    }

    private IQueryable<MeetingInvite> MeetingInvitesForTenant()
    {
        var query = _context.MeetingInvites.AsQueryable();
        return _tenantContext.OrganizationId.HasValue
            ? query.Where(invite => invite.Meeting.OrganizationId == _tenantContext.OrganizationId.Value)
            : query.Where(invite => invite.Meeting.OrganizationId == null);
    }
}
