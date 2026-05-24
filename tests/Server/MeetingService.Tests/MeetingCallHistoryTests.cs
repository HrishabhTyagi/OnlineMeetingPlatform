using MeetingService.Models;
using Microsoft.EntityFrameworkCore;

namespace MeetingService.Tests;

public class MeetingCallHistoryTests
{
    [Fact]
    public async Task CreateMeetingCallLogAsync_persists_ringing_call_and_marks_caller_seen()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var callerId = Guid.NewGuid();
        var recipientId = Guid.NewGuid();
        var meeting = await service.CreateMeetingAsync(callerId, MeetingTestFactory.CreateMeetingRequest());

        var call = await service.CreateMeetingCallLogAsync(meeting.Id, callerId, "Asha", new CreateMeetingCallLogRequest
        {
            ConversationId = "chat-1",
            RecipientUserId = recipientId,
            RecipientEmail = "alex@samvaad.test",
            RecipientName = "Alex",
            CallType = "video",
            JoinUrl = "http://localhost:5173/meeting/1"
        });

        Assert.Equal(MeetingCallStatus.Ringing, call.Status);
        Assert.Equal("chat-1", call.ConversationId);
        Assert.NotNull(call.CallerSeenAt);
        Assert.Null(call.RecipientSeenAt);
    }

    [Fact]
    public async Task CreateMeetingCallLogAsync_rejects_self_call_closed_meeting_and_already_joined_recipient()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var callerId = Guid.NewGuid();
        var meeting = await service.CreateMeetingAsync(callerId, MeetingTestFactory.CreateMeetingRequest());

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CreateMeetingCallLogAsync(meeting.Id, callerId, "Asha", new CreateMeetingCallLogRequest
            {
                RecipientUserId = callerId,
                RecipientEmail = "asha@samvaad.test"
            }));

        var recipientId = Guid.NewGuid();
        await service.JoinMeetingAsync(meeting.Id, recipientId, new JoinMeetingRequest
        {
            UserEmail = "alex@samvaad.test",
            UserName = "Alex"
        });

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CreateMeetingCallLogAsync(meeting.Id, callerId, "Asha", new CreateMeetingCallLogRequest
            {
                RecipientUserId = recipientId,
                RecipientEmail = "alex@samvaad.test"
            }));

        meeting.Status = MeetingStatus.Completed;
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CreateMeetingCallLogAsync(meeting.Id, callerId, "Asha", new CreateMeetingCallLogRequest
            {
                RecipientUserId = Guid.NewGuid(),
                RecipientEmail = "new@samvaad.test"
            }));
    }

    [Fact]
    public async Task UpdateMeetingCallLogStatusAsync_enforces_actor_rules_and_keeps_terminal_status()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var callerId = Guid.NewGuid();
        var recipientId = Guid.NewGuid();
        var meeting = await service.CreateMeetingAsync(callerId, MeetingTestFactory.CreateMeetingRequest());
        var call = await service.CreateMeetingCallLogAsync(meeting.Id, callerId, "Asha", new CreateMeetingCallLogRequest
        {
            RecipientUserId = recipientId,
            RecipientEmail = "alex@samvaad.test",
            RecipientName = "Alex"
        });

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            service.UpdateMeetingCallLogStatusAsync(meeting.Id, call.Id, callerId, new UpdateMeetingCallLogRequest { Status = "Accepted" }));

        var accepted = await service.UpdateMeetingCallLogStatusAsync(meeting.Id, call.Id, recipientId, new UpdateMeetingCallLogRequest
        {
            Status = "Accepted",
            Reason = "Joining now"
        });

        Assert.Equal(MeetingCallStatus.Accepted, accepted.Status);
        Assert.Equal("Joining now", accepted.StatusReason);

        var stillAccepted = await service.UpdateMeetingCallLogStatusAsync(meeting.Id, call.Id, callerId, new UpdateMeetingCallLogRequest
        {
            Status = "Failed",
            Reason = "Late failure"
        });
        Assert.Equal(MeetingCallStatus.Failed, stillAccepted.Status);
    }

    [Fact]
    public async Task Recent_call_history_filters_missed_seen_and_hidden_records_for_each_side()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var callerId = Guid.NewGuid();
        var recipientId = Guid.NewGuid();
        var meeting = await service.CreateMeetingAsync(callerId, MeetingTestFactory.CreateMeetingRequest());
        var call = await service.CreateMeetingCallLogAsync(meeting.Id, callerId, "Asha", new CreateMeetingCallLogRequest
        {
            ConversationId = "chat-1",
            RecipientUserId = recipientId,
            RecipientEmail = "alex@samvaad.test",
            RecipientName = "Alex"
        });

        await service.UpdateMeetingCallLogStatusAsync(meeting.Id, call.Id, callerId, new UpdateMeetingCallLogRequest
        {
            Status = "NoResponse",
            Reason = "No response"
        });

        var missed = await service.GetRecentMeetingCallLogsAsync(recipientId, "Missed");
        Assert.Single(missed);
        Assert.Equal(call.Id, missed[0].Id);

        await service.MarkMeetingCallLogSeenAsync(call.Id, recipientId);
        Assert.NotNull((await db.MeetingCallLogs.FindAsync(call.Id))!.RecipientSeenAt);

        await service.HideMeetingCallLogAsync(call.Id, recipientId);
        Assert.Empty(await service.GetRecentMeetingCallLogsAsync(recipientId, "All"));
        Assert.Single(await service.GetRecentMeetingCallLogsAsync(callerId, "All"));

        await service.ClearMeetingCallLogsAsync(callerId, "All");
        Assert.Empty(await service.GetRecentMeetingCallLogsAsync(callerId, "All"));
    }
}
