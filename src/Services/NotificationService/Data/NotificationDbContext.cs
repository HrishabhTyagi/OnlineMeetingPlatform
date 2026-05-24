using Microsoft.EntityFrameworkCore;
using NotificationService.Models;

namespace NotificationService.Data;

public class NotificationDbContext : DbContext
{
    public NotificationDbContext(DbContextOptions<NotificationDbContext> options) : base(options)
    {
    }

    public DbSet<ProcessedNotificationEvent> ProcessedNotificationEvents { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<ProcessedNotificationEvent>(entity =>
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
    }
}
