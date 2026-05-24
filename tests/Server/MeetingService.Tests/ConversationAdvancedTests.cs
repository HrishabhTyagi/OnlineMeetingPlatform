using MeetingService.Models;
using Microsoft.EntityFrameworkCore;

namespace MeetingService.Tests;

public class ConversationAdvancedTests
{
    [Fact]
    public async Task Conversation_email_invites_are_sent_and_accepted_when_invitee_loads_chats()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var email = new RecordingEmailSender();
        var service = MeetingTestFactory.CreateService(db, email: email);
        var ownerId = Guid.NewGuid();

        var conversation = await service.CreateConversationAsync(ownerId, new CreateConversationRequest
        {
            Type = "Group",
            Title = "Customer support",
            Members = new List<ConversationMemberDto>
            {
                MeetingTestFactory.Member(ownerId, "owner@samvaad.test", "Owner")
            },
            InviteEmails = new List<string>
            {
                "guest@samvaad.test",
                "Guest@samvaad.test"
            }
        });

        Assert.Single(conversation.Invites);
        Assert.Equal(new[] { "guest@samvaad.test" }, email.ConversationInviteEmails);

        var guestId = Guid.NewGuid();
        var guestConversations = await service.GetConversationsAsync(guestId, "guest@samvaad.test", "Guest User");

        Assert.Single(guestConversations);
        Assert.Equal(conversation.Id, guestConversations[0].Id);
        Assert.Contains(guestConversations[0].Members, member => member.UserId == guestId);
        var invite = await db.ConversationInvites.SingleAsync(item => item.ConversationId == conversation.Id);
        Assert.True(invite.HasAccepted);
        Assert.NotNull(invite.AcceptedAt);
    }

    [Fact]
    public async Task Message_edit_reaction_schedule_and_document_share_flows_are_validated()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var email = new RecordingEmailSender();
        var service = MeetingTestFactory.CreateService(db, email: email);
        var ownerId = Guid.NewGuid();
        var alexId = Guid.NewGuid();
        var conversation = await CreateDirectConversationAsync(service, ownerId, alexId);
        var source = await service.AddConversationMessageAsync(conversation.Id, new SendConversationMessageRequest
        {
            SenderId = ownerId,
            SenderName = "Owner",
            Message = "Initial message"
        });

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            service.UpdateConversationMessageAsync(conversation.Id, source.Id, alexId, new UpdateConversationMessageRequest
            {
                Message = "Edited by the wrong user"
            }));

        var edited = await service.UpdateConversationMessageAsync(conversation.Id, source.Id, ownerId, new UpdateConversationMessageRequest
        {
            Message = "Initial message updated",
            IsImportant = true
        });
        Assert.True(edited.IsImportant);
        Assert.NotNull(edited.EditedAt);

        var reactions = await service.ToggleConversationMessageReactionAsync(
            conversation.Id,
            source.Id,
            alexId,
            "Alex",
            new ToggleConversationMessageReactionRequest { Emoji = "thumbs-up" });
        Assert.Single(reactions);
        reactions = await service.ToggleConversationMessageReactionAsync(
            conversation.Id,
            source.Id,
            alexId,
            "Alex",
            new ToggleConversationMessageReactionRequest { Emoji = "thumbs-up" });
        Assert.Empty(reactions);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.ScheduleConversationMessageAsync(conversation.Id, ownerId, "Owner", new ScheduleConversationMessageRequest
            {
                Message = "Too soon",
                ScheduledFor = DateTime.UtcNow
            }));

        var scheduled = await service.ScheduleConversationMessageAsync(conversation.Id, ownerId, "Owner", new ScheduleConversationMessageRequest
        {
            Message = "Send later",
            ScheduledFor = DateTime.UtcNow.AddMinutes(5)
        });
        Assert.Single(await service.GetScheduledConversationMessagesAsync(conversation.Id, ownerId));
        await service.CancelScheduledConversationMessageAsync(conversation.Id, scheduled.Id, ownerId);
        Assert.Empty(await service.GetScheduledConversationMessagesAsync(conversation.Id, ownerId));

        var attachment = await service.AddConversationMessageAsync(conversation.Id, new SendConversationMessageRequest
        {
            SenderId = ownerId,
            SenderName = "Owner",
            Message = "Sharing the report",
            AttachmentFileName = "report.pdf",
            AttachmentUrl = "/uploads/report.pdf",
            AttachmentContentType = "application/pdf",
            AttachmentSizeBytes = 2048
        });
        var shares = await service.ShareConversationDocumentAsync(conversation.Id, attachment.Id, ownerId, "Owner", new ShareConversationDocumentRequest
        {
            Emails = new List<string> { "leader@samvaad.test", "leader@samvaad.test", "audit@samvaad.test" },
            Message = "Please review"
        });

        Assert.Single(shares);
        Assert.Equal(new[] { "leader@samvaad.test", "audit@samvaad.test" }, email.DocumentShareEmails);
        Assert.Equal("leader@samvaad.test;audit@samvaad.test", shares[0].RecipientEmails);
        Assert.Single(await service.GetConversationDocumentSharesAsync(conversation.Id, ownerId, attachment.Id));
        Assert.Contains(await db.PlatformAuditLogs.ToListAsync(), item => item.Action == "Document shared via email");
    }

    [Fact]
    public async Task Global_search_returns_chat_task_document_and_meeting_results_for_accessible_user()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var ownerId = Guid.NewGuid();
        var alexId = Guid.NewGuid();
        var conversation = await CreateDirectConversationAsync(service, ownerId, alexId);
        var message = await service.AddConversationMessageAsync(conversation.Id, new SendConversationMessageRequest
        {
            SenderId = ownerId,
            SenderName = "Owner",
            Message = "Roadmap discussion notes"
        });
        await service.AddConversationMessageAsync(conversation.Id, new SendConversationMessageRequest
        {
            SenderId = ownerId,
            SenderName = "Owner",
            Message = "Attached file",
            AttachmentFileName = "roadmap.pdf",
            AttachmentUrl = "/uploads/roadmap.pdf"
        });
        await service.CreateConversationTaskAsync(conversation.Id, ownerId, "Owner", new CreateConversationTaskRequest
        {
            SourceMessageId = message.Id,
            Title = "Roadmap follow up",
            Priority = "Urgent",
            AssigneeId = alexId
        });
        var meetingRequest = MeetingTestFactory.CreateMeetingRequest(attendees: new[] { "alex@samvaad.test" });
        meetingRequest.Title = "Roadmap review";
        await service.CreateMeetingAsync(ownerId, meetingRequest);

        var results = await service.SearchAsync(ownerId, "roadmap");

        Assert.Contains(results, result => result.Kind == "Chat" && result.Title == "Chat message");
        Assert.Contains(results, result => result.Kind == "Document" && result.Title == "roadmap.pdf");
        Assert.Contains(results, result => result.Kind == "Task" && result.Title == "Roadmap follow up");
        Assert.Contains(results, result => result.Kind == "Meeting" && result.Title == "Roadmap review");
    }

    private static Task<Conversation> CreateDirectConversationAsync(MeetingService.Services.MeetingServiceImpl service, Guid ownerId, Guid alexId)
    {
        return service.CreateConversationAsync(ownerId, new CreateConversationRequest
        {
            Type = "Direct",
            Members = new List<ConversationMemberDto>
            {
                MeetingTestFactory.Member(ownerId, "owner@samvaad.test", "Owner"),
                MeetingTestFactory.Member(alexId, "alex@samvaad.test", "Alex")
            }
        });
    }
}
