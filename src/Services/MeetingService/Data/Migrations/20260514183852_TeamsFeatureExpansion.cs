using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MeetingService.Data.Migrations
{
    /// <inheritdoc />
    public partial class TeamsFeatureExpansion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsAdmitted",
                table: "Participants",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsHandRaised",
                table: "Participants",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Reaction",
                table: "Participants",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Role",
                table: "Participants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "AllowAttendeeUnmute",
                table: "Meetings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "AllowChat",
                table: "Meetings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "AllowReactions",
                table: "Meetings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "AllowRecording",
                table: "Meetings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "AllowScreenShare",
                table: "Meetings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "AllowTranscription",
                table: "Meetings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "LobbyEnabled",
                table: "Meetings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "Meetings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Recap",
                table: "Meetings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RecurrenceRule",
                table: "Meetings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WhiteboardData",
                table: "Meetings",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "LobbyRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserEmail = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    UserName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    DecidedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LobbyRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LobbyRequests_Meetings_MeetingId",
                        column: x => x.MeetingId,
                        principalTable: "Meetings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MeetingChatMessages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uuid", nullable: false),
                    SenderId = table.Column<Guid>(type: "uuid", nullable: false),
                    SenderName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    RecipientUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    RecipientName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Scope = table.Column<int>(type: "integer", nullable: false),
                    Message = table.Column<string>(type: "text", nullable: false),
                    SentAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MeetingChatMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MeetingChatMessages_Meetings_MeetingId",
                        column: x => x.MeetingId,
                        principalTable: "Meetings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MeetingInvites",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Role = table.Column<int>(type: "integer", nullable: false),
                    IsRequired = table.Column<bool>(type: "boolean", nullable: false),
                    HasAccepted = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MeetingInvites", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MeetingInvites_Meetings_MeetingId",
                        column: x => x.MeetingId,
                        principalTable: "Meetings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MeetingReminders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientEmail = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    RemindAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsSent = table.Column<bool>(type: "boolean", nullable: false),
                    SentAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MeetingReminders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MeetingReminders_Meetings_MeetingId",
                        column: x => x.MeetingId,
                        principalTable: "Meetings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LobbyRequests_MeetingId",
                table: "LobbyRequests",
                column: "MeetingId");

            migrationBuilder.CreateIndex(
                name: "IX_MeetingChatMessages_MeetingId",
                table: "MeetingChatMessages",
                column: "MeetingId");

            migrationBuilder.CreateIndex(
                name: "IX_MeetingInvites_MeetingId",
                table: "MeetingInvites",
                column: "MeetingId");

            migrationBuilder.CreateIndex(
                name: "IX_MeetingReminders_MeetingId",
                table: "MeetingReminders",
                column: "MeetingId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LobbyRequests");

            migrationBuilder.DropTable(
                name: "MeetingChatMessages");

            migrationBuilder.DropTable(
                name: "MeetingInvites");

            migrationBuilder.DropTable(
                name: "MeetingReminders");

            migrationBuilder.DropColumn(
                name: "IsAdmitted",
                table: "Participants");

            migrationBuilder.DropColumn(
                name: "IsHandRaised",
                table: "Participants");

            migrationBuilder.DropColumn(
                name: "Reaction",
                table: "Participants");

            migrationBuilder.DropColumn(
                name: "Role",
                table: "Participants");

            migrationBuilder.DropColumn(
                name: "AllowAttendeeUnmute",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "AllowChat",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "AllowReactions",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "AllowRecording",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "AllowScreenShare",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "AllowTranscription",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "LobbyEnabled",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "Notes",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "Recap",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "RecurrenceRule",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "WhiteboardData",
                table: "Meetings");
        }
    }
}
