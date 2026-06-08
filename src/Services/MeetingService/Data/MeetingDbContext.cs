using Microsoft.EntityFrameworkCore;
using MeetingService.Models;

namespace MeetingService.Data;

public class MeetingDbContext : DbContext
{
    public MeetingDbContext(DbContextOptions<MeetingDbContext> options) : base(options)
    {
    }

    public DbSet<Meeting> Meetings { get; set; } = null!;
    public DbSet<Participant> Participants { get; set; } = null!;
    public DbSet<MeetingChatMessage> MeetingChatMessages { get; set; } = null!;
    public DbSet<MeetingInvite> MeetingInvites { get; set; } = null!;
    public DbSet<LobbyRequest> LobbyRequests { get; set; } = null!;
    public DbSet<MeetingReminder> MeetingReminders { get; set; } = null!;
    public DbSet<MeetingCallLog> MeetingCallLogs { get; set; } = null!;
    public DbSet<Conversation> Conversations { get; set; } = null!;
    public DbSet<ConversationMember> ConversationMembers { get; set; } = null!;
    public DbSet<ConversationMessage> ConversationMessages { get; set; } = null!;
    public DbSet<ConversationMessageReaction> ConversationMessageReactions { get; set; } = null!;
    public DbSet<ConversationTask> ConversationTasks { get; set; } = null!;
    public DbSet<ConversationTaskNote> ConversationTaskNotes { get; set; } = null!;
    public DbSet<ConversationTaskActivity> ConversationTaskActivities { get; set; } = null!;
    public DbSet<ConversationDocumentShare> ConversationDocumentShares { get; set; } = null!;
    public DbSet<PlatformAuditLog> PlatformAuditLogs { get; set; } = null!;
    public DbSet<IntegrationEventOutboxMessage> IntegrationEventOutboxMessages { get; set; } = null!;
    public DbSet<IntegrationEventConsumerCheckpoint> IntegrationEventConsumerCheckpoints { get; set; } = null!;
    public DbSet<ConversationInvite> ConversationInvites { get; set; } = null!;
    public DbSet<ScheduledConversationMessage> ScheduledConversationMessages { get; set; } = null!;
    public DbSet<TeamSpace> TeamSpaces { get; set; } = null!;
    public DbSet<TeamSpaceMember> TeamSpaceMembers { get; set; } = null!;
    public DbSet<TeamChannel> TeamChannels { get; set; } = null!;
    public DbSet<TeamChannelTab> TeamChannelTabs { get; set; } = null!;
    public DbSet<CalendarConnection> CalendarConnections { get; set; } = null!;
    public DbSet<ExternalCalendarEvent> ExternalCalendarEvents { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Meeting>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.OrganizationId);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(255);
            entity.Property(e => e.AttendeeEmails).HasColumnType("text");
            entity.Property(e => e.Location).HasMaxLength(255);
            entity.HasIndex(e => e.TeamChannelId);
            entity.Property(e => e.IsOnlineMeeting).HasDefaultValue(true);
            entity.Property(e => e.LobbyEnabled).HasDefaultValue(true);
            entity.Property(e => e.AllowChat).HasDefaultValue(true);
            entity.Property(e => e.AllowReactions).HasDefaultValue(true);
            entity.Property(e => e.AllowScreenShare).HasDefaultValue(true);
            entity.Property(e => e.AllowAttendeeUnmute).HasDefaultValue(true);
            entity.Property(e => e.Notes).HasColumnType("text");
            entity.Property(e => e.Recap).HasColumnType("text");
            entity.Property(e => e.WhiteboardData).HasColumnType("text");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasMany(e => e.Participants).WithOne(p => p.Meeting).HasForeignKey(p => p.MeetingId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.ChatMessages).WithOne(c => c.Meeting).HasForeignKey(c => c.MeetingId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.Invites).WithOne(i => i.Meeting).HasForeignKey(i => i.MeetingId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.LobbyRequests).WithOne(l => l.Meeting).HasForeignKey(l => l.MeetingId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.Reminders).WithOne(r => r.Meeting).HasForeignKey(r => r.MeetingId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.CallLogs).WithOne(call => call.Meeting).HasForeignKey(call => call.MeetingId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.TeamChannel).WithMany(channel => channel.Meetings).HasForeignKey(e => e.TeamChannelId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Participant>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.UserEmail).IsRequired().HasMaxLength(255);
            entity.Property(e => e.UserName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.JoinedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
        });

        modelBuilder.Entity<MeetingChatMessage>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.SenderName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.RecipientName).HasMaxLength(255);
            entity.Property(e => e.Message).IsRequired().HasColumnType("text");
            entity.Property(e => e.AttachmentFileName).HasMaxLength(255);
            entity.Property(e => e.AttachmentUrl).HasMaxLength(1024);
            entity.Property(e => e.AttachmentContentType).HasMaxLength(255);
            entity.Property(e => e.SentAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
        });

        modelBuilder.Entity<MeetingInvite>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Email).IsRequired().HasMaxLength(255);
            entity.Property(e => e.DisplayName).HasMaxLength(255);
            entity.Property(e => e.ResponseReason).HasMaxLength(500);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
        });

        modelBuilder.Entity<LobbyRequest>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.UserEmail).IsRequired().HasMaxLength(255);
            entity.Property(e => e.UserName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.RequestedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
        });

        modelBuilder.Entity<MeetingReminder>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.RecipientEmail).IsRequired().HasMaxLength(255);
        });

        modelBuilder.Entity<MeetingCallLog>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.OrganizationId);
            entity.HasIndex(e => e.MeetingId);
            entity.HasIndex(e => new { e.MeetingId, e.CallerUserId });
            entity.HasIndex(e => new { e.MeetingId, e.RecipientUserId });
            entity.Property(e => e.ConversationId).HasMaxLength(120);
            entity.Property(e => e.CallerName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.RecipientEmail).IsRequired().HasMaxLength(255);
            entity.Property(e => e.RecipientName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.CallType).IsRequired().HasMaxLength(20);
            entity.Property(e => e.JoinUrl).HasColumnType("text");
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(e => e.StatusReason).HasMaxLength(500);
            entity.Property(e => e.CancellationMessage).HasColumnType("text");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
        });

        modelBuilder.Entity<Conversation>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.OrganizationId);
            entity.Property(e => e.Title).HasMaxLength(255);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasMany(e => e.Members).WithOne(m => m.Conversation).HasForeignKey(m => m.ConversationId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.Messages).WithOne(m => m.Conversation).HasForeignKey(m => m.ConversationId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.Invites).WithOne(i => i.Conversation).HasForeignKey(i => i.ConversationId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.ScheduledMessages).WithOne(s => s.Conversation).HasForeignKey(s => s.ConversationId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.Tasks).WithOne(task => task.Conversation).HasForeignKey(task => task.ConversationId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.DocumentShares).WithOne(share => share.Conversation).HasForeignKey(share => share.ConversationId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ConversationMember>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.UserEmail).IsRequired().HasMaxLength(255);
            entity.Property(e => e.UserName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.JoinedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => new { e.ConversationId, e.UserId }).IsUnique();
        });

        modelBuilder.Entity<ConversationMessage>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.SenderName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.ClientMessageId).HasMaxLength(80);
            entity.Property(e => e.Message).IsRequired().HasColumnType("text");
            entity.Property(e => e.AttachmentFileName).HasMaxLength(260);
            entity.Property(e => e.AttachmentUrl).HasColumnType("text");
            entity.Property(e => e.AttachmentContentType).HasMaxLength(255);
            entity.Property(e => e.ReplyToSenderName).HasMaxLength(255);
            entity.Property(e => e.ReplyToPreview).HasColumnType("text");
            entity.Property(e => e.SentAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(e => e.IsPinned).HasDefaultValue(false);
            entity.Property(e => e.IsImportant).HasDefaultValue(false);
            entity.HasIndex(e => e.ReplyToMessageId);
            entity.HasIndex(e => new { e.ConversationId, e.SenderId, e.ClientMessageId })
                .IsUnique()
                .HasFilter("\"ClientMessageId\" IS NOT NULL");
            entity.HasMany(e => e.Reactions).WithOne(r => r.Message).HasForeignKey(r => r.ConversationMessageId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.Tasks).WithOne(task => task.SourceMessage).HasForeignKey(task => task.SourceMessageId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ConversationMessageReaction>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.UserName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Emoji).IsRequired().HasMaxLength(32);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => new { e.ConversationMessageId, e.UserId, e.Emoji }).IsUnique();
        });

        modelBuilder.Entity<ConversationTask>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(240);
            entity.Property(e => e.Description).HasColumnType("text");
            entity.Property(e => e.Priority).HasConversion<string>().HasMaxLength(32);
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(e => e.OwnerName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.AssigneeEmail).HasMaxLength(255);
            entity.Property(e => e.AssigneeName).HasMaxLength(255);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(e => e.IsDeleted).HasDefaultValue(false);
            entity.HasIndex(e => e.ConversationId);
            entity.HasIndex(e => e.SourceMessageId);
            entity.HasIndex(e => new { e.ConversationId, e.Status });
            entity.HasIndex(e => new { e.ConversationId, e.AssigneeId });
            entity.HasMany(e => e.Notes).WithOne(note => note.Task).HasForeignKey(note => note.TaskId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.Activities).WithOne(activity => activity.Task).HasForeignKey(activity => activity.TaskId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ConversationTaskNote>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.AuthorName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Note).IsRequired().HasColumnType("text");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => e.TaskId);
        });

        modelBuilder.Entity<ConversationTaskActivity>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ActorName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Action).IsRequired().HasMaxLength(80);
            entity.Property(e => e.Details).HasColumnType("text");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => e.TaskId);
        });

        modelBuilder.Entity<ConversationDocumentShare>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.SharedByName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.RecipientEmails).IsRequired().HasColumnType("text");
            entity.Property(e => e.OptionalMessage).HasColumnType("text");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => e.ConversationId);
            entity.HasIndex(e => e.MessageId);
            entity.HasOne(e => e.Message).WithMany().HasForeignKey(e => e.MessageId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PlatformAuditLog>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ActorName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Action).IsRequired().HasMaxLength(120);
            entity.Property(e => e.Details).HasColumnType("text");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => e.OrganizationId);
            entity.HasIndex(e => e.MeetingId);
            entity.HasIndex(e => e.ConversationId);
            entity.HasOne(e => e.Meeting).WithMany().HasForeignKey(e => e.MeetingId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(e => e.Conversation).WithMany().HasForeignKey(e => e.ConversationId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<IntegrationEventOutboxMessage>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EventName).IsRequired().HasMaxLength(160);
            entity.Property(e => e.EventType).IsRequired().HasMaxLength(600);
            entity.Property(e => e.ExchangeName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.RoutingKey).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Payload).IsRequired().HasColumnType("text");
            entity.Property(e => e.LockId).HasMaxLength(64);
            entity.Property(e => e.LastError).HasColumnType("text");
            entity.Property(e => e.CreatedAtUtc).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(e => e.AvailableAtUtc).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => e.EventId).IsUnique();
            entity.HasIndex(e => new { e.ProcessedAtUtc, e.FailedAtUtc, e.AvailableAtUtc });
            entity.HasIndex(e => e.LockedUntilUtc);
        });

        modelBuilder.Entity<IntegrationEventConsumerCheckpoint>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EventName).IsRequired().HasMaxLength(160);
            entity.Property(e => e.HandlerName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.LastError).HasColumnType("text");
            entity.Property(e => e.FirstSeenAtUtc).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(e => e.LastAttemptAtUtc).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => new { e.EventId, e.HandlerName }).IsUnique();
            entity.HasIndex(e => e.ProcessedAtUtc);
        });

        modelBuilder.Entity<ScheduledConversationMessage>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.SenderName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Message).IsRequired().HasColumnType("text");
            entity.Property(e => e.Status).IsRequired().HasMaxLength(32);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => new { e.ConversationId, e.SenderId, e.Status, e.ScheduledFor });
        });

        modelBuilder.Entity<ConversationInvite>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Email).IsRequired().HasMaxLength(255);
            entity.Property(e => e.InvitedByName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => new { e.ConversationId, e.Email }).IsUnique();
        });

        modelBuilder.Entity<TeamSpace>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.OrganizationId);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(160);
            entity.Property(e => e.Description).HasMaxLength(600);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasMany(e => e.Members).WithOne(member => member.TeamSpace).HasForeignKey(member => member.TeamSpaceId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.Channels).WithOne(channel => channel.TeamSpace).HasForeignKey(channel => channel.TeamSpaceId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<TeamSpaceMember>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.UserEmail).IsRequired().HasMaxLength(255);
            entity.Property(e => e.UserName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Role).HasConversion<string>().HasMaxLength(40);
            entity.Property(e => e.JoinedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => new { e.TeamSpaceId, e.UserId }).IsUnique();
        });

        modelBuilder.Entity<TeamChannel>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(120);
            entity.Property(e => e.Description).HasMaxLength(400);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => new { e.TeamSpaceId, e.Name }).IsUnique();
            entity.HasOne(e => e.Conversation).WithMany().HasForeignKey(e => e.ConversationId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.Tabs).WithOne(tab => tab.TeamChannel).HasForeignKey(tab => tab.TeamChannelId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<TeamChannelTab>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(120);
            entity.Property(e => e.Kind).HasConversion<string>().HasMaxLength(40);
            entity.Property(e => e.Url).HasColumnType("text");
            entity.Property(e => e.Content).HasColumnType("text");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => new { e.TeamChannelId, e.SortOrder });
        });

        modelBuilder.Entity<CalendarConnection>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Provider).HasConversion<string>().HasMaxLength(40);
            entity.Property(e => e.AccountEmail).HasMaxLength(255);
            entity.Property(e => e.CalendarId).IsRequired().HasMaxLength(255);
            entity.Property(e => e.AccessToken).IsRequired().HasColumnType("text");
            entity.Property(e => e.RefreshToken).HasColumnType("text");
            entity.Property(e => e.LastError).HasColumnType("text");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(e => e.UpdatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => new { e.UserId, e.Provider }).IsUnique();
        });

        modelBuilder.Entity<ExternalCalendarEvent>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Provider).HasConversion<string>().HasMaxLength(40);
            entity.Property(e => e.CalendarId).IsRequired().HasMaxLength(255);
            entity.Property(e => e.ExternalEventId).IsRequired().HasMaxLength(255);
            entity.Property(e => e.HtmlLink).HasColumnType("text");
            entity.Property(e => e.LastError).HasColumnType("text");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(e => e.UpdatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => new { e.MeetingId, e.UserId, e.Provider }).IsUnique();
            entity.HasOne(e => e.Meeting).WithMany().HasForeignKey(e => e.MeetingId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
