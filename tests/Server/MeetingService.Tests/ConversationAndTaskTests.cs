using MeetingService.Models;
using Microsoft.EntityFrameworkCore;

namespace MeetingService.Tests;

public class ConversationAndTaskTests
{
    [Fact]
    public async Task CreateConversationAsync_requires_creator_and_reuses_direct_conversation()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var ashaId = Guid.NewGuid();
        var alexId = Guid.NewGuid();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CreateConversationAsync(ashaId, new CreateConversationRequest
            {
                Type = "Direct",
                Members = new List<ConversationMemberDto>
                {
                    MeetingTestFactory.Member(alexId, "alex@samvaad.test", "Alex")
                }
            }));

        var request = new CreateConversationRequest
        {
            Type = "Direct",
            Members = new List<ConversationMemberDto>
            {
                MeetingTestFactory.Member(ashaId, "asha@samvaad.test", "Asha"),
                MeetingTestFactory.Member(alexId, "alex@samvaad.test", "Alex")
            }
        };

        var first = await service.CreateConversationAsync(ashaId, request);
        var second = await service.CreateConversationAsync(alexId, new CreateConversationRequest
        {
            Type = "Direct",
            Members = request.Members
        });

        Assert.Equal(first.Id, second.Id);
        Assert.Equal(2, await db.ConversationMembers.CountAsync(item => item.ConversationId == first.Id));
    }

    [Fact]
    public async Task AddConversationMessageAsync_preserves_formatting_is_idempotent_and_requires_message_or_attachment()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var ashaId = Guid.NewGuid();
        var alexId = Guid.NewGuid();
        var conversation = await service.CreateConversationAsync(ashaId, new CreateConversationRequest
        {
            Type = "Direct",
            Members = new List<ConversationMemberDto>
            {
                MeetingTestFactory.Member(ashaId, "asha@samvaad.test", "Asha"),
                MeetingTestFactory.Member(alexId, "alex@samvaad.test", "Alex")
            }
        });

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.AddConversationMessageAsync(conversation.Id, new SendConversationMessageRequest
            {
                SenderId = ashaId,
                SenderName = "Asha",
                Message = "   "
            }));

        var message = await service.AddConversationMessageAsync(conversation.Id, new SendConversationMessageRequest
        {
            SenderId = ashaId,
            SenderName = "Asha",
            ClientMessageId = "client-1",
            Message = "#include <stdio.h>\nint main() {\n  return 0;\n}\n",
            IsImportant = true
        });
        var duplicate = await service.AddConversationMessageAsync(conversation.Id, new SendConversationMessageRequest
        {
            SenderId = ashaId,
            SenderName = "Asha",
            ClientMessageId = "client-1",
            Message = "changed"
        });

        Assert.Equal(message.Id, duplicate.Id);
        Assert.Equal("#include <stdio.h>\nint main() {\n  return 0;\n}", message.Message);
        Assert.True(message.IsImportant);
    }

    [Fact]
    public async Task Pinned_deleted_and_unread_message_flows_stay_consistent()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var ashaId = Guid.NewGuid();
        var alexId = Guid.NewGuid();
        var conversation = await service.CreateConversationAsync(ashaId, new CreateConversationRequest
        {
            Type = "Direct",
            Members = new List<ConversationMemberDto>
            {
                MeetingTestFactory.Member(ashaId, "asha@samvaad.test", "Asha"),
                MeetingTestFactory.Member(alexId, "alex@samvaad.test", "Alex")
            }
        });
        var message = await service.AddConversationMessageAsync(conversation.Id, new SendConversationMessageRequest
        {
            SenderId = ashaId,
            SenderName = "Asha",
            Message = "Please review this."
        });

        var pinned = await service.ToggleConversationMessagePinAsync(conversation.Id, message.Id, alexId);
        Assert.True(pinned.IsPinned);

        await service.MarkConversationUnreadAsync(conversation.Id, message.Id, alexId);
        var alexMember = await db.ConversationMembers.SingleAsync(item => item.ConversationId == conversation.Id && item.UserId == alexId);
        Assert.True(alexMember.LastReadAt < message.SentAt);

        await service.DeleteConversationMessageAsync(conversation.Id, message.Id, ashaId);
        var messages = await service.GetConversationMessagesAsync(conversation.Id, alexId);
        Assert.DoesNotContain(messages, item => item.Id == message.Id);
    }

    [Fact]
    public async Task Tasks_can_be_created_from_comments_updated_noted_filtered_and_deleted()
    {
        await using var db = MeetingTestFactory.CreateDbContext();
        var service = MeetingTestFactory.CreateService(db);
        var ownerId = Guid.NewGuid();
        var assigneeId = Guid.NewGuid();
        var conversation = await service.CreateConversationAsync(ownerId, new CreateConversationRequest
        {
            Type = "Direct",
            Members = new List<ConversationMemberDto>
            {
                MeetingTestFactory.Member(ownerId, "owner@samvaad.test", "Owner"),
                MeetingTestFactory.Member(assigneeId, "alex@samvaad.test", "Alex")
            }
        });
        var source = await service.AddConversationMessageAsync(conversation.Id, new SendConversationMessageRequest
        {
            SenderId = ownerId,
            SenderName = "Owner",
            Message = "Follow up with customer"
        });

        var task = await service.CreateConversationTaskAsync(conversation.Id, ownerId, "Owner", new CreateConversationTaskRequest
        {
            SourceMessageId = source.Id,
            Title = "",
            Priority = "High",
            AssigneeId = assigneeId,
            DueDate = DateTime.UtcNow.AddDays(1)
        });
        Assert.Equal(source.Id, task.SourceMessageId);
        Assert.Equal("Follow up with customer", task.Title);
        Assert.Equal(ConversationTaskPriority.High, task.Priority);

        task = await service.UpdateConversationTaskAsync(conversation.Id, task.Id, ownerId, "Owner", new UpdateConversationTaskRequest
        {
            Status = "Completed",
            Description = "Done during standup"
        });
        Assert.Equal(ConversationTaskStatus.Completed, task.Status);
        Assert.NotNull(task.CompletedAt);

        await service.AddConversationTaskNoteAsync(conversation.Id, task.Id, assigneeId, "Alex", new AddConversationTaskNoteRequest
        {
            Note = "Customer confirmed."
        });
        var completed = await service.GetConversationTasksAsync(conversation.Id, ownerId, status: "Completed", priority: "High");
        Assert.Single(completed);
        Assert.NotEmpty(completed[0].Notes);

        await service.DeleteConversationTaskAsync(conversation.Id, task.Id, ownerId, "Owner");
        Assert.Empty(await service.GetConversationTasksAsync(conversation.Id, ownerId));
    }
}
