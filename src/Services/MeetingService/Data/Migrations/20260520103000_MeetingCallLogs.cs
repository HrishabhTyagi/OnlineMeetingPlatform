using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MeetingService.Data.Migrations
{
    [DbContext(typeof(MeetingDbContext))]
    [Migration("20260520103000_MeetingCallLogs")]
    public partial class MeetingCallLogs : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MeetingCallLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: true),
                    MeetingId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    CallerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CallerName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    RecipientUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientEmail = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    RecipientName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    CallType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    JoinUrl = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    StatusReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CancellationMessage = table.Column<string>(type: "text", nullable: true),
                    CancellationMessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    CallerSeenAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RecipientSeenAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CallerHiddenAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RecipientHiddenAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    StatusChangedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MeetingCallLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MeetingCallLogs_Meetings_MeetingId",
                        column: x => x.MeetingId,
                        principalTable: "Meetings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MeetingCallLogs_MeetingId",
                table: "MeetingCallLogs",
                column: "MeetingId");

            migrationBuilder.CreateIndex(
                name: "IX_MeetingCallLogs_MeetingId_CallerUserId",
                table: "MeetingCallLogs",
                columns: new[] { "MeetingId", "CallerUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_MeetingCallLogs_MeetingId_RecipientUserId",
                table: "MeetingCallLogs",
                columns: new[] { "MeetingId", "RecipientUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_MeetingCallLogs_OrganizationId",
                table: "MeetingCallLogs",
                column: "OrganizationId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "MeetingCallLogs");
        }
    }
}
