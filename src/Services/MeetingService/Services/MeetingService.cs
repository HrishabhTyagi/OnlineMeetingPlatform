using Microsoft.EntityFrameworkCore;
using MeetingService.Data;
using MeetingService.Models;

namespace MeetingService.Services;

public interface IMeetingService
{
    Task<Meeting> CreateMeetingAsync(Guid organizerId, CreateMeetingRequest request);
    Task<Meeting?> GetMeetingByIdAsync(Guid id);
    Task<List<Meeting>> GetMeetingsByOrganizerAsync(Guid organizerId);
    Task<List<Meeting>> GetUpcomingMeetingsAsync();
    Task<Meeting> UpdateMeetingAsync(Guid id, UpdateMeetingRequest request);
    Task DeleteMeetingAsync(Guid id);
    Task<Participant> JoinMeetingAsync(Guid meetingId, Guid userId, JoinMeetingRequest request);
    Task<bool> LeaveMeetingAsync(Guid meetingId, Guid participantId);
    Task<List<Participant>> GetMeetingParticipantsAsync(Guid meetingId);
    Task<bool> UpdateParticipantStatusAsync(Guid participantId, bool audioEnabled, bool videoEnabled, bool screenSharing);
    Task<bool> UpdateParticipantRoleAsync(Guid participantId, ParticipantRole role);
    Task<MeetingChatMessage> AddChatMessageAsync(Guid meetingId, CreateChatMessageRequest request);
    Task<List<MeetingChatMessage>> GetChatMessagesAsync(Guid meetingId, Guid? currentUserId = null);
    Task<LobbyRequest> RequestLobbyAccessAsync(Guid meetingId, Guid userId, JoinMeetingRequest request);
    Task<List<LobbyRequest>> GetLobbyRequestsAsync(Guid meetingId);
    Task<LobbyRequest> DecideLobbyRequestAsync(Guid requestId, bool admit);
    Task<Meeting> UpdateNotesAsync(Guid meetingId, string? notes);
    Task<List<MeetingInvite>> GetInvitesAsync(Guid meetingId);
    Task<List<MeetingInvite>> SendInvitesAsync(Guid meetingId, IEnumerable<string> emails);
    Task<List<Conversation>> GetConversationsAsync(Guid userId, string? userEmail, string userName);
    Task<Conversation> CreateConversationAsync(Guid creatorId, CreateConversationRequest request);
    Task<List<ConversationMessage>> GetConversationMessagesAsync(Guid conversationId, Guid userId);
    Task<ConversationMessage> AddConversationMessageAsync(Guid conversationId, SendConversationMessageRequest request);
}

public class MeetingServiceImpl : IMeetingService
{
    private readonly MeetingDbContext _context;
    private readonly IEmailSender _emailSender;
    private readonly ILogger<MeetingServiceImpl> _logger;

    public MeetingServiceImpl(MeetingDbContext context, IEmailSender emailSender, ILogger<MeetingServiceImpl> logger)
    {
        _context = context;
        _emailSender = emailSender;
        _logger = logger;
    }

    public async Task<Meeting> CreateMeetingAsync(Guid organizerId, CreateMeetingRequest request)
    {
        var durationMinutes = ResolveDurationMinutes(request.StartTime, request.EndTime, request.DurationMinutes);
        var meetingId = Guid.NewGuid();
        var meeting = new Meeting
        {
            Id = meetingId,
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
            MeetingLink = request.IsOnlineMeeting ? $"http://localhost:5173/meeting/{meetingId}" : null,
            Status = MeetingStatus.Scheduled,
            CreatedAt = DateTime.UtcNow
        };

        _context.Meetings.Add(meeting);
        var inviteEmails = SplitAttendeeEmails(meeting.AttendeeEmails);
        foreach (var email in inviteEmails)
        {
            _context.MeetingInvites.Add(new MeetingInvite
            {
                Id = Guid.NewGuid(),
                MeetingId = meeting.Id,
                Email = email,
                Role = ParticipantRole.Attendee,
                IsRequired = true,
                CreatedAt = DateTime.UtcNow
            });

            _context.MeetingReminders.Add(new MeetingReminder
            {
                Id = Guid.NewGuid(),
                MeetingId = meeting.Id,
                RecipientEmail = email,
                RemindAt = meeting.StartTime.AddMinutes(-5)
            });
        }

        await _context.SaveChangesAsync();
        await SendInviteEmailsAsync(meeting, inviteEmails);
        _logger.LogInformation("Meeting created: {MeetingId}", meeting.Id);
        return meeting;
    }

    public async Task<Meeting?> GetMeetingByIdAsync(Guid id)
    {
        return await _context.Meetings
            .Include(m => m.Participants)
            .FirstOrDefaultAsync(m => m.Id == id);
    }

    public async Task<List<Meeting>> GetMeetingsByOrganizerAsync(Guid organizerId)
    {
        return await _context.Meetings
            .Include(m => m.Participants)
            .Where(m => m.OrganizerId == organizerId)
            .OrderByDescending(m => m.CreatedAt)
            .ToListAsync();
    }

    public async Task<List<Meeting>> GetUpcomingMeetingsAsync()
    {
        return await _context.Meetings
            .Include(m => m.Participants)
            .Where(m => m.StartTime > DateTime.UtcNow && m.Status == MeetingStatus.Scheduled)
            .OrderBy(m => m.StartTime)
            .ToListAsync();
    }

    public async Task<Meeting> UpdateMeetingAsync(Guid id, UpdateMeetingRequest request)
    {
        var meeting = await _context.Meetings.FirstOrDefaultAsync(m => m.Id == id);
        if (meeting == null)
            throw new InvalidOperationException("Meeting not found");

        var durationMinutes = ResolveDurationMinutes(request.StartTime, request.EndTime, request.DurationMinutes);
        meeting.Title = request.Title;
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
        _logger.LogInformation("Meeting updated: {MeetingId}", id);
        return meeting;
    }

    public async Task DeleteMeetingAsync(Guid id)
    {
        var meeting = await _context.Meetings.FirstOrDefaultAsync(m => m.Id == id);
        if (meeting == null)
            throw new InvalidOperationException("Meeting not found");

        meeting.IsActive = false;
        _context.Meetings.Update(meeting);
        await _context.SaveChangesAsync();
        _logger.LogInformation("Meeting deleted: {MeetingId}", id);
    }

    public async Task<Participant> JoinMeetingAsync(Guid meetingId, Guid userId, JoinMeetingRequest request)
    {
        var meeting = await _context.Meetings.FirstOrDefaultAsync(m => m.Id == meetingId);
        if (meeting == null)
            throw new InvalidOperationException("Meeting not found");

        var existingParticipant = await _context.Participants.FirstOrDefaultAsync(p => p.MeetingId == meetingId && p.UserId == userId);
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

    public async Task<bool> LeaveMeetingAsync(Guid meetingId, Guid participantId)
    {
        var participant = await _context.Participants.FirstOrDefaultAsync(p => p.Id == participantId && p.MeetingId == meetingId);
        if (participant == null)
            return false;

        participant.LeftAt = DateTime.UtcNow;
        _context.Participants.Update(participant);
        await _context.SaveChangesAsync();
        _logger.LogInformation("Participant left meeting: {ParticipantId}, {MeetingId}", participantId, meetingId);
        return true;
    }

    public async Task<List<Participant>> GetMeetingParticipantsAsync(Guid meetingId)
    {
        return await _context.Participants
            .Where(p => p.MeetingId == meetingId && p.LeftAt == null)
            .ToListAsync();
    }

    public async Task<bool> UpdateParticipantStatusAsync(Guid participantId, bool audioEnabled, bool videoEnabled, bool screenSharing)
    {
        var participant = await _context.Participants.FirstOrDefaultAsync(p => p.Id == participantId);
        if (participant == null)
            return false;

        participant.IsAudioEnabled = audioEnabled;
        participant.IsVideoEnabled = videoEnabled;
        participant.IsScreenSharing = screenSharing;
        _context.Participants.Update(participant);
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> UpdateParticipantRoleAsync(Guid participantId, ParticipantRole role)
    {
        var participant = await _context.Participants.FirstOrDefaultAsync(p => p.Id == participantId);
        if (participant == null)
            return false;

        participant.Role = role;
        _context.Participants.Update(participant);
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<MeetingChatMessage> AddChatMessageAsync(Guid meetingId, CreateChatMessageRequest request)
    {
        var message = new MeetingChatMessage
        {
            Id = Guid.NewGuid(),
            MeetingId = meetingId,
            SenderId = request.SenderId,
            SenderName = request.SenderName,
            RecipientUserId = request.RecipientUserId,
            RecipientName = request.RecipientName,
            Scope = request.RecipientUserId.HasValue ? ChatScope.Direct : ChatScope.Everyone,
            Message = request.Message.Trim(),
            SentAt = DateTime.UtcNow
        };

        _context.MeetingChatMessages.Add(message);
        await _context.SaveChangesAsync();
        return message;
    }

    public async Task<List<MeetingChatMessage>> GetChatMessagesAsync(Guid meetingId, Guid? currentUserId = null)
    {
        return await _context.MeetingChatMessages
            .Where(message => message.MeetingId == meetingId && !message.IsDeleted)
            .Where(message =>
                message.Scope == ChatScope.Everyone ||
                currentUserId == null ||
                message.SenderId == currentUserId ||
                message.RecipientUserId == currentUserId)
            .OrderBy(message => message.SentAt)
            .ToListAsync();
    }

    public async Task<LobbyRequest> RequestLobbyAccessAsync(Guid meetingId, Guid userId, JoinMeetingRequest request)
    {
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
        return await _context.LobbyRequests
            .Where(lobby => lobby.MeetingId == meetingId)
            .OrderByDescending(lobby => lobby.RequestedAt)
            .ToListAsync();
    }

    public async Task<LobbyRequest> DecideLobbyRequestAsync(Guid requestId, bool admit)
    {
        var lobbyRequest = await _context.LobbyRequests.FirstOrDefaultAsync(lobby => lobby.Id == requestId);
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
        var meeting = await _context.Meetings.FirstOrDefaultAsync(m => m.Id == meetingId);
        if (meeting == null)
            throw new InvalidOperationException("Meeting not found");

        meeting.Notes = notes;
        meeting.UpdatedAt = DateTime.UtcNow;
        _context.Meetings.Update(meeting);
        await _context.SaveChangesAsync();
        return meeting;
    }

    public async Task<List<MeetingInvite>> GetInvitesAsync(Guid meetingId)
    {
        return await _context.MeetingInvites
            .Where(invite => invite.MeetingId == meetingId)
            .OrderBy(invite => invite.Email)
            .ToListAsync();
    }

    public async Task<List<MeetingInvite>> SendInvitesAsync(Guid meetingId, IEnumerable<string> emails)
    {
        var meeting = await _context.Meetings.FirstOrDefaultAsync(item => item.Id == meetingId);
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

        await _context.SaveChangesAsync();
        await SendInviteEmailsAsync(meeting, normalizedEmails);

        return existingInvites.Concat(newInvites).OrderBy(invite => invite.Email).ToList();
    }

    public async Task<List<Conversation>> GetConversationsAsync(Guid userId, string? userEmail, string userName)
    {
        await AcceptPendingConversationInvitesAsync(userId, userEmail, userName);

        return await _context.Conversations
            .Include(conversation => conversation.Members)
            .Include(conversation => conversation.Invites)
            .Include(conversation => conversation.Messages.Where(message => !message.IsDeleted).OrderByDescending(message => message.SentAt).Take(1))
            .Where(conversation => conversation.Members.Any(member => member.UserId == userId))
            .OrderByDescending(conversation => conversation.UpdatedAt ?? conversation.CreatedAt)
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
                var existing = await _context.Conversations
                    .Include(conversation => conversation.Members)
                    .Include(conversation => conversation.Invites)
                    .Include(conversation => conversation.Messages.Where(message => !message.IsDeleted).OrderByDescending(message => message.SentAt).Take(1))
                    .Where(conversation => conversation.Type == ConversationType.Direct)
                    .Where(conversation => conversation.Members.Count == 2)
                    .FirstOrDefaultAsync(conversation => memberIds.All(id => conversation.Members.Any(member => member.UserId == id)));

                if (existing != null)
                {
                    return existing;
                }
            }
        }

        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
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
                JoinedAt = DateTime.UtcNow
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
        await _context.SaveChangesAsync();

        foreach (var email in inviteEmails)
        {
            try
            {
                await _emailSender.SendConversationInviteAsync(conversation, email, creator.UserName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send chat invite email. Recipient: {Email}, Conversation: {ConversationId}", email, conversation.Id);
            }
        }

        return conversation;
    }

    public async Task<List<ConversationMessage>> GetConversationMessagesAsync(Guid conversationId, Guid userId)
    {
        var isMember = await _context.ConversationMembers
            .AnyAsync(member => member.ConversationId == conversationId && member.UserId == userId);

        if (!isMember)
        {
            throw new InvalidOperationException("Conversation not found");
        }

        return await _context.ConversationMessages
            .Where(message => message.ConversationId == conversationId && !message.IsDeleted)
            .OrderBy(message => message.SentAt)
            .ToListAsync();
    }

    public async Task<ConversationMessage> AddConversationMessageAsync(Guid conversationId, SendConversationMessageRequest request)
    {
        var isMember = await _context.ConversationMembers
            .AnyAsync(member => member.ConversationId == conversationId && member.UserId == request.SenderId);

        if (!isMember)
        {
            throw new InvalidOperationException("Conversation not found");
        }

        var message = new ConversationMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SenderId = request.SenderId,
            SenderName = request.SenderName,
            Message = request.Message.Trim(),
            SentAt = DateTime.UtcNow
        };

        _context.ConversationMessages.Add(message);
        var conversation = await _context.Conversations.FirstAsync(item => item.Id == conversationId);
        conversation.UpdatedAt = message.SentAt;
        _context.Conversations.Update(conversation);
        await _context.SaveChangesAsync();
        return message;
    }

    private async Task AcceptPendingConversationInvitesAsync(Guid userId, string? userEmail, string userName)
    {
        if (string.IsNullOrWhiteSpace(userEmail))
        {
            return;
        }

        var normalizedEmail = userEmail.Trim().ToLower();
        var pendingInvites = await _context.ConversationInvites
            .Where(invite => !invite.HasAccepted && invite.Email.ToLower() == normalizedEmail)
            .ToListAsync();

        if (pendingInvites.Count == 0)
        {
            return;
        }

        foreach (var invite in pendingInvites)
        {
            var isAlreadyMember = await _context.ConversationMembers
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
                    JoinedAt = DateTime.UtcNow
                });
            }

            invite.HasAccepted = true;
            invite.AcceptedAt = DateTime.UtcNow;
            _context.ConversationInvites.Update(invite);
        }

        await _context.SaveChangesAsync();
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

    private async Task SendInviteEmailsAsync(Meeting meeting, IEnumerable<string> emails)
    {
        foreach (var email in NormalizeEmailList(emails))
        {
            try
            {
                await _emailSender.SendMeetingInviteAsync(meeting, email);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send meeting invite email. Recipient: {Email}, Meeting: {MeetingId}", email, meeting.Id);
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
