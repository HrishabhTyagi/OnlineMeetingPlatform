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
    public DbSet<Conversation> Conversations { get; set; } = null!;
    public DbSet<ConversationMember> ConversationMembers { get; set; } = null!;
    public DbSet<ConversationMessage> ConversationMessages { get; set; } = null!;
    public DbSet<ConversationMessageReaction> ConversationMessageReactions { get; set; } = null!;
    public DbSet<ConversationInvite> ConversationInvites { get; set; } = null!;
    public DbSet<ScheduledConversationMessage> ScheduledConversationMessages { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Meeting>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(255);
            entity.Property(e => e.AttendeeEmails).HasColumnType("text");
            entity.Property(e => e.Location).HasMaxLength(255);
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
            entity.Property(e => e.SentAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
        });

        modelBuilder.Entity<MeetingInvite>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Email).IsRequired().HasMaxLength(255);
            entity.Property(e => e.DisplayName).HasMaxLength(255);
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

        modelBuilder.Entity<Conversation>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).HasMaxLength(255);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasMany(e => e.Members).WithOne(m => m.Conversation).HasForeignKey(m => m.ConversationId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.Messages).WithOne(m => m.Conversation).HasForeignKey(m => m.ConversationId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.Invites).WithOne(i => i.Conversation).HasForeignKey(i => i.ConversationId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.ScheduledMessages).WithOne(s => s.Conversation).HasForeignKey(s => s.ConversationId).OnDelete(DeleteBehavior.Cascade);
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
            entity.Property(e => e.Message).IsRequired().HasColumnType("text");
            entity.Property(e => e.AttachmentFileName).HasMaxLength(260);
            entity.Property(e => e.AttachmentUrl).HasColumnType("text");
            entity.Property(e => e.AttachmentContentType).HasMaxLength(255);
            entity.Property(e => e.ReplyToSenderName).HasMaxLength(255);
            entity.Property(e => e.ReplyToPreview).HasColumnType("text");
            entity.Property(e => e.SentAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(e => e.IsPinned).HasDefaultValue(false);
            entity.HasIndex(e => e.ReplyToMessageId);
            entity.HasMany(e => e.Reactions).WithOne(r => r.Message).HasForeignKey(r => r.ConversationMessageId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ConversationMessageReaction>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.UserName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Emoji).IsRequired().HasMaxLength(32);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => new { e.ConversationMessageId, e.UserId, e.Emoji }).IsUnique();
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
    }
}
