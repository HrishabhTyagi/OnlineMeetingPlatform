using Microsoft.EntityFrameworkCore;
using MeetingService.Data;
using MeetingService.Models;
using Samvaad.Common.Events;
using Samvaad.Common.Messaging;

namespace MeetingService.Services;

public interface IMeetingService
{
    Task<Meeting> CreateMeetingAsync(Guid organizerId, CreateMeetingRequest request);
    Task<Meeting?> GetMeetingByIdAsync(Guid id);
    Task<List<Meeting>> GetMeetingsByOrganizerAsync(Guid organizerId);
    Task<List<Meeting>> GetMeetingsForUserAsync(Guid userId, string? userEmail);
    Task<List<Meeting>> GetUpcomingMeetingsAsync();
    Task<Meeting> UpdateMeetingAsync(Guid id, UpdateMeetingRequest request);
    Task<Meeting> EndMeetingAsync(Guid id, Guid organizerId);
    Task DeleteMeetingAsync(Guid id);
    Task<Participant> JoinMeetingAsync(Guid meetingId, Guid userId, JoinMeetingRequest request);
    Task<bool> LeaveMeetingAsync(Guid meetingId, Guid participantId);
    Task<List<Participant>> GetMeetingParticipantsAsync(Guid meetingId);
    Task<bool> UpdateParticipantStatusAsync(Guid participantId, bool audioEnabled, bool videoEnabled, bool screenSharing);
    Task<bool> UpdateParticipantRoleAsync(Guid participantId, ParticipantRole role);
    Task<Participant?> UpdateParticipantHandAsync(Guid participantId, bool isHandRaised);
    Task<Participant?> UpdateParticipantReactionAsync(Guid participantId, string? reaction);
    Task<MeetingChatMessage> AddChatMessageAsync(Guid meetingId, CreateChatMessageRequest request);
    Task<List<MeetingChatMessage>> GetChatMessagesAsync(Guid meetingId, Guid? currentUserId = null);
    Task<List<MeetingCallLog>> GetMeetingCallLogsAsync(Guid meetingId, Guid currentUserId);
    Task<List<MeetingCallLog>> GetRecentMeetingCallLogsAsync(Guid currentUserId, string? status = null);
    Task<MeetingCallLog> CreateMeetingCallLogAsync(Guid meetingId, Guid callerUserId, string callerName, CreateMeetingCallLogRequest request);
    Task<MeetingCallLog> UpdateMeetingCallLogStatusAsync(Guid meetingId, Guid callLogId, Guid actorUserId, UpdateMeetingCallLogRequest request);
    Task<MeetingCallLog> MarkMeetingCallLogSeenAsync(Guid callLogId, Guid currentUserId);
    Task HideMeetingCallLogAsync(Guid callLogId, Guid currentUserId);
    Task ClearMeetingCallLogsAsync(Guid currentUserId, string? status = null);
    Task<LobbyRequest> RequestLobbyAccessAsync(Guid meetingId, Guid userId, JoinMeetingRequest request);
    Task<List<LobbyRequest>> GetLobbyRequestsAsync(Guid meetingId);
    Task<LobbyRequest> DecideLobbyRequestAsync(Guid requestId, bool admit);
    Task<Meeting> UpdateNotesAsync(Guid meetingId, string? notes);
    Task<Meeting> UpdateWhiteboardAsync(Guid meetingId, Guid userId, string userName, string? whiteboardData);
    Task<Meeting> UpdateRecordingAsync(Guid meetingId, string recordingUrl);
    Task<List<MeetingInvite>> GetInvitesAsync(Guid meetingId);
    Task<List<MeetingInvite>> SendInvitesAsync(Guid meetingId, IEnumerable<string> emails);
    Task<MeetingInvite> UpdateInviteResponseAsync(Guid meetingId, Guid inviteId, Guid currentUserId, string? currentUserEmail, MeetingInviteResponseStatus status, string? reason);
    Task<List<Conversation>> GetConversationsAsync(Guid userId, string? userEmail, string userName);
    Task<Conversation> CreateConversationAsync(Guid creatorId, CreateConversationRequest request);
    Task<List<ConversationMessage>> GetConversationMessagesAsync(Guid conversationId, Guid userId);
    Task MarkConversationReadAsync(Guid conversationId, Guid userId);
    Task MarkConversationUnreadAsync(Guid conversationId, Guid messageId, Guid userId);
    Task<ConversationMessage> AddConversationMessageAsync(Guid conversationId, SendConversationMessageRequest request);
    Task<ConversationMessage> UpdateConversationMessageAsync(Guid conversationId, Guid messageId, Guid userId, UpdateConversationMessageRequest request);
    Task<ConversationMessage> ToggleConversationMessagePinAsync(Guid conversationId, Guid messageId, Guid userId);
    Task DeleteConversationMessageAsync(Guid conversationId, Guid messageId, Guid userId);
    Task<List<ConversationMessageReaction>> ToggleConversationMessageReactionAsync(Guid conversationId, Guid messageId, Guid userId, string userName, ToggleConversationMessageReactionRequest request);
    Task<List<ScheduledConversationMessage>> GetScheduledConversationMessagesAsync(Guid conversationId, Guid userId);
    Task<ScheduledConversationMessage> ScheduleConversationMessageAsync(Guid conversationId, Guid userId, string senderName, ScheduleConversationMessageRequest request);
    Task CancelScheduledConversationMessageAsync(Guid conversationId, Guid scheduledMessageId, Guid userId);
    Task<List<ConversationTask>> GetConversationTasksAsync(Guid conversationId, Guid userId, string? status = null, string? priority = null, Guid? assigneeId = null, DateTime? dueBefore = null, string? query = null);
    Task<ConversationTask> CreateConversationTaskAsync(Guid conversationId, Guid userId, string userName, CreateConversationTaskRequest request);
    Task<ConversationTask> UpdateConversationTaskAsync(Guid conversationId, Guid taskId, Guid userId, string userName, UpdateConversationTaskRequest request);
    Task<ConversationTaskNote> AddConversationTaskNoteAsync(Guid conversationId, Guid taskId, Guid userId, string userName, AddConversationTaskNoteRequest request);
    Task DeleteConversationTaskAsync(Guid conversationId, Guid taskId, Guid userId, string userName);
    Task<List<ConversationDocumentShare>> ShareConversationDocumentAsync(Guid conversationId, Guid messageId, Guid userId, string userName, ShareConversationDocumentRequest request);
    Task<List<ConversationDocumentShare>> GetConversationDocumentSharesAsync(Guid conversationId, Guid userId, Guid? messageId = null);
    Task<List<GlobalSearchResultDto>> SearchAsync(Guid userId, string query);
    Task LogAuditAsync(Guid actorId, string actorName, string action, string? details = null, Guid? meetingId = null, Guid? conversationId = null);
    Task<bool> CanAccessConversationAsync(Guid conversationId, Guid userId);
}

public class MeetingServiceImpl : IMeetingService
{
    private readonly MeetingDbContext _context;
    private readonly IIntegrationEventOutbox _outbox;
    private readonly IOrganizationTenantContext _tenantContext;
    private readonly IExternalCalendarSyncService _externalCalendarSyncService;
    private readonly ILogger<MeetingServiceImpl> _logger;

    public MeetingServiceImpl(
        MeetingDbContext context,
        IIntegrationEventOutbox outbox,
        IOrganizationTenantContext tenantContext,
        IExternalCalendarSyncService externalCalendarSyncService,
        ILogger<MeetingServiceImpl> logger)
    {
        _context = context;
        _outbox = outbox;
        _tenantContext = tenantContext;
        _externalCalendarSyncService = externalCalendarSyncService;
        _logger = logger;
    }

    public async Task<Meeting> CreateMeetingAsync(Guid organizerId, CreateMeetingRequest request)
    {
        var durationMinutes = ResolveDurationMinutes(request.StartTime, request.EndTime, request.DurationMinutes);
        if (!request.AllowOrganizerOverlap)
        {
            await EnsureOrganizerHasNoOverlapAsync(organizerId, request.StartTime, request.StartTime.AddMinutes(durationMinutes));
        }
        var meetingId = Guid.NewGuid();
        var meeting = new Meeting
        {
            Id = meetingId,
            OrganizationId = _tenantContext.OrganizationId,
            TeamChannelId = request.TeamChannelId,
            OrganizerId = organizerId,
            Title = request.Title,
            Description = request.Description,
            StartTime = request.StartTime,
            EndTime = request.StartTime.AddMinutes(durationMinutes),
            DurationMinutes = durationMinutes,
            AttendeeEmails = NormalizeAttendeeEmails(request.AttendeeEmails),
            Location = request.Location,
            IsOnlineMeeting = request.IsOnlineMeeting,
            LobbyEnabled = request.LobbyEnabled,
            AllowChat = request.AllowChat,
            AllowReactions = request.AllowReactions,
            AllowScreenShare = request.AllowScreenShare,
            AllowAttendeeUnmute = request.AllowAttendeeUnmute,
            AllowRecording = request.AllowRecording,
            AllowTranscription = request.AllowTranscription,
            RecurrenceRule = request.RecurrenceRule,
            MaxParticipants = request.MaxParticipants,
            IsRecorded = request.IsRecorded,
            MeetingLink = request.IsOnlineMeeting ? BuildMeetingLink(meetingId) : null,
            Status = MeetingStatus.Scheduled,
            CreatedAt = DateTime.UtcNow
        };

        _context.Meetings.Add(meeting);
        var inviteEmails = SplitAttendeeEmails(meeting.AttendeeEmails);
        var inviteEntities = new List<MeetingInvite>();
        foreach (var email in inviteEmails)
        {
            var invite = new MeetingInvite
            {
                Id = Guid.NewGuid(),
                MeetingId = meeting.Id,
                Email = email,
                Role = ParticipantRole.Attendee,
                IsRequired = true,
                CreatedAt = DateTime.UtcNow
            };
            inviteEntities.Add(invite);
            _context.MeetingInvites.Add(invite);

            _context.MeetingReminders.Add(new MeetingReminder
            {
                Id = Guid.NewGuid(),
                MeetingId = meeting.Id,
                RecipientEmail = email,
                RemindAt = meeting.StartTime.AddMinutes(-5)
            });
        }

        await QueueInviteEmailsAsync(meeting, inviteEntities);
        await _context.SaveChangesAsync();
        await _externalCalendarSyncService.SyncMeetingAsync(meeting, organizerId);
        _logger.LogInformation("Meeting created: {MeetingId}", meeting.Id);
        return meeting;
    }

    public async Task<Meeting?> GetMeetingByIdAsync(Guid id)
    {
        return await MeetingsForTenant()
            .Include(m => m.Participants)
            .FirstOrDefaultAsync(m => m.Id == id);
    }

    public async Task<List<Meeting>> GetMeetingsByOrganizerAsync(Guid organizerId)
    {
        return await MeetingsForTenant()
            .Include(m => m.Participants)
            .Where(m => m.OrganizerId == organizerId)
            .OrderByDescending(m => m.CreatedAt)
            .ToListAsync();
    }

    public async Task<List<Meeting>> GetMeetingsForUserAsync(Guid userId, string? userEmail)
    {
        var normalizedEmail = userEmail?.Trim().ToLowerInvariant();

        return await MeetingsForTenant()
            .Include(m => m.Participants)
            .Include(m => m.Invites)
            .Where(m =>
                m.OrganizerId == userId
                || m.Participants.Any(participant => participant.UserId == userId)
                || (!string.IsNullOrWhiteSpace(normalizedEmail) && m.Invites.Any(invite => invite.Email.ToLower() == normalizedEmail)))
            .OrderByDescending(m => m.CreatedAt)
            .ToListAsync();
    }

    public async Task<List<Meeting>> GetUpcomingMeetingsAsync()
    {
        return await MeetingsForTenant()
            .Include(m => m.Participants)
            .Where(m => m.StartTime > DateTime.UtcNow && m.Status == MeetingStatus.Scheduled)
            .OrderBy(m => m.StartTime)
            .ToListAsync();
    }

    public async Task<Meeting> UpdateMeetingAsync(Guid id, UpdateMeetingRequest request)
    {
        var meeting = await MeetingsForTenant().FirstOrDefaultAsync(m => m.Id == id);
        if (meeting == null)
            throw new InvalidOperationException("Meeting not found");

        var durationMinutes = ResolveDurationMinutes(request.StartTime, request.EndTime, request.DurationMinutes);
        await EnsureOrganizerHasNoOverlapAsync(meeting.OrganizerId, request.StartTime, request.StartTime.AddMinutes(durationMinutes), id);
        meeting.Title = request.Title;
        meeting.TeamChannelId = request.TeamChannelId;
        meeting.Description = request.Description;
        meeting.StartTime = request.StartTime;
        meeting.EndTime = request.StartTime.AddMinutes(durationMinutes);
        meeting.DurationMinutes = durationMinutes;
        meeting.AttendeeEmails = NormalizeAttendeeEmails(request.AttendeeEmails);
        meeting.Location = request.Location;
        meeting.IsOnlineMeeting = request.IsOnlineMeeting;
        meeting.LobbyEnabled = request.LobbyEnabled;
        meeting.AllowChat = request.AllowChat;
        meeting.AllowReactions = request.AllowReactions;
        meeting.AllowScreenShare = request.AllowScreenShare;
        meeting.AllowAttendeeUnmute = request.AllowAttendeeUnmute;
        meeting.AllowRecording = request.AllowRecording;
        meeting.AllowTranscription = request.AllowTranscription;
        meeting.RecurrenceRule = request.RecurrenceRule;
        meeting.MaxParticipants = request.MaxParticipants;
        meeting.UpdatedAt = DateTime.UtcNow;

        _context.Meetings.Update(meeting);
        await _context.SaveChangesAsync();
        await _externalCalendarSyncService.SyncMeetingAsync(meeting, meeting.OrganizerId);
        _logger.LogInformation("Meeting updated: {MeetingId}", id);
        return meeting;
    }

    public async Task<Meeting> EndMeetingAsync(Guid id, Guid organizerId)
    {
        var meeting = await MeetingsForTenant()
            .Include(m => m.Participants)
            .FirstOrDefaultAsync(m => m.Id == id);
        if (meeting == null)
            throw new InvalidOperationException("Meeting not found");

        if (meeting.OrganizerId != organizerId)
            throw new UnauthorizedAccessException("Only the organizer can end this meeting");

        meeting.Status = MeetingStatus.Completed;
        meeting.EndTime = DateTime.UtcNow;
        meeting.UpdatedAt = DateTime.UtcNow;

        foreach (var participant in meeting.Participants.Where(participant => participant.LeftAt == null))
        {
            participant.LeftAt = DateTime.UtcNow;
            participant.IsAudioEnabled = false;
            participant.IsVideoEnabled = false;
            participant.IsScreenSharing = false;
        }

        _context.Meetings.Update(meeting);
        await _context.SaveChangesAsync();
        _logger.LogInformation("Meeting ended: {MeetingId}", id);
        return meeting;
    }

    public async Task DeleteMeetingAsync(Guid id)
    {
        var meeting = await MeetingsForTenant().FirstOrDefaultAsync(m => m.Id == id);
        if (meeting == null)
            throw new InvalidOperationException("Meeting not found");

        meeting.IsActive = false;
        _context.Meetings.Update(meeting);
        await _context.SaveChangesAsync();
        await _externalCalendarSyncService.DeleteExternalEventsAsync(meeting);
        _logger.LogInformation("Meeting deleted: {MeetingId}", id);
    }

    public async Task<Participant> JoinMeetingAsync(Guid meetingId, Guid userId, JoinMeetingRequest request)
    {
        var meeting = await MeetingsForTenant().FirstOrDefaultAsync(m => m.Id == meetingId);
        if (meeting == null)
            throw new InvalidOperationException("Meeting not found");

        var now = DateTime.UtcNow;
        var meetingEnd = meeting.EndTime ?? meeting.StartTime.AddMinutes(meeting.DurationMinutes ?? 60);
        if (!meeting.IsActive || meeting.Status is MeetingStatus.Completed or MeetingStatus.Cancelled || meetingEnd <= now)
            throw new InvalidOperationException("This meeting has ended. Chats and recordings are still available from the meeting details.");

        if (meeting.Status == MeetingStatus.Scheduled && meeting.StartTime <= now)
        {
            meeting.Status = MeetingStatus.InProgress;
            meeting.UpdatedAt = now;
            _context.Meetings.Update(meeting);
        }

        var existingParticipant = await _context.Participants
            .FirstOrDefaultAsync(p => p.MeetingId == meetingId && p.UserId == userId);
        if (existingParticipant != null)
        {
            existingParticipant.LeftAt = null;
            existingParticipant.IsAdmitted = true;
            _context.Participants.Update(existingParticipant);
            await _context.SaveChangesAsync();
            return existingParticipant;
        }

        var participant = new Participant
        {
            Id = Guid.NewGuid(),
            MeetingId = meetingId,
            UserId = userId,
            UserEmail = request.UserEmail,
            UserName = request.UserName,
            Role = meeting.OrganizerId == userId ? ParticipantRole.Organizer : ParticipantRole.Attendee,
            IsAdmitted = true,
            JoinedAt = DateTime.UtcNow
        };

        _context.Participants.Add(participant);
        await _context.SaveChangesAsync();
        _logger.LogInformation("Participant joined meeting: {ParticipantId}, {MeetingId}", participant.Id, meetingId);
        return participant;
    }

    private async Task EnsureOrganizerHasNoOverlapAsync(Guid organizerId, DateTime startTime, DateTime endTime, Guid? excludedMeetingId = null)
    {
        if (endTime <= startTime)
        {
            throw new InvalidOperationException("Meeting end time must be after the start time");
        }

        var hasOverlap = await MeetingsForTenant()
            .Where(meeting => meeting.OrganizerId == organizerId)
            .Where(meeting => meeting.IsActive)
            .Where(meeting => meeting.Status != MeetingStatus.Cancelled && meeting.Status != MeetingStatus.Completed)
            .Where(meeting => !excludedMeetingId.HasValue || meeting.Id != excludedMeetingId.Value)
            .AnyAsync(meeting => meeting.StartTime < endTime && (meeting.EndTime ?? meeting.StartTime.AddMinutes(meeting.DurationMinutes ?? 60)) > startTime);

        if (hasOverlap)
        {
            throw new InvalidOperationException("You already have a meeting scheduled in this time range.");
        }
    }

    private async Task AcceptMeetingInviteForJoinAsync(Guid meetingId, string? userEmail, DateTime respondedAt)
    {
        if (string.IsNullOrWhiteSpace(userEmail))
        {
            return;
        }

        var normalizedEmail = userEmail.Trim().ToLowerInvariant();
        var invite = await _context.MeetingInvites
            .FirstOrDefaultAsync(item => item.MeetingId == meetingId && item.Email.ToLower() == normalizedEmail);

        if (invite == null)
        {
            return;
        }

        invite.HasAccepted = true;
        invite.ResponseStatus = MeetingInviteResponseStatus.Accepted;
        invite.RespondedAt ??= respondedAt;
        _context.MeetingInvites.Update(invite);
    }

    public async Task<bool> LeaveMeetingAsync(Guid meetingId, Guid participantId)
    {
        var participant = await ParticipantsForTenant()
            .FirstOrDefaultAsync(p => p.Id == participantId && p.MeetingId == meetingId);
        if (participant == null)
            return false;

        participant.LeftAt = DateTime.UtcNow;
        participant.IsScreenSharing = false;
        _context.Participants.Update(participant);
        await _context.SaveChangesAsync();
        _logger.LogInformation("Participant left meeting: {ParticipantId}, {MeetingId}", participantId, meetingId);
        return true;
    }

    public async Task<List<Participant>> GetMeetingParticipantsAsync(Guid meetingId)
    {
        return await ParticipantsForTenant()
            .Where(p => p.MeetingId == meetingId && p.LeftAt == null)
            .ToListAsync();
    }

    public async Task<bool> UpdateParticipantStatusAsync(Guid participantId, bool audioEnabled, bool videoEnabled, bool screenSharing)
    {
        var participant = await ParticipantsForTenant()
            .FirstOrDefaultAsync(p => p.Id == participantId);
        if (participant == null)
            return false;

        if (screenSharing)
        {
            var otherPresenters = await _context.Participants
                .Where(p => p.MeetingId == participant.MeetingId && p.Id != participantId && p.LeftAt == null && p.IsScreenSharing)
                .ToListAsync();

            foreach (var otherPresenter in otherPresenters)
            {
                otherPresenter.IsScreenSharing = false;
            }
        }

        participant.IsAudioEnabled = audioEnabled;
        participant.IsVideoEnabled = videoEnabled;
        participant.IsScreenSharing = screenSharing;
        _context.Participants.Update(participant);
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> UpdateParticipantRoleAsync(Guid participantId, ParticipantRole role)
    {
        var participant = await ParticipantsForTenant()
            .FirstOrDefaultAsync(p => p.Id == participantId);
        if (participant == null)
            return false;

        participant.Role = role;
        _context.Participants.Update(participant);
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<Participant?> UpdateParticipantHandAsync(Guid participantId, bool isHandRaised)
    {
        var participant = await ParticipantsForTenant()
            .FirstOrDefaultAsync(p => p.Id == participantId);
        if (participant == null)
            return null;

        participant.IsHandRaised = isHandRaised;
        _context.Participants.Update(participant);
        await _context.SaveChangesAsync();
        return participant;
    }

    public async Task<Participant?> UpdateParticipantReactionAsync(Guid participantId, string? reaction)
    {
        var participant = await ParticipantsForTenant()
            .FirstOrDefaultAsync(p => p.Id == participantId);
        if (participant == null)
            return null;

        participant.Reaction = string.IsNullOrWhiteSpace(reaction) ? null : reaction.Trim();
        _context.Participants.Update(participant);
        await _context.SaveChangesAsync();
        return participant;
    }

    public async Task<MeetingChatMessage> AddChatMessageAsync(Guid meetingId, CreateChatMessageRequest request)
    {
        var meetingExists = await MeetingsForTenant().AnyAsync(meeting => meeting.Id == meetingId);
        if (!meetingExists)
        {
            throw new InvalidOperationException("Meeting not found");
        }

        var message = new MeetingChatMessage
        {
            Id = Guid.NewGuid(),
            MeetingId = meetingId,
            SenderId = request.SenderId,
            SenderName = request.SenderName,
            RecipientUserId = request.RecipientUserId,
            RecipientName = request.RecipientName,
            Scope = request.RecipientUserId.HasValue ? ChatScope.Direct : ChatScope.Everyone,
            Message = request.Message.TrimEnd(),
            SentAt = DateTime.UtcNow
        };

        _context.MeetingChatMessages.Add(message);
        await _context.SaveChangesAsync();
        return message;
    }

    public async Task<List<MeetingChatMessage>> GetChatMessagesAsync(Guid meetingId, Guid? currentUserId = null)
    {
        return await MeetingChatMessagesForTenant()
            .Where(message => message.MeetingId == meetingId && !message.IsDeleted)
            .Where(message =>
                message.Scope == ChatScope.Everyone ||
                currentUserId == null ||
                message.SenderId == currentUserId ||
                message.RecipientUserId == currentUserId)
            .OrderBy(message => message.SentAt)
            .ToListAsync();
    }

    public async Task<List<MeetingCallLog>> GetMeetingCallLogsAsync(Guid meetingId, Guid currentUserId)
    {
        var meetingExists = await MeetingsForTenant().AnyAsync(meeting => meeting.Id == meetingId);
        if (!meetingExists)
        {
            throw new InvalidOperationException("Meeting not found");
        }

        return await MeetingCallLogsForTenant()
            .Where(call => call.MeetingId == meetingId)
            .Where(call => call.CallerUserId == currentUserId || call.RecipientUserId == currentUserId)
            .OrderByDescending(call => call.CreatedAt)
            .ToListAsync();
    }

    public async Task<List<MeetingCallLog>> GetRecentMeetingCallLogsAsync(Guid currentUserId, string? status = null)
    {
        var query = MeetingCallLogsForTenant()
            .Include(call => call.Meeting)
            .Where(call =>
                (call.CallerUserId == currentUserId && call.CallerHiddenAt == null) ||
                (call.RecipientUserId == currentUserId && call.RecipientHiddenAt == null));

        if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "All", StringComparison.OrdinalIgnoreCase))
        {
            if (string.Equals(status, "Missed", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(call => call.Status == MeetingCallStatus.NoResponse && call.RecipientUserId == currentUserId);
            }
            else if (Enum.TryParse<MeetingCallStatus>(status, true, out var parsedStatus))
            {
                query = query.Where(call => call.Status == parsedStatus);
            }
        }

        return await query
            .OrderByDescending(call => call.CreatedAt)
            .Take(100)
            .ToListAsync();
    }

    public async Task<MeetingCallLog> CreateMeetingCallLogAsync(Guid meetingId, Guid callerUserId, string callerName, CreateMeetingCallLogRequest request)
    {
        var meeting = await MeetingsForTenant()
            .Include(item => item.Participants)
            .FirstOrDefaultAsync(item => item.Id == meetingId);
        if (meeting == null)
        {
            throw new InvalidOperationException("Meeting not found");
        }

        if (meeting.Status == MeetingStatus.Cancelled || meeting.Status == MeetingStatus.Completed)
        {
            throw new InvalidOperationException("Cannot call people in a closed meeting");
        }

        if (request.RecipientUserId == Guid.Empty || request.RecipientUserId == callerUserId)
        {
            throw new InvalidOperationException("Select another available user to call");
        }

        var callerIsInMeeting = meeting.OrganizerId == callerUserId
            || meeting.Participants.Any(participant => participant.UserId == callerUserId && participant.LeftAt == null);
        if (!callerIsInMeeting)
        {
            throw new UnauthorizedAccessException("Join the meeting before calling someone");
        }

        var recipientAlreadyJoined = meeting.Participants.Any(participant => participant.UserId == request.RecipientUserId && participant.LeftAt == null);
        if (recipientAlreadyJoined)
        {
            throw new InvalidOperationException("This user is already in the meeting");
        }

        var recipientEmail = request.RecipientEmail?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(recipientEmail))
        {
            throw new InvalidOperationException("Recipient email is required");
        }

        var call = new MeetingCallLog
        {
            Id = Guid.NewGuid(),
            OrganizationId = meeting.OrganizationId,
            MeetingId = meetingId,
            ConversationId = string.IsNullOrWhiteSpace(request.ConversationId) ? null : request.ConversationId.Trim(),
            CallerUserId = callerUserId,
            CallerName = string.IsNullOrWhiteSpace(callerName) ? "Caller" : callerName.Trim(),
            RecipientUserId = request.RecipientUserId,
            RecipientEmail = recipientEmail,
            RecipientName = string.IsNullOrWhiteSpace(request.RecipientName) ? recipientEmail : request.RecipientName.Trim(),
            CallType = string.Equals(request.CallType, "audio", StringComparison.OrdinalIgnoreCase) ? "audio" : "video",
            JoinUrl = request.JoinUrl,
            Status = MeetingCallStatus.Ringing,
            CallerSeenAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        };

        _context.MeetingCallLogs.Add(call);
        await _outbox.EnqueueAsync(new IncomingMeetingCallRequestedEvent(
            Guid.NewGuid(),
            DateTime.UtcNow,
            call.OrganizationId,
            call.ConversationId ?? string.Empty,
            call.MeetingId.ToString(),
            call.Id.ToString(),
            call.CallerUserId.ToString(),
            call.CallerName,
            call.CallType,
            call.JoinUrl ?? string.Empty,
            new List<string> { call.RecipientUserId.ToString() }));
        await _context.SaveChangesAsync();
        return call;
    }

    public async Task<MeetingCallLog> UpdateMeetingCallLogStatusAsync(Guid meetingId, Guid callLogId, Guid actorUserId, UpdateMeetingCallLogRequest request)
    {
        var call = await MeetingCallLogsForTenant()
            .Include(item => item.Meeting)
            .FirstOrDefaultAsync(item => item.Id == callLogId && item.MeetingId == meetingId);
        if (call == null)
        {
            throw new InvalidOperationException("Call log not found");
        }

        if (!Enum.TryParse<MeetingCallStatus>(request.Status, true, out var status))
        {
            throw new InvalidOperationException("Call status must be Ringing, Accepted, Declined, Cancelled, NoResponse, or Failed");
        }

        var actorIsCaller = call.CallerUserId == actorUserId;
        var actorIsRecipient = call.RecipientUserId == actorUserId;
        if (!actorIsCaller && !actorIsRecipient)
        {
            throw new UnauthorizedAccessException("You cannot update this call");
        }

        if (status == MeetingCallStatus.Cancelled && !actorIsCaller)
        {
            throw new UnauthorizedAccessException("Only the caller can cancel an outgoing call");
        }

        if ((status == MeetingCallStatus.Accepted || status == MeetingCallStatus.Declined) && !actorIsRecipient)
        {
            throw new UnauthorizedAccessException("Only the recipient can answer this call");
        }

        if (status == MeetingCallStatus.NoResponse && !actorIsCaller && !actorIsRecipient)
        {
            throw new UnauthorizedAccessException("Only call participants can mark no response");
        }

        if (call.Status != MeetingCallStatus.Ringing && status != MeetingCallStatus.Failed)
        {
            return call;
        }

        call.Status = status;
        call.StatusReason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        call.CancellationMessage = string.IsNullOrWhiteSpace(request.CancellationMessage) ? call.CancellationMessage : request.CancellationMessage.Trim();
        call.CancellationMessageId = request.CancellationMessageId ?? call.CancellationMessageId;
        call.StatusChangedAt = DateTime.UtcNow;
        _context.MeetingCallLogs.Update(call);
        await _outbox.EnqueueAsync(new MeetingCallStatusChangedEvent(
            Guid.NewGuid(),
            DateTime.UtcNow,
            call.OrganizationId,
            call.ConversationId ?? string.Empty,
            call.MeetingId.ToString(),
            call.Id.ToString(),
            call.CallerUserId.ToString(),
            call.CallerName,
            call.RecipientUserId.ToString(),
            call.RecipientName,
            call.Status.ToString(),
            call.StatusReason,
            call.CancellationMessage));
        await _context.SaveChangesAsync();
        return call;
    }

    public async Task<MeetingCallLog> MarkMeetingCallLogSeenAsync(Guid callLogId, Guid currentUserId)
    {
        var call = await MeetingCallLogsForTenant()
            .Include(item => item.Meeting)
            .FirstOrDefaultAsync(item => item.Id == callLogId);
        if (call == null)
        {
            throw new InvalidOperationException("Call log not found");
        }

        if (call.CallerUserId == currentUserId)
        {
            call.CallerSeenAt = DateTime.UtcNow;
        }
        else if (call.RecipientUserId == currentUserId)
        {
            call.RecipientSeenAt = DateTime.UtcNow;
        }
        else
        {
            throw new UnauthorizedAccessException("You cannot update this call");
        }

        _context.MeetingCallLogs.Update(call);
        await _context.SaveChangesAsync();
        return call;
    }

    public async Task HideMeetingCallLogAsync(Guid callLogId, Guid currentUserId)
    {
        var call = await MeetingCallLogsForTenant()
            .FirstOrDefaultAsync(item => item.Id == callLogId);
        if (call == null)
        {
            throw new InvalidOperationException("Call log not found");
        }

        if (call.CallerUserId == currentUserId)
        {
            call.CallerHiddenAt = DateTime.UtcNow;
        }
        else if (call.RecipientUserId == currentUserId)
        {
            call.RecipientHiddenAt = DateTime.UtcNow;
        }
        else
        {
            throw new UnauthorizedAccessException("You cannot update this call");
        }

        _context.MeetingCallLogs.Update(call);
        await _context.SaveChangesAsync();
    }

    public async Task ClearMeetingCallLogsAsync(Guid currentUserId, string? status = null)
    {
        var calls = await GetRecentMeetingCallLogsAsync(currentUserId, status);
        var now = DateTime.UtcNow;
        foreach (var call in calls)
        {
            if (call.CallerUserId == currentUserId)
            {
                call.CallerHiddenAt = now;
            }

            if (call.RecipientUserId == currentUserId)
            {
                call.RecipientHiddenAt = now;
            }
        }

        _context.MeetingCallLogs.UpdateRange(calls);
        await _context.SaveChangesAsync();
    }

    public async Task<LobbyRequest> RequestLobbyAccessAsync(Guid meetingId, Guid userId, JoinMeetingRequest request)
    {
        var meetingExists = await MeetingsForTenant().AnyAsync(meeting => meeting.Id == meetingId);
        if (!meetingExists)
        {
            throw new InvalidOperationException("Meeting not found");
        }

        var existingRequest = await _context.LobbyRequests
            .FirstOrDefaultAsync(lobby => lobby.MeetingId == meetingId && lobby.UserId == userId && lobby.Status == LobbyStatus.Waiting);

        if (existingRequest != null)
            return existingRequest;

        var lobbyRequest = new LobbyRequest
        {
            Id = Guid.NewGuid(),
            MeetingId = meetingId,
            UserId = userId,
            UserEmail = request.UserEmail,
            UserName = request.UserName,
            Status = LobbyStatus.Waiting,
            RequestedAt = DateTime.UtcNow
        };

        _context.LobbyRequests.Add(lobbyRequest);
        await _context.SaveChangesAsync();
        return lobbyRequest;
    }

    public async Task<List<LobbyRequest>> GetLobbyRequestsAsync(Guid meetingId)
    {
        return await LobbyRequestsForTenant()
            .Where(lobby => lobby.MeetingId == meetingId)
            .OrderByDescending(lobby => lobby.RequestedAt)
            .ToListAsync();
    }

    public async Task<LobbyRequest> DecideLobbyRequestAsync(Guid requestId, bool admit)
    {
        var lobbyRequest = await LobbyRequestsForTenant()
            .FirstOrDefaultAsync(lobby => lobby.Id == requestId);
        if (lobbyRequest == null)
            throw new InvalidOperationException("Lobby request not found");

        lobbyRequest.Status = admit ? LobbyStatus.Admitted : LobbyStatus.Denied;
        lobbyRequest.DecidedAt = DateTime.UtcNow;
        _context.LobbyRequests.Update(lobbyRequest);
        await _context.SaveChangesAsync();
        return lobbyRequest;
    }

    public async Task<Meeting> UpdateNotesAsync(Guid meetingId, string? notes)
    {
        var meeting = await MeetingsForTenant().FirstOrDefaultAsync(m => m.Id == meetingId);
        if (meeting == null)
            throw new InvalidOperationException("Meeting not found");

        meeting.Notes = notes;
        meeting.UpdatedAt = DateTime.UtcNow;
        _context.Meetings.Update(meeting);
        await _context.SaveChangesAsync();
        return meeting;
    }

    public async Task<Meeting> UpdateWhiteboardAsync(Guid meetingId, Guid userId, string userName, string? whiteboardData)
    {
        var meeting = await MeetingsForTenant()
            .Include(item => item.Participants)
            .FirstOrDefaultAsync(m => m.Id == meetingId);
        if (meeting == null)
            throw new InvalidOperationException("Meeting not found");

        var isOrganizer = meeting.OrganizerId == userId;
        var participant = meeting.Participants.FirstOrDefault(item => item.UserId == userId && item.LeftAt == null);
        var canEdit = isOrganizer || participant?.Role is ParticipantRole.Organizer or ParticipantRole.Presenter;
        if (!canEdit)
        {
            throw new UnauthorizedAccessException("Only organizers and presenters can edit the whiteboard");
        }

        meeting.WhiteboardData = string.IsNullOrWhiteSpace(whiteboardData) ? null : whiteboardData;
        meeting.UpdatedAt = DateTime.UtcNow;
        _context.Meetings.Update(meeting);
        await AddAuditLogAsync(userId, userName, "Whiteboard edited", null, meetingId);
        await _context.SaveChangesAsync();
        return meeting;
    }

    public async Task<Meeting> UpdateRecordingAsync(Guid meetingId, string recordingUrl)
    {
        var meeting = await MeetingsForTenant().FirstOrDefaultAsync(m => m.Id == meetingId);
        if (meeting == null)
            throw new InvalidOperationException("Meeting not found");

        meeting.IsRecorded = true;
        meeting.RecordingUrl = recordingUrl;
        meeting.UpdatedAt = DateTime.UtcNow;
        _context.Meetings.Update(meeting);
        var recipientUserIds = await _context.Participants
            .Where(participant => participant.MeetingId == meetingId)
            .Select(participant => participant.UserId.ToString())
            .ToListAsync();
        recipientUserIds.Add(meeting.OrganizerId.ToString());
        await _outbox.EnqueueAsync(new MeetingRecordingReadyEvent(
            Guid.NewGuid(),
            DateTime.UtcNow,
            meeting.OrganizationId,
            meeting.Id,
            meeting.Title,
            recordingUrl,
            recipientUserIds.Distinct(StringComparer.OrdinalIgnoreCase).ToList()));
        await _context.SaveChangesAsync();
        return meeting;
    }

    public async Task<List<MeetingInvite>> GetInvitesAsync(Guid meetingId)
    {
        return await MeetingInvitesForTenant()
            .Where(invite => invite.MeetingId == meetingId)
            .OrderBy(invite => invite.Email)
            .ToListAsync();
    }

    public async Task<List<MeetingInvite>> SendInvitesAsync(Guid meetingId, IEnumerable<string> emails)
    {
        var meeting = await MeetingsForTenant().FirstOrDefaultAsync(item => item.Id == meetingId);
        if (meeting == null)
        {
            throw new InvalidOperationException("Meeting not found");
        }

        var normalizedEmails = NormalizeEmailList(emails);
        var existingInvites = await _context.MeetingInvites
            .Where(invite => invite.MeetingId == meetingId)
            .ToListAsync();

        var existingEmails = existingInvites
            .Select(invite => invite.Email)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var newInvites = new List<MeetingInvite>();
        foreach (var email in normalizedEmails.Where(email => !existingEmails.Contains(email)))
        {
            var invite = new MeetingInvite
            {
                Id = Guid.NewGuid(),
                MeetingId = meetingId,
                Email = email,
                Role = ParticipantRole.Attendee,
                IsRequired = true,
                CreatedAt = DateTime.UtcNow
            };
            newInvites.Add(invite);
            _context.MeetingInvites.Add(invite);
        }

        var allEmails = SplitAttendeeEmails(meeting.AttendeeEmails)
            .Concat(normalizedEmails)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        meeting.AttendeeEmails = NormalizeAttendeeEmails(allEmails);
        meeting.UpdatedAt = DateTime.UtcNow;
        _context.Meetings.Update(meeting);

        var invitesToEmail = existingInvites
            .Where(invite => normalizedEmails.Contains(invite.Email, StringComparer.OrdinalIgnoreCase))
            .Concat(newInvites)
            .ToList();
        await QueueInviteEmailsAsync(meeting, invitesToEmail);
        await _context.SaveChangesAsync();

        return existingInvites.Concat(newInvites).OrderBy(invite => invite.Email).ToList();
    }

    public async Task<MeetingInvite> UpdateInviteResponseAsync(
        Guid meetingId,
        Guid inviteId,
        Guid currentUserId,
        string? currentUserEmail,
        MeetingInviteResponseStatus status,
        string? reason)
    {
        var invite = await _context.MeetingInvites
            .Include(item => item.Meeting)
            .FirstOrDefaultAsync(item => item.Id == inviteId && item.MeetingId == meetingId);

        if (invite == null || !MatchesTenant(invite.Meeting.OrganizationId))
        {
            throw new InvalidOperationException("Invite not found");
        }

        var normalizedCurrentEmail = currentUserEmail?.Trim().ToLowerInvariant();
        var isInviteOwner = !string.IsNullOrWhiteSpace(normalizedCurrentEmail)
            && invite.Email.Trim().ToLowerInvariant() == normalizedCurrentEmail;
        if (!isInviteOwner)
        {
            throw new UnauthorizedAccessException("You cannot respond to this invite");
        }

        var trimmedReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        if (trimmedReason?.Length > 500)
        {
            trimmedReason = trimmedReason[..500];
        }

        invite.ResponseStatus = status;
        invite.HasAccepted = status == MeetingInviteResponseStatus.Accepted;
        invite.ResponseReason = trimmedReason;
        invite.RespondedAt = status == MeetingInviteResponseStatus.Pending ? null : DateTime.UtcNow;
        _context.MeetingInvites.Update(invite);
        await _context.SaveChangesAsync();
        return invite;
    }

    public async Task<List<Conversation>> GetConversationsAsync(Guid userId, string? userEmail, string userName)
    {
        await AcceptPendingConversationInvitesAsync(userId, userEmail, userName);

        return await ConversationsForTenant()
            .Include(conversation => conversation.Members)
            .Include(conversation => conversation.Invites)
            .Include(conversation => conversation.Messages.Where(message => !message.IsDeleted))
            .Where(conversation => conversation.Members.Any(member => member.UserId == userId))
            .OrderByDescending(conversation => conversation.UpdatedAt ?? conversation.CreatedAt)
            .AsSplitQuery()
            .ToListAsync();
    }

    public async Task<Conversation> CreateConversationAsync(Guid creatorId, CreateConversationRequest request)
    {
        var type = Enum.TryParse<ConversationType>(request.Type, true, out var parsedType)
            ? parsedType
            : ConversationType.Direct;

        var members = request.Members
            .Where(member => member.UserId != Guid.Empty)
            .GroupBy(member => member.UserId)
            .Select(group => group.First())
            .ToList();
        var inviteEmails = NormalizeEmailList(request.InviteEmails);

        if (!members.Any(member => member.UserId == creatorId))
        {
            throw new InvalidOperationException("Creator must be included in the conversation");
        }

        var creator = members.First(member => member.UserId == creatorId);
        inviteEmails = inviteEmails
            .Where(email => !members.Any(member => string.Equals(member.UserEmail, email, StringComparison.OrdinalIgnoreCase)))
            .ToList();

        if (members.Count + inviteEmails.Count < 2)
        {
            throw new InvalidOperationException("Select at least one person or email invite");
        }

        if (type == ConversationType.Direct)
        {
            if (members.Count + inviteEmails.Count != 2)
            {
                throw new InvalidOperationException("Direct conversations must have exactly two people or one email invite");
            }

            if (members.Count == 2)
            {
                var memberIds = members.Select(member => member.UserId).OrderBy(id => id).ToList();
                var firstMemberId = memberIds[0];
                var secondMemberId = memberIds[1];
                var organizationId = _tenantContext.OrganizationId;
                var existing = await _context.Conversations
                    .Include(conversation => conversation.Members)
                    .Include(conversation => conversation.Invites)
                    .Include(conversation => conversation.Messages.Where(message => !message.IsDeleted))
                    .Where(conversation => organizationId.HasValue
                        ? conversation.OrganizationId == organizationId.Value
                        : conversation.OrganizationId == null)
                    .Where(conversation => conversation.Type == ConversationType.Direct)
                    .Where(conversation => conversation.Members.Count == 2)
                    .Where(conversation => conversation.Members.Any(member => member.UserId == firstMemberId))
                    .Where(conversation => conversation.Members.Any(member => member.UserId == secondMemberId))
                    .FirstOrDefaultAsync();

                if (existing != null)
                {
                    return existing;
                }
            }
        }

        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            OrganizationId = _tenantContext.OrganizationId,
            Type = type,
            Title = type == ConversationType.Group ? request.Title?.Trim() : null,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Members = members.Select(member => new ConversationMember
            {
                Id = Guid.NewGuid(),
                UserId = member.UserId,
                UserEmail = member.UserEmail,
                UserName = member.UserName,
                JoinedAt = DateTime.UtcNow,
                LastReadAt = DateTime.UtcNow
            }).ToList()
        };

        foreach (var email in inviteEmails)
        {
            conversation.Invites.Add(new ConversationInvite
            {
                Id = Guid.NewGuid(),
                Email = email,
                InvitedByUserId = creatorId,
                InvitedByName = creator.UserName,
                CreatedAt = DateTime.UtcNow
            });
        }

        _context.Conversations.Add(conversation);

        foreach (var email in inviteEmails)
        {
            try
            {
                await _outbox.EnqueueAsync(new ConversationInviteEmailRequestedEvent(
                    Guid.NewGuid(),
                    DateTime.UtcNow,
                    conversation.OrganizationId,
                    conversation.Id,
                    email,
                    creator.UserName));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to queue chat invite email. Recipient: {Email}, Conversation: {ConversationId}", email, conversation.Id);
            }
        }

        await _context.SaveChangesAsync();
        return conversation;
    }

    public async Task<List<ConversationMessage>> GetConversationMessagesAsync(Guid conversationId, Guid userId)
    {
        var member = await ConversationMembersForTenant()
            .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == userId);

        if (member == null)
        {
            throw new InvalidOperationException("Conversation not found");
        }

        var messages = await _context.ConversationMessages
            .Include(message => message.Reactions)
            .Where(message => message.ConversationId == conversationId && !message.IsDeleted)
            .OrderBy(message => message.SentAt)
            .ToListAsync();

        var readAt = messages.Count > 0 ? messages.Max(message => message.SentAt) : DateTime.UtcNow;
        if (!member.LastReadAt.HasValue || member.LastReadAt.Value < readAt)
        {
            member.LastReadAt = readAt;
            _context.ConversationMembers.Update(member);
            await _context.SaveChangesAsync();
        }

        return messages;
    }

    public async Task MarkConversationReadAsync(Guid conversationId, Guid userId)
    {
        var member = await ConversationMembersForTenant()
            .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == userId);

        if (member == null)
        {
            throw new InvalidOperationException("Conversation not found");
        }

        var latestMessageAt = await _context.ConversationMessages
            .Where(message => message.ConversationId == conversationId && !message.IsDeleted)
            .MaxAsync(message => (DateTime?)message.SentAt);

        var readAt = latestMessageAt ?? DateTime.UtcNow;
        if (!member.LastReadAt.HasValue || member.LastReadAt.Value < readAt)
        {
            member.LastReadAt = readAt;
            _context.ConversationMembers.Update(member);
            await _context.SaveChangesAsync();
        }
    }

    public async Task MarkConversationUnreadAsync(Guid conversationId, Guid messageId, Guid userId)
    {
        var member = await ConversationMembersForTenant()
            .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == userId);

        if (member == null)
        {
            throw new InvalidOperationException("Conversation not found");
        }

        var message = await _context.ConversationMessages
            .FirstOrDefaultAsync(item => item.Id == messageId && item.ConversationId == conversationId && !item.IsDeleted);

        if (message == null)
        {
            throw new InvalidOperationException("Message not found");
        }

        member.LastReadAt = message.SentAt.AddTicks(-1);
        _context.ConversationMembers.Update(member);
        await _context.SaveChangesAsync();
    }

    public async Task<bool> CanAccessConversationAsync(Guid conversationId, Guid userId)
    {
        return await ConversationMembersForTenant()
            .AnyAsync(member => member.ConversationId == conversationId && member.UserId == userId);
    }

    public async Task<ConversationMessage> AddConversationMessageAsync(Guid conversationId, SendConversationMessageRequest request)
    {
        var isMember = await ConversationMembersForTenant()
            .AnyAsync(member => member.ConversationId == conversationId && member.UserId == request.SenderId);

        if (!isMember)
        {
            throw new InvalidOperationException("Conversation not found");
        }

        var clientMessageId = NormalizeClientMessageId(request.ClientMessageId);
        if (!string.IsNullOrWhiteSpace(clientMessageId))
        {
            var existingMessage = await _context.ConversationMessages
                .Include(message => message.Reactions)
                .FirstOrDefaultAsync(message =>
                    message.ConversationId == conversationId &&
                    message.SenderId == request.SenderId &&
                    message.ClientMessageId == clientMessageId);

            if (existingMessage != null)
            {
                return existingMessage;
            }
        }

        var messageText = (request.Message ?? string.Empty).TrimEnd();
        if (string.IsNullOrWhiteSpace(messageText) && string.IsNullOrWhiteSpace(request.AttachmentUrl))
        {
            throw new InvalidOperationException("Message or attachment is required");
        }

        ConversationMessage? replyToMessage = null;
        if (request.ReplyToMessageId.HasValue)
        {
            replyToMessage = await _context.ConversationMessages
                .FirstOrDefaultAsync(item => item.Id == request.ReplyToMessageId.Value && item.ConversationId == conversationId && !item.IsDeleted);
        }

        var message = new ConversationMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SenderId = request.SenderId,
            SenderName = request.SenderName,
            ClientMessageId = clientMessageId,
            Message = messageText,
            AttachmentFileName = request.AttachmentFileName,
            AttachmentUrl = request.AttachmentUrl,
            AttachmentContentType = request.AttachmentContentType,
            AttachmentSizeBytes = request.AttachmentSizeBytes,
            ReplyToMessageId = replyToMessage?.Id,
            ReplyToSenderName = replyToMessage?.SenderName,
            ReplyToPreview = replyToMessage == null ? null : BuildReplyPreview(replyToMessage),
            IsImportant = request.IsImportant,
            SentAt = DateTime.UtcNow
        };

        _context.ConversationMessages.Add(message);
        var conversation = await ConversationsForTenant().FirstAsync(item => item.Id == conversationId);
        conversation.UpdatedAt = message.SentAt;
        _context.Conversations.Update(conversation);
        await PublishConversationMessageCreatedAsync(message);
        await _context.SaveChangesAsync();
        return message;
    }

    public async Task<ConversationMessage> ToggleConversationMessagePinAsync(Guid conversationId, Guid messageId, Guid userId)
    {
        var isMember = await ConversationMembersForTenant()
            .AnyAsync(member => member.ConversationId == conversationId && member.UserId == userId);

        if (!isMember)
        {
            throw new InvalidOperationException("Conversation not found");
        }

        var message = await _context.ConversationMessages
            .Include(item => item.Reactions)
            .FirstOrDefaultAsync(item => item.Id == messageId && item.ConversationId == conversationId && !item.IsDeleted);

        if (message == null)
        {
            throw new InvalidOperationException("Message not found");
        }

        message.IsPinned = !message.IsPinned;
        _context.ConversationMessages.Update(message);
        await PublishConversationMessageUpdatedAsync(message);
        await _context.SaveChangesAsync();
        return message;
    }

    public async Task DeleteConversationMessageAsync(Guid conversationId, Guid messageId, Guid userId)
    {
        var isMember = await ConversationMembersForTenant()
            .AnyAsync(member => member.ConversationId == conversationId && member.UserId == userId);

        if (!isMember)
        {
            throw new InvalidOperationException("Conversation not found");
        }

        var message = await _context.ConversationMessages
            .FirstOrDefaultAsync(item => item.Id == messageId && item.ConversationId == conversationId && !item.IsDeleted);

        if (message == null)
        {
            throw new InvalidOperationException("Message not found");
        }

        if (message.SenderId != userId)
        {
            throw new UnauthorizedAccessException("Only the sender can delete this message");
        }

        message.IsDeleted = true;
        _context.ConversationMessages.Update(message);

        var latestMessageAt = await _context.ConversationMessages
            .Where(item => item.ConversationId == conversationId && item.Id != messageId && !item.IsDeleted)
            .MaxAsync(item => (DateTime?)item.SentAt);

        var conversation = await ConversationsForTenant().FirstAsync(item => item.Id == conversationId);
        conversation.UpdatedAt = latestMessageAt ?? DateTime.UtcNow;
        _context.Conversations.Update(conversation);

        await _context.SaveChangesAsync();
    }

    public async Task<ConversationMessage> UpdateConversationMessageAsync(Guid conversationId, Guid messageId, Guid userId, UpdateConversationMessageRequest request)
    {
        var messageText = (request.Message ?? string.Empty).TrimEnd();
        if (string.IsNullOrWhiteSpace(messageText))
        {
            throw new InvalidOperationException("Message is required");
        }

        var isMember = await ConversationMembersForTenant()
            .AnyAsync(member => member.ConversationId == conversationId && member.UserId == userId);

        if (!isMember)
        {
            throw new InvalidOperationException("Conversation not found");
        }

        var message = await _context.ConversationMessages
            .FirstOrDefaultAsync(item => item.Id == messageId && item.ConversationId == conversationId && !item.IsDeleted);

        if (message == null)
        {
            throw new InvalidOperationException("Message not found");
        }

        if (message.SenderId != userId)
        {
            throw new UnauthorizedAccessException("Only the sender can edit this message");
        }

        message.Message = messageText;
        if (request.IsImportant.HasValue)
        {
            message.IsImportant = request.IsImportant.Value;
        }

        message.EditedAt = DateTime.UtcNow;
        _context.ConversationMessages.Update(message);

        var conversation = await ConversationsForTenant().FirstAsync(item => item.Id == conversationId);
        conversation.UpdatedAt = message.EditedAt;
        _context.Conversations.Update(conversation);

        await PublishConversationMessageUpdatedAsync(message);
        await _context.SaveChangesAsync();
        return message;
    }

    public async Task<List<ConversationMessageReaction>> ToggleConversationMessageReactionAsync(Guid conversationId, Guid messageId, Guid userId, string userName, ToggleConversationMessageReactionRequest request)
    {
        var emoji = (request.Emoji ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(emoji) || emoji.Length > 32)
        {
            throw new InvalidOperationException("Reaction is required");
        }

        var isMember = await ConversationMembersForTenant()
            .AnyAsync(member => member.ConversationId == conversationId && member.UserId == userId);

        if (!isMember)
        {
            throw new InvalidOperationException("Conversation not found");
        }

        var messageExists = await _context.ConversationMessages
            .AnyAsync(message => message.Id == messageId && message.ConversationId == conversationId && !message.IsDeleted);

        if (!messageExists)
        {
            throw new InvalidOperationException("Message not found");
        }

        var reactions = await _context.ConversationMessageReactions
            .Where(reaction => reaction.ConversationMessageId == messageId)
            .OrderBy(reaction => reaction.CreatedAt)
            .ToListAsync();
        var existingReaction = reactions
            .FirstOrDefault(reaction => reaction.UserId == userId && reaction.Emoji == emoji);

        if (existingReaction != null)
        {
            _context.ConversationMessageReactions.Remove(existingReaction);
            reactions.Remove(existingReaction);
        }
        else
        {
            var reaction = new ConversationMessageReaction
            {
                Id = Guid.NewGuid(),
                ConversationMessageId = messageId,
                UserId = userId,
                UserName = userName,
                Emoji = emoji,
                CreatedAt = DateTime.UtcNow
            };
            _context.ConversationMessageReactions.Add(reaction);
            reactions.Add(reaction);
        }

        await PublishConversationReactionUpdatedAsync(conversationId, messageId, reactions);
        await _context.SaveChangesAsync();
        return reactions;
    }

    public async Task<List<ScheduledConversationMessage>> GetScheduledConversationMessagesAsync(Guid conversationId, Guid userId)
    {
        var isMember = await ConversationMembersForTenant()
            .AnyAsync(member => member.ConversationId == conversationId && member.UserId == userId);

        if (!isMember)
        {
            throw new InvalidOperationException("Conversation not found");
        }

        return await _context.ScheduledConversationMessages
            .Where(message => message.ConversationId == conversationId && message.SenderId == userId && message.Status == "Pending")
            .OrderBy(message => message.ScheduledFor)
            .ToListAsync();
    }

    public async Task<ScheduledConversationMessage> ScheduleConversationMessageAsync(Guid conversationId, Guid userId, string senderName, ScheduleConversationMessageRequest request)
    {
        var messageText = (request.Message ?? string.Empty).TrimEnd();
        if (string.IsNullOrWhiteSpace(messageText))
        {
            throw new InvalidOperationException("Message is required");
        }

        var scheduledFor = request.ScheduledFor.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(request.ScheduledFor, DateTimeKind.Local).ToUniversalTime()
            : request.ScheduledFor.ToUniversalTime();

        if (scheduledFor <= DateTime.UtcNow.AddSeconds(30))
        {
            throw new InvalidOperationException("Schedule time must be in the future");
        }

        var isMember = await ConversationMembersForTenant()
            .AnyAsync(member => member.ConversationId == conversationId && member.UserId == userId);

        if (!isMember)
        {
            throw new InvalidOperationException("Conversation not found");
        }

        var scheduledMessage = new ScheduledConversationMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SenderId = userId,
            SenderName = senderName,
            Message = messageText,
            ScheduledFor = scheduledFor,
            CreatedAt = DateTime.UtcNow,
            Status = "Pending"
        };

        _context.ScheduledConversationMessages.Add(scheduledMessage);
        await _context.SaveChangesAsync();
        return scheduledMessage;
    }

    public async Task CancelScheduledConversationMessageAsync(Guid conversationId, Guid scheduledMessageId, Guid userId)
    {
        var scheduledMessage = await ScheduledConversationMessagesForTenant()
            .FirstOrDefaultAsync(message =>
                message.Id == scheduledMessageId &&
                message.ConversationId == conversationId &&
                message.SenderId == userId &&
                message.Status == "Pending");

        if (scheduledMessage == null)
        {
            throw new InvalidOperationException("Scheduled message not found");
        }

        scheduledMessage.Status = "Cancelled";
        _context.ScheduledConversationMessages.Update(scheduledMessage);
        await _context.SaveChangesAsync();
    }

    public async Task<List<ConversationTask>> GetConversationTasksAsync(
        Guid conversationId,
        Guid userId,
        string? status = null,
        string? priority = null,
        Guid? assigneeId = null,
        DateTime? dueBefore = null,
        string? query = null)
    {
        if (!await CanAccessConversationAsync(conversationId, userId))
        {
            throw new InvalidOperationException("Conversation not found");
        }

        var taskQuery = _context.ConversationTasks
            .Include(task => task.SourceMessage)
            .Include(task => task.Notes.OrderByDescending(note => note.CreatedAt))
            .Include(task => task.Activities.OrderByDescending(activity => activity.CreatedAt))
            .Where(task => task.ConversationId == conversationId && !task.IsDeleted);

        if (TryParseEnum(status, out ConversationTaskStatus parsedStatus))
        {
            taskQuery = taskQuery.Where(task => task.Status == parsedStatus);
        }

        if (TryParseEnum(priority, out ConversationTaskPriority parsedPriority))
        {
            taskQuery = taskQuery.Where(task => task.Priority == parsedPriority);
        }

        if (assigneeId.HasValue)
        {
            taskQuery = taskQuery.Where(task => task.AssigneeId == assigneeId.Value);
        }

        if (dueBefore.HasValue)
        {
            taskQuery = taskQuery.Where(task => task.DueDate.HasValue && task.DueDate.Value <= dueBefore.Value);
        }

        if (!string.IsNullOrWhiteSpace(query))
        {
            var normalizedQuery = query.Trim().ToLower();
            taskQuery = taskQuery.Where(task =>
                task.Title.ToLower().Contains(normalizedQuery) ||
                (task.Description != null && task.Description.ToLower().Contains(normalizedQuery)) ||
                (task.AssigneeName != null && task.AssigneeName.ToLower().Contains(normalizedQuery)) ||
                (task.AssigneeEmail != null && task.AssigneeEmail.ToLower().Contains(normalizedQuery)));
        }

        return await taskQuery
            .OrderBy(task => task.Status == ConversationTaskStatus.Completed)
            .ThenBy(task => task.DueDate ?? DateTime.MaxValue)
            .ThenByDescending(task => task.CreatedAt)
            .AsSplitQuery()
            .ToListAsync();
    }

    public async Task<ConversationTask> CreateConversationTaskAsync(Guid conversationId, Guid userId, string userName, CreateConversationTaskRequest request)
    {
        var isMember = await CanAccessConversationAsync(conversationId, userId);
        if (!isMember)
        {
            throw new InvalidOperationException("Conversation not found");
        }

        ConversationMessage? sourceMessage = null;
        if (request.SourceMessageId.HasValue)
        {
            sourceMessage = await _context.ConversationMessages
                .FirstOrDefaultAsync(message => message.Id == request.SourceMessageId.Value && message.ConversationId == conversationId && !message.IsDeleted);

            if (sourceMessage == null)
            {
                throw new InvalidOperationException("Source message not found");
            }
        }

        var title = NormalizeTaskTitle(request.Title, sourceMessage);
        if (string.IsNullOrWhiteSpace(title))
        {
            throw new InvalidOperationException("Task title is required");
        }

        var assignee = await ResolveTaskAssigneeAsync(conversationId, request.AssigneeId, request.AssigneeEmail, request.AssigneeName);
        var now = DateTime.UtcNow;
        var task = new ConversationTask
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SourceMessageId = sourceMessage?.Id,
            Title = title,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            Priority = TryParseEnum(request.Priority, out ConversationTaskPriority priority) ? priority : ConversationTaskPriority.Normal,
            Status = ConversationTaskStatus.Pending,
            OwnerId = userId,
            OwnerName = userName,
            AssigneeId = assignee.AssigneeId,
            AssigneeEmail = assignee.AssigneeEmail,
            AssigneeName = assignee.AssigneeName,
            DueDate = NormalizeOptionalDate(request.DueDate),
            CreatedAt = now,
            UpdatedAt = now
        };

        task.Activities.Add(CreateTaskActivity(task.Id, userId, userName, "Created", sourceMessage == null ? null : $"From message by {sourceMessage.SenderName}"));
        _context.ConversationTasks.Add(task);
        await AddAuditLogAsync(userId, userName, "Task created", task.Title, conversationId: conversationId);
        await PublishConversationTaskAssignedAsync(task, userName);
        await _context.SaveChangesAsync();

        return await LoadConversationTaskAsync(conversationId, task.Id);
    }

    public async Task<ConversationTask> UpdateConversationTaskAsync(Guid conversationId, Guid taskId, Guid userId, string userName, UpdateConversationTaskRequest request)
    {
        var task = await LoadConversationTaskForUpdateAsync(conversationId, taskId, userId);
        var changes = new List<string>();

        if (request.Title != null)
        {
            var title = request.Title.Trim();
            if (string.IsNullOrWhiteSpace(title))
            {
                throw new InvalidOperationException("Task title is required");
            }

            if (!string.Equals(task.Title, title, StringComparison.Ordinal))
            {
                task.Title = title.Length > 240 ? title[..240] : title;
                changes.Add("title");
            }
        }

        if (request.Description != null && !string.Equals(task.Description ?? string.Empty, request.Description.Trim(), StringComparison.Ordinal))
        {
            task.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
            changes.Add("description");
        }

        if (TryParseEnum(request.Priority, out ConversationTaskPriority priority) && task.Priority != priority)
        {
            task.Priority = priority;
            changes.Add($"priority to {priority}");
        }

        if (TryParseEnum(request.Status, out ConversationTaskStatus status) && task.Status != status)
        {
            task.Status = status;
            task.CompletedAt = status == ConversationTaskStatus.Completed ? DateTime.UtcNow : null;
            changes.Add($"status to {status}");
        }

        if (request.AssigneeId.HasValue || request.AssigneeEmail != null || request.AssigneeName != null)
        {
            var assignee = await ResolveTaskAssigneeAsync(conversationId, request.AssigneeId, request.AssigneeEmail, request.AssigneeName);
            if (task.AssigneeId != assignee.AssigneeId ||
                !string.Equals(task.AssigneeEmail, assignee.AssigneeEmail, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(task.AssigneeName, assignee.AssigneeName, StringComparison.Ordinal))
            {
                task.AssigneeId = assignee.AssigneeId;
                task.AssigneeEmail = assignee.AssigneeEmail;
                task.AssigneeName = assignee.AssigneeName;
                changes.Add($"assignee to {task.AssigneeName ?? task.AssigneeEmail ?? "unassigned"}");
            }
        }

        if (request.DueDate.HasValue && task.DueDate != NormalizeOptionalDate(request.DueDate))
        {
            task.DueDate = NormalizeOptionalDate(request.DueDate);
            changes.Add("due date");
        }

        if (changes.Count == 0)
        {
            return task;
        }

        task.UpdatedAt = DateTime.UtcNow;
        _context.ConversationTaskActivities.Add(CreateTaskActivity(task.Id, userId, userName, "Updated", string.Join(", ", changes)));
        await AddAuditLogAsync(userId, userName, "Task updated", $"{task.Title}: {string.Join(", ", changes)}", conversationId: conversationId);
        if (changes.Any(change => change.StartsWith("assignee", StringComparison.OrdinalIgnoreCase)))
        {
            await PublishConversationTaskAssignedAsync(task, userName);
        }
        await _context.SaveChangesAsync();

        return await LoadConversationTaskAsync(conversationId, task.Id);
    }

    public async Task<ConversationTaskNote> AddConversationTaskNoteAsync(Guid conversationId, Guid taskId, Guid userId, string userName, AddConversationTaskNoteRequest request)
    {
        var task = await LoadConversationTaskForUpdateAsync(conversationId, taskId, userId);
        var noteText = (request.Note ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(noteText))
        {
            throw new InvalidOperationException("Task note is required");
        }

        var note = new ConversationTaskNote
        {
            Id = Guid.NewGuid(),
            TaskId = task.Id,
            AuthorId = userId,
            AuthorName = userName,
            Note = noteText,
            CreatedAt = DateTime.UtcNow
        };

        task.UpdatedAt = DateTime.UtcNow;
        _context.ConversationTaskNotes.Add(note);
        _context.ConversationTaskActivities.Add(CreateTaskActivity(task.Id, userId, userName, "Note added", noteText.Length <= 160 ? noteText : $"{noteText[..157]}..."));
        await AddAuditLogAsync(userId, userName, "Task note added", task.Title, conversationId: conversationId);
        await _context.SaveChangesAsync();
        return note;
    }

    public async Task DeleteConversationTaskAsync(Guid conversationId, Guid taskId, Guid userId, string userName)
    {
        var task = await LoadConversationTaskForUpdateAsync(conversationId, taskId, userId);
        task.IsDeleted = true;
        task.UpdatedAt = DateTime.UtcNow;
        _context.ConversationTaskActivities.Add(CreateTaskActivity(task.Id, userId, userName, "Deleted", null));
        await AddAuditLogAsync(userId, userName, "Task deleted", task.Title, conversationId: conversationId);
        await _context.SaveChangesAsync();
    }

    public async Task<List<ConversationDocumentShare>> ShareConversationDocumentAsync(Guid conversationId, Guid messageId, Guid userId, string userName, ShareConversationDocumentRequest request)
    {
        if (!await CanAccessConversationAsync(conversationId, userId))
        {
            throw new InvalidOperationException("Conversation not found");
        }

        var message = await _context.ConversationMessages
            .Include(item => item.Conversation)
            .FirstOrDefaultAsync(item => item.Id == messageId && item.ConversationId == conversationId && !item.IsDeleted);

        if (message == null || string.IsNullOrWhiteSpace(message.AttachmentUrl))
        {
            throw new InvalidOperationException("Document not found");
        }

        var recipients = NormalizeEmailList(request.Emails);
        if (recipients.Count == 0)
        {
            throw new InvalidOperationException("At least one recipient email is required");
        }

        var shares = new List<ConversationDocumentShare>();
        var share = new ConversationDocumentShare
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            MessageId = messageId,
            SharedByUserId = userId,
            SharedByName = userName,
            RecipientEmails = string.Join(";", recipients),
            OptionalMessage = string.IsNullOrWhiteSpace(request.Message) ? null : request.Message.Trim(),
            CreatedAt = DateTime.UtcNow
        };
        _context.ConversationDocumentShares.Add(share);
        shares.Add(share);
        await AddAuditLogAsync(userId, userName, "Document shared via email", message.AttachmentFileName, conversationId: conversationId);
        foreach (var email in recipients)
        {
            await _outbox.EnqueueAsync(new DocumentShareEmailRequestedEvent(
                Guid.NewGuid(),
                DateTime.UtcNow,
                message.Conversation.OrganizationId,
                conversationId,
                messageId,
                email,
                userName,
                request.Message));
        }
        await _context.SaveChangesAsync();

        return shares;
    }

    public async Task<List<ConversationDocumentShare>> GetConversationDocumentSharesAsync(Guid conversationId, Guid userId, Guid? messageId = null)
    {
        if (!await CanAccessConversationAsync(conversationId, userId))
        {
            throw new InvalidOperationException("Conversation not found");
        }

        var query = _context.ConversationDocumentShares
            .Where(share => share.ConversationId == conversationId);

        if (messageId.HasValue)
        {
            query = query.Where(share => share.MessageId == messageId.Value);
        }

        return await query
            .OrderByDescending(share => share.CreatedAt)
            .ToListAsync();
    }

    public async Task<List<GlobalSearchResultDto>> SearchAsync(Guid userId, string query)
    {
        var normalizedQuery = (query ?? string.Empty).Trim();
        if (normalizedQuery.Length < 2)
        {
            return new List<GlobalSearchResultDto>();
        }

        var lowered = normalizedQuery.ToLower();
        var conversationIds = await ConversationMembersForTenant()
            .Where(member => member.UserId == userId)
            .Select(member => member.ConversationId)
            .ToListAsync();

        var results = new List<GlobalSearchResultDto>();
        var messages = await _context.ConversationMessages
            .Where(message => conversationIds.Contains(message.ConversationId) && !message.IsDeleted)
            .Where(message =>
                message.Message.ToLower().Contains(lowered) ||
                (message.AttachmentFileName != null && message.AttachmentFileName.ToLower().Contains(lowered)))
            .OrderByDescending(message => message.SentAt)
            .Take(20)
            .ToListAsync();

        results.AddRange(messages.Select(message => new GlobalSearchResultDto
        {
            Kind = string.IsNullOrWhiteSpace(message.AttachmentUrl) ? "Chat" : "Document",
            Id = message.Id,
            ConversationId = message.ConversationId,
            Title = message.AttachmentFileName ?? "Chat message",
            Snippet = BuildSearchSnippet(message.Message, normalizedQuery),
            OccurredAt = message.SentAt
        }));

        var tasks = await _context.ConversationTasks
            .Where(task => conversationIds.Contains(task.ConversationId) && !task.IsDeleted)
            .Where(task =>
                task.Title.ToLower().Contains(lowered) ||
                (task.Description != null && task.Description.ToLower().Contains(lowered)) ||
                (task.AssigneeName != null && task.AssigneeName.ToLower().Contains(lowered)))
            .OrderByDescending(task => task.UpdatedAt ?? task.CreatedAt)
            .Take(20)
            .ToListAsync();

        results.AddRange(tasks.Select(task => new GlobalSearchResultDto
        {
            Kind = "Task",
            Id = task.Id,
            ConversationId = task.ConversationId,
            Title = task.Title,
            Snippet = $"{task.Status} - {task.Priority}",
            OccurredAt = task.UpdatedAt ?? task.CreatedAt
        }));

        var meetings = await MeetingsForTenant()
            .Include(meeting => meeting.Participants)
            .Where(meeting => meeting.OrganizerId == userId || meeting.Participants.Any(participant => participant.UserId == userId))
            .Where(meeting =>
                meeting.Title.ToLower().Contains(lowered) ||
                (meeting.Description != null && meeting.Description.ToLower().Contains(lowered)) ||
                (meeting.Location != null && meeting.Location.ToLower().Contains(lowered)))
            .OrderByDescending(meeting => meeting.StartTime)
            .Take(20)
            .ToListAsync();

        results.AddRange(meetings.Select(meeting => new GlobalSearchResultDto
        {
            Kind = "Meeting",
            Id = meeting.Id,
            MeetingId = meeting.Id,
            Title = meeting.Title,
            Snippet = meeting.Status.ToString(),
            OccurredAt = meeting.StartTime
        }));

        return results
            .OrderByDescending(result => result.OccurredAt ?? DateTime.MinValue)
            .Take(40)
            .ToList();
    }

    public async Task LogAuditAsync(Guid actorId, string actorName, string action, string? details = null, Guid? meetingId = null, Guid? conversationId = null)
    {
        await AddAuditLogAsync(actorId, actorName, action, details, meetingId, conversationId);
        await _context.SaveChangesAsync();
    }

    private async Task PublishConversationMessageCreatedAsync(ConversationMessage message)
    {
        var organizationId = await _context.Conversations
            .Where(conversation => conversation.Id == message.ConversationId)
            .Select(conversation => conversation.OrganizationId)
            .FirstOrDefaultAsync();
        var recipientUserIds = await GetConversationRecipientUserIdsAsync(message.ConversationId, message.SenderId);

        await _outbox.EnqueueAsync(new ConversationMessageCreatedEvent(
            Guid.NewGuid(),
            DateTime.UtcNow,
            organizationId,
            message.ConversationId.ToString(),
            message.Id.ToString(),
            message.SenderId.ToString(),
            message.SenderName,
            message.Message,
            message.AttachmentFileName,
            message.AttachmentUrl,
            message.AttachmentContentType,
            message.AttachmentSizeBytes,
            message.ReplyToMessageId?.ToString(),
            message.ReplyToSenderName,
            message.ReplyToPreview,
            message.IsImportant,
            message.SentAt,
            recipientUserIds));
    }

    private async Task PublishConversationMessageUpdatedAsync(ConversationMessage message)
    {
        var organizationId = await _context.Conversations
            .Where(conversation => conversation.Id == message.ConversationId)
            .Select(conversation => conversation.OrganizationId)
            .FirstOrDefaultAsync();
        var recipientUserIds = await GetConversationRecipientUserIdsAsync(message.ConversationId, message.SenderId);

        await _outbox.EnqueueAsync(new ConversationMessageUpdatedEvent(
            Guid.NewGuid(),
            DateTime.UtcNow,
            organizationId,
            message.ConversationId.ToString(),
            message.Id.ToString(),
            message.SenderId.ToString(),
            message.SenderName,
            message.Message,
            message.EditedAt ?? DateTime.UtcNow,
            message.IsImportant,
            recipientUserIds));
    }

    private async Task PublishConversationReactionUpdatedAsync(Guid conversationId, Guid messageId, List<ConversationMessageReaction> reactions)
    {
        var message = await _context.ConversationMessages
            .FirstOrDefaultAsync(item => item.Id == messageId && item.ConversationId == conversationId);
        if (message == null)
        {
            return;
        }

        var organizationId = await _context.Conversations
            .Where(conversation => conversation.Id == conversationId)
            .Select(conversation => conversation.OrganizationId)
            .FirstOrDefaultAsync();
        var recipientUserIds = await GetConversationRecipientUserIdsAsync(conversationId, message.SenderId);
        recipientUserIds.Add(message.SenderId.ToString());

        await _outbox.EnqueueAsync(new ConversationMessageReactionUpdatedEvent(
            Guid.NewGuid(),
            DateTime.UtcNow,
            organizationId,
            conversationId.ToString(),
            messageId.ToString(),
            reactions.Select(reaction => new ConversationReactionEventItem(
                reaction.Id.ToString(),
                reaction.ConversationMessageId.ToString(),
                reaction.UserId.ToString(),
                reaction.UserName,
                reaction.Emoji,
                reaction.CreatedAt)).ToList(),
            recipientUserIds.Distinct(StringComparer.OrdinalIgnoreCase).ToList()));
    }

    private async Task PublishConversationTaskAssignedAsync(ConversationTask task, string assignedByName)
    {
        if (!task.AssigneeId.HasValue && string.IsNullOrWhiteSpace(task.AssigneeEmail))
        {
            return;
        }

        var organizationId = await _context.Conversations
            .Where(conversation => conversation.Id == task.ConversationId)
            .Select(conversation => conversation.OrganizationId)
            .FirstOrDefaultAsync();

        await _outbox.EnqueueAsync(new ConversationTaskAssignedEvent(
            Guid.NewGuid(),
            DateTime.UtcNow,
            organizationId,
            task.ConversationId,
            task.Id,
            task.Title,
            task.AssigneeId?.ToString(),
            task.AssigneeEmail,
            task.AssigneeName,
            assignedByName,
            task.DueDate));
    }

    private async Task<List<string>> GetConversationRecipientUserIdsAsync(Guid conversationId, Guid senderId)
    {
        return await _context.ConversationMembers
            .Where(member => member.ConversationId == conversationId && member.UserId != senderId)
            .Select(member => member.UserId.ToString())
            .Distinct()
            .ToListAsync();
    }

    private async Task<ConversationTask> LoadConversationTaskForUpdateAsync(Guid conversationId, Guid taskId, Guid userId)
    {
        if (!await CanAccessConversationAsync(conversationId, userId))
        {
            throw new InvalidOperationException("Conversation not found");
        }

        var task = await _context.ConversationTasks
            .Include(item => item.Notes)
            .Include(item => item.Activities)
            .FirstOrDefaultAsync(item => item.Id == taskId && item.ConversationId == conversationId && !item.IsDeleted);

        return task ?? throw new InvalidOperationException("Task not found");
    }

    private async Task<ConversationTask> LoadConversationTaskAsync(Guid conversationId, Guid taskId)
    {
        var task = await _context.ConversationTasks
            .Include(item => item.SourceMessage)
            .Include(item => item.Notes.OrderByDescending(note => note.CreatedAt))
            .Include(item => item.Activities.OrderByDescending(activity => activity.CreatedAt))
            .AsSplitQuery()
            .FirstOrDefaultAsync(item => item.Id == taskId && item.ConversationId == conversationId && !item.IsDeleted);

        return task ?? throw new InvalidOperationException("Task not found");
    }

    private async Task<(Guid? AssigneeId, string? AssigneeEmail, string? AssigneeName)> ResolveTaskAssigneeAsync(Guid conversationId, Guid? assigneeId, string? assigneeEmail, string? assigneeName)
    {
        if (assigneeId.HasValue)
        {
            var member = await _context.ConversationMembers
                .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserId == assigneeId.Value);

            if (member == null)
            {
                throw new InvalidOperationException("Assignee is not part of this chat");
            }

            return (member.UserId, member.UserEmail, member.UserName);
        }

        if (!string.IsNullOrWhiteSpace(assigneeEmail))
        {
            var normalizedEmail = assigneeEmail.Trim();
            var member = await _context.ConversationMembers
                .FirstOrDefaultAsync(item => item.ConversationId == conversationId && item.UserEmail.ToLower() == normalizedEmail.ToLower());

            if (member != null)
            {
                return (member.UserId, member.UserEmail, member.UserName);
            }

            return (null, normalizedEmail, string.IsNullOrWhiteSpace(assigneeName) ? normalizedEmail : assigneeName.Trim());
        }

        return (null, null, null);
    }

    private static string NormalizeTaskTitle(string? title, ConversationMessage? sourceMessage)
    {
        var resolved = string.IsNullOrWhiteSpace(title)
            ? sourceMessage == null ? string.Empty : BuildReplyPreview(sourceMessage)
            : title.Trim();

        return resolved.Length <= 240 ? resolved : $"{resolved[..237]}...";
    }

    private static DateTime? NormalizeOptionalDate(DateTime? date)
    {
        if (!date.HasValue)
        {
            return null;
        }

        return date.Value.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(date.Value, DateTimeKind.Local).ToUniversalTime()
            : date.Value.ToUniversalTime();
    }

    private static ConversationTaskActivity CreateTaskActivity(Guid taskId, Guid actorId, string actorName, string action, string? details)
    {
        return new ConversationTaskActivity
        {
            Id = Guid.NewGuid(),
            TaskId = taskId,
            ActorId = actorId,
            ActorName = actorName,
            Action = action,
            Details = details,
            CreatedAt = DateTime.UtcNow
        };
    }

    private Task AddAuditLogAsync(Guid actorId, string actorName, string action, string? details = null, Guid? meetingId = null, Guid? conversationId = null)
    {
        _context.PlatformAuditLogs.Add(new PlatformAuditLog
        {
            Id = Guid.NewGuid(),
            OrganizationId = _tenantContext.OrganizationId,
            MeetingId = meetingId,
            ConversationId = conversationId,
            ActorId = actorId,
            ActorName = actorName,
            Action = action,
            Details = details,
            CreatedAt = DateTime.UtcNow
        });

        return Task.CompletedTask;
    }

    private static bool TryParseEnum<TEnum>(string? value, out TEnum parsed) where TEnum : struct, Enum
    {
        if (!string.IsNullOrWhiteSpace(value) && Enum.TryParse(value.Trim().Replace(" ", string.Empty), true, out parsed))
        {
            return true;
        }

        parsed = default;
        return false;
    }

    private static string BuildSearchSnippet(string? value, string query)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value.Replace("\r", " ").Replace("\n", " ");
        var index = normalized.IndexOf(query, StringComparison.OrdinalIgnoreCase);
        if (index < 0)
        {
            return normalized.Length <= 180 ? normalized : $"{normalized[..177]}...";
        }

        var start = Math.Max(0, index - 60);
        var length = Math.Min(normalized.Length - start, query.Length + 120);
        var snippet = normalized.Substring(start, length);
        return $"{(start > 0 ? "..." : string.Empty)}{snippet}{(start + length < normalized.Length ? "..." : string.Empty)}";
    }

    private async Task AcceptPendingConversationInvitesAsync(Guid userId, string? userEmail, string userName)
    {
        if (string.IsNullOrWhiteSpace(userEmail))
        {
            return;
        }

        var normalizedEmail = userEmail.Trim().ToLower();
        var pendingInvites = await ConversationInvitesForTenant()
            .Where(invite => !invite.HasAccepted && invite.Email.ToLower() == normalizedEmail)
            .ToListAsync();

        if (pendingInvites.Count == 0)
        {
            return;
        }

        foreach (var invite in pendingInvites)
        {
            var isAlreadyMember = await ConversationMembersForTenant()
                .AnyAsync(member => member.ConversationId == invite.ConversationId && member.UserId == userId);

            if (!isAlreadyMember)
            {
                _context.ConversationMembers.Add(new ConversationMember
                {
                    Id = Guid.NewGuid(),
                    ConversationId = invite.ConversationId,
                    UserId = userId,
                    UserEmail = userEmail.Trim(),
                    UserName = userName,
                    JoinedAt = DateTime.UtcNow,
                    LastReadAt = DateTime.UtcNow
                });
            }

            invite.HasAccepted = true;
            invite.AcceptedAt = DateTime.UtcNow;
            _context.ConversationInvites.Update(invite);
        }

        await _context.SaveChangesAsync();
    }

    private IQueryable<Meeting> MeetingsForTenant()
    {
        var organizationId = _tenantContext.OrganizationId;
        var query = _context.Meetings.AsQueryable();
        return organizationId.HasValue
            ? query.Where(meeting => meeting.OrganizationId == organizationId.Value)
            : query.Where(meeting => meeting.OrganizationId == null);
    }

    private IQueryable<Conversation> ConversationsForTenant()
    {
        var organizationId = _tenantContext.OrganizationId;
        var query = _context.Conversations.AsQueryable();
        return organizationId.HasValue
            ? query.Where(conversation => conversation.OrganizationId == organizationId.Value)
            : query.Where(conversation => conversation.OrganizationId == null);
    }

    private IQueryable<ConversationMember> ConversationMembersForTenant()
    {
        var organizationId = _tenantContext.OrganizationId;
        var query = _context.ConversationMembers.AsQueryable();
        return organizationId.HasValue
            ? query.Where(member => member.Conversation.OrganizationId == organizationId.Value)
            : query.Where(member => member.Conversation.OrganizationId == null);
    }

    private IQueryable<Participant> ParticipantsForTenant()
    {
        var organizationId = _tenantContext.OrganizationId;
        var query = _context.Participants.AsQueryable();
        return organizationId.HasValue
            ? query.Where(participant => participant.Meeting.OrganizationId == organizationId.Value)
            : query.Where(participant => participant.Meeting.OrganizationId == null);
    }

    private IQueryable<MeetingChatMessage> MeetingChatMessagesForTenant()
    {
        var organizationId = _tenantContext.OrganizationId;
        var query = _context.MeetingChatMessages.AsQueryable();
        return organizationId.HasValue
            ? query.Where(message => message.Meeting.OrganizationId == organizationId.Value)
            : query.Where(message => message.Meeting.OrganizationId == null);
    }

    private IQueryable<MeetingCallLog> MeetingCallLogsForTenant()
    {
        var organizationId = _tenantContext.OrganizationId;
        var query = _context.MeetingCallLogs.AsQueryable();
        return organizationId.HasValue
            ? query.Where(call => call.OrganizationId == organizationId.Value)
            : query.Where(call => call.OrganizationId == null);
    }

    private IQueryable<LobbyRequest> LobbyRequestsForTenant()
    {
        var organizationId = _tenantContext.OrganizationId;
        var query = _context.LobbyRequests.AsQueryable();
        return organizationId.HasValue
            ? query.Where(lobby => lobby.Meeting.OrganizationId == organizationId.Value)
            : query.Where(lobby => lobby.Meeting.OrganizationId == null);
    }

    private IQueryable<MeetingInvite> MeetingInvitesForTenant()
    {
        var organizationId = _tenantContext.OrganizationId;
        var query = _context.MeetingInvites.AsQueryable();
        return organizationId.HasValue
            ? query.Where(invite => invite.Meeting.OrganizationId == organizationId.Value)
            : query.Where(invite => invite.Meeting.OrganizationId == null);
    }

    private IQueryable<ScheduledConversationMessage> ScheduledConversationMessagesForTenant()
    {
        var organizationId = _tenantContext.OrganizationId;
        var query = _context.ScheduledConversationMessages.AsQueryable();
        return organizationId.HasValue
            ? query.Where(message => message.Conversation.OrganizationId == organizationId.Value)
            : query.Where(message => message.Conversation.OrganizationId == null);
    }

    private IQueryable<ConversationInvite> ConversationInvitesForTenant()
    {
        var organizationId = _tenantContext.OrganizationId;
        var query = _context.ConversationInvites.AsQueryable();
        return organizationId.HasValue
            ? query.Where(invite => invite.Conversation.OrganizationId == organizationId.Value)
            : query.Where(invite => invite.Conversation.OrganizationId == null);
    }

    private bool MatchesTenant(Guid? organizationId)
    {
        return _tenantContext.OrganizationId.HasValue
            ? organizationId == _tenantContext.OrganizationId.Value
            : organizationId == null;
    }

    private string BuildMeetingLink(Guid meetingId)
    {
        return string.IsNullOrWhiteSpace(_tenantContext.OrganizationSlug)
            ? $"http://localhost:5173/personal/meeting/{meetingId}"
            : $"http://localhost:5173/org/{Uri.EscapeDataString(_tenantContext.OrganizationSlug)}/meeting/{meetingId}";
    }

    private static int ResolveDurationMinutes(DateTime startTime, DateTime? endTime, int? durationMinutes)
    {
        if (endTime.HasValue && endTime.Value > startTime)
        {
            return Math.Max(15, (int)Math.Round((endTime.Value - startTime).TotalMinutes));
        }

        return Math.Max(15, durationMinutes ?? 60);
    }

    private static string? NormalizeAttendeeEmails(IEnumerable<string>? attendeeEmails)
    {
        var emails = NormalizeEmailList(attendeeEmails);

        return emails.Count == 0 ? null : string.Join(";", emails);
    }

    private async Task QueueInviteEmailsAsync(Meeting meeting, IEnumerable<MeetingInvite> invites)
    {
        foreach (var invite in invites)
        {
            try
            {
                await _outbox.EnqueueAsync(new MeetingInviteEmailRequestedEvent(
                    Guid.NewGuid(),
                    DateTime.UtcNow,
                    meeting.OrganizationId,
                    meeting.Id,
                    invite.Id,
                    invite.Email));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to queue meeting invite email. Recipient: {Email}, Meeting: {MeetingId}", invite.Email, meeting.Id);
            }
        }
    }

    private static List<string> NormalizeEmailList(IEnumerable<string>? emails)
    {
        if (emails == null)
        {
            return new List<string>();
        }

        return emails
            .Select(email => email.Trim())
            .Where(email => !string.IsNullOrWhiteSpace(email))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string BuildReplyPreview(ConversationMessage message)
    {
        var preview = string.IsNullOrWhiteSpace(message.Message)
            ? message.AttachmentFileName ?? "Attachment"
            : message.Message.Trim();

        return preview.Length <= 160 ? preview : $"{preview[..157]}...";
    }

    private static string? NormalizeClientMessageId(string? clientMessageId)
    {
        if (string.IsNullOrWhiteSpace(clientMessageId))
        {
            return null;
        }

        var normalized = clientMessageId.Trim();
        return normalized.Length > 80 ? normalized[..80] : normalized;
    }

    private static List<string> SplitAttendeeEmails(string? attendeeEmails)
    {
        if (string.IsNullOrWhiteSpace(attendeeEmails))
        {
            return new List<string>();
        }

        return attendeeEmails
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();
    }
}
