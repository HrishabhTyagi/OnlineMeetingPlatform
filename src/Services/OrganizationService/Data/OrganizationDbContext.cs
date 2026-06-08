using Microsoft.EntityFrameworkCore;
using OrganizationService.Models;

namespace OrganizationService.Data;

public class OrganizationDbContext : DbContext
{
    public OrganizationDbContext(DbContextOptions<OrganizationDbContext> options) : base(options)
    {
    }

    public DbSet<OrganizationSettings> OrganizationSettings { get; set; } = null!;
    public DbSet<OrganizationMember> OrganizationMembers { get; set; } = null!;
    public DbSet<OrganizationAuditEvent> OrganizationAuditEvents { get; set; } = null!;
    public DbSet<OrganizationFeatureToggle> OrganizationFeatureToggles { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<OrganizationSettings>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Slug).HasMaxLength(100);
            entity.Property(e => e.PrimaryDomain).HasMaxLength(255);
            entity.Property(e => e.StorageProvider).HasConversion<string>().HasMaxLength(64);
            entity.Property(e => e.StorageRootPath).HasColumnType("text");
            entity.Property(e => e.PublicBaseUrl).HasColumnType("text");
            entity.Property(e => e.RecordingRetentionDays).HasDefaultValue(30);
            entity.Property(e => e.AttachmentRetentionDays).HasDefaultValue(30);
            entity.Property(e => e.MaxRecordingMegabytes).HasDefaultValue(750);
            entity.Property(e => e.MaxAttachmentMegabytes).HasDefaultValue(50);
            entity.Property(e => e.RequireLobbyByDefault).HasDefaultValue(true);
            entity.Property(e => e.AllowExternalGuests).HasDefaultValue(true);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(e => e.UpdatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => e.Slug).IsUnique();
        });

        modelBuilder.Entity<OrganizationMember>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Email).IsRequired().HasMaxLength(255);
            entity.Property(e => e.DisplayName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Role).HasConversion<string>().HasMaxLength(40);
            entity.Property(e => e.JoinedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(e => e.UpdatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => new { e.OrganizationId, e.UserId }).IsUnique();
            entity.HasIndex(e => new { e.OrganizationId, e.Email }).IsUnique();
            entity.HasOne(e => e.Organization)
                .WithMany()
                .HasForeignKey(e => e.OrganizationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<OrganizationAuditEvent>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.OrganizationName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.ActorEmail).HasMaxLength(255);
            entity.Property(e => e.Action).IsRequired().HasMaxLength(80);
            entity.Property(e => e.EntityType).IsRequired().HasMaxLength(80);
            entity.Property(e => e.EntityId).HasMaxLength(120);
            entity.Property(e => e.Summary).IsRequired().HasColumnType("text");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => new { e.OrganizationId, e.CreatedAt });
        });

        modelBuilder.Entity<OrganizationFeatureToggle>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FeatureKey).IsRequired().HasMaxLength(120);
            entity.Property(e => e.UpdatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.HasIndex(e => new { e.OrganizationId, e.FeatureKey }).IsUnique();
            entity.HasOne(e => e.Organization)
                .WithMany()
                .HasForeignKey(e => e.OrganizationId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
