using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MeetingService.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Meetings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    StartTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DurationMinutes = table.Column<int>(type: "integer", nullable: true),
                    AttendeeEmails = table.Column<string>(type: "text", nullable: true),
                    Location = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsOnlineMeeting = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    MeetingLink = table.Column<string>(type: "text", nullable: true),
                    IsRecorded = table.Column<bool>(type: "boolean", nullable: false),
                    RecordingUrl = table.Column<string>(type: "text", nullable: true),
                    MaxParticipants = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Meetings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Participants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserEmail = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    UserName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    JoinedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    LeftAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsAudioEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    IsVideoEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    IsScreenSharing = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Participants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Participants_Meetings_MeetingId",
                        column: x => x.MeetingId,
                        principalTable: "Meetings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Participants_MeetingId",
                table: "Participants",
                column: "MeetingId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Participants");

            migrationBuilder.DropTable(
                name: "Meetings");
        }
    }
}
