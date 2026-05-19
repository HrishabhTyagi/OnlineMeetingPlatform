using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MeetingService.Data.Migrations
{
    [Migration("20260518133000_ConversationTasksDocumentsAndAudit")]
    public partial class ConversationTasksDocumentsAndAudit : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsImportant",
                table: "ConversationMessages",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "ConversationTasks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceMessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    Title = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Priority = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    AssigneeId = table.Column<Guid>(type: "uuid", nullable: true),
                    AssigneeEmail = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    AssigneeName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    DueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConversationTasks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ConversationTasks_ConversationMessages_SourceMessageId",
                        column: x => x.SourceMessageId,
                        principalTable: "ConversationMessages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ConversationTasks_Conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalTable: "Conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ConversationDocumentShares",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    SharedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SharedByName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    RecipientEmails = table.Column<string>(type: "text", nullable: false),
                    OptionalMessage = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConversationDocumentShares", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ConversationDocumentShares_ConversationMessages_MessageId",
                        column: x => x.MessageId,
                        principalTable: "ConversationMessages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ConversationDocumentShares_Conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalTable: "Conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlatformAuditLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: true),
                    MeetingId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Action = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Details = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformAuditLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlatformAuditLogs_Conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalTable: "Conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PlatformAuditLogs_Meetings_MeetingId",
                        column: x => x.MeetingId,
                        principalTable: "Meetings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "ConversationTaskActivities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Action = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Details = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConversationTaskActivities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ConversationTaskActivities_ConversationTasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "ConversationTasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ConversationTaskNotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Note = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConversationTaskNotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ConversationTaskNotes_ConversationTasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "ConversationTasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConversationDocumentShares_ConversationId",
                table: "ConversationDocumentShares",
                column: "ConversationId");

            migrationBuilder.CreateIndex(
                name: "IX_ConversationDocumentShares_MessageId",
                table: "ConversationDocumentShares",
                column: "MessageId");

            migrationBuilder.CreateIndex(
                name: "IX_ConversationTaskActivities_TaskId",
                table: "ConversationTaskActivities",
                column: "TaskId");

            migrationBuilder.CreateIndex(
                name: "IX_ConversationTaskNotes_TaskId",
                table: "ConversationTaskNotes",
                column: "TaskId");

            migrationBuilder.CreateIndex(
                name: "IX_ConversationTasks_ConversationId",
                table: "ConversationTasks",
                column: "ConversationId");

            migrationBuilder.CreateIndex(
                name: "IX_ConversationTasks_ConversationId_AssigneeId",
                table: "ConversationTasks",
                columns: new[] { "ConversationId", "AssigneeId" });

            migrationBuilder.CreateIndex(
                name: "IX_ConversationTasks_ConversationId_Status",
                table: "ConversationTasks",
                columns: new[] { "ConversationId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ConversationTasks_SourceMessageId",
                table: "ConversationTasks",
                column: "SourceMessageId");

            migrationBuilder.CreateIndex(
                name: "IX_PlatformAuditLogs_ConversationId",
                table: "PlatformAuditLogs",
                column: "ConversationId");

            migrationBuilder.CreateIndex(
                name: "IX_PlatformAuditLogs_MeetingId",
                table: "PlatformAuditLogs",
                column: "MeetingId");

            migrationBuilder.CreateIndex(
                name: "IX_PlatformAuditLogs_OrganizationId",
                table: "PlatformAuditLogs",
                column: "OrganizationId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "ConversationDocumentShares");
            migrationBuilder.DropTable(name: "ConversationTaskActivities");
            migrationBuilder.DropTable(name: "ConversationTaskNotes");
            migrationBuilder.DropTable(name: "PlatformAuditLogs");
            migrationBuilder.DropTable(name: "ConversationTasks");

            migrationBuilder.DropColumn(
                name: "IsImportant",
                table: "ConversationMessages");
        }
    }
}
