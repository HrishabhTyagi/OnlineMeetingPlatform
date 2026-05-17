using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using OrganizationService.Data;

#nullable disable

namespace OrganizationService.Data.Migrations
{
    [DbContext(typeof(OrganizationDbContext))]
    [Migration("20260516093000_InitialOrganizationSettings")]
    public partial class InitialOrganizationSettings : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OrganizationSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PrimaryDomain = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    StorageProvider = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    StorageRootPath = table.Column<string>(type: "text", nullable: true),
                    PublicBaseUrl = table.Column<string>(type: "text", nullable: true),
                    RecordingRetentionDays = table.Column<int>(type: "integer", nullable: false, defaultValue: 30),
                    AttachmentRetentionDays = table.Column<int>(type: "integer", nullable: false, defaultValue: 30),
                    MaxRecordingMegabytes = table.Column<int>(type: "integer", nullable: false, defaultValue: 750),
                    MaxAttachmentMegabytes = table.Column<int>(type: "integer", nullable: false, defaultValue: 50),
                    EnableRecordingByDefault = table.Column<bool>(type: "boolean", nullable: false),
                    RequireLobbyByDefault = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    AllowExternalGuests = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrganizationSettings", x => x.Id);
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrganizationSettings");
        }
    }
}
