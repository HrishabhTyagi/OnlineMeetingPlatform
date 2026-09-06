using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MeetingService.Data.Migrations
{
    /// <inheritdoc />
    public partial class MeetingIntelligence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ConversationMessages_ConversationId",
                table: "ConversationMessages");

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Meetings",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TeamChannelId",
                table: "Meetings",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RespondedAt",
                table: "MeetingInvites",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResponseReason",
                table: "MeetingInvites",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ResponseStatus",
                table: "MeetingInvites",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "AttachmentContentType",
                table: "MeetingChatMessages",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AttachmentFileName",
                table: "MeetingChatMessages",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "AttachmentSizeBytes",
                table: "MeetingChatMessages",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AttachmentUrl",
                table: "MeetingChatMessages",
                type: "character varying(1024)",
                maxLength: 1024,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Conversations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ClientMessageId",
                table: "ConversationMessages",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsImportant",
                table: "ConversationMessages",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsPinned",
                table: "ConversationMessages",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "ReplyToMessageId",
                table: "ConversationMessages",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReplyToPreview",
                table: "ConversationMessages",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReplyToSenderName",
                table: "ConversationMessages",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CalendarConnections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    AccountEmail = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    CalendarId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    AccessToken = table.Column<string>(type: "text", nullable: false),
                    RefreshToken = table.Column<string>(type: "text", nullable: true),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    LastSyncAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastError = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CalendarConnections", x => x.Id);
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
                name: "ExternalCalendarEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    CalendarId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    ExternalEventId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    HtmlLink = table.Column<string>(type: "text", nullable: true),
                    LastSyncedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastError = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExternalCalendarEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExternalCalendarEvents_Meetings_MeetingId",
                        column: x => x.MeetingId,
                        principalTable: "Meetings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "IntegrationEventConsumerCheckpoints",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    HandlerName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    FirstSeenAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    LastAttemptAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    ProcessedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    LastError = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IntegrationEventConsumerCheckpoints", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "IntegrationEventOutboxMessages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    EventType = table.Column<string>(type: "character varying(600)", maxLength: 600, nullable: false),
                    ExchangeName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    RoutingKey = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Payload = table.Column<string>(type: "text", nullable: false),
                    OccurredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    AvailableAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    LockedUntilUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LockId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    RetryCount = table.Column<int>(type: "integer", nullable: false),
                    ProcessedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FailedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastError = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IntegrationEventOutboxMessages", x => x.Id);
                });

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

            migrationBuilder.CreateTable(
                name: "MeetingIntelligence",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecordingUrl = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Transcript = table.Column<string>(type: "text", nullable: true),
                    TranscriptSegmentsJson = table.Column<string>(type: "text", nullable: true),
                    Summary = table.Column<string>(type: "text", nullable: true),
                    ActionItemsJson = table.Column<string>(type: "text", nullable: true),
                    Error = table.Column<string>(type: "text", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    CompletedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MeetingIntelligence", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MeetingIntelligence_Meetings_MeetingId",
                        column: x => x.MeetingId,
                        principalTable: "Meetings",
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
                name: "TeamSpaces",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Description = table.Column<string>(type: "character varying(600)", maxLength: 600, nullable: true),
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsArchived = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamSpaces", x => x.Id);
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

            migrationBuilder.CreateTable(
                name: "TeamChannels",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamSpaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamChannels", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TeamChannels_Conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalTable: "Conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TeamChannels_TeamSpaces_TeamSpaceId",
                        column: x => x.TeamSpaceId,
                        principalTable: "TeamSpaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TeamSpaceMembers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamSpaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserEmail = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    UserName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Role = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    JoinedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamSpaceMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TeamSpaceMembers_TeamSpaces_TeamSpaceId",
                        column: x => x.TeamSpaceId,
                        principalTable: "TeamSpaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TeamChannelTabs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TeamChannelId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Kind = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Url = table.Column<string>(type: "text", nullable: true),
                    Content = table.Column<string>(type: "text", nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamChannelTabs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TeamChannelTabs_TeamChannels_TeamChannelId",
                        column: x => x.TeamChannelId,
                        principalTable: "TeamChannels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Meetings_OrganizationId",
                table: "Meetings",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Meetings_TeamChannelId",
                table: "Meetings",
                column: "TeamChannelId");

            migrationBuilder.CreateIndex(
                name: "IX_Conversations_OrganizationId",
                table: "Conversations",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_ConversationMessages_ConversationId_SenderId_ClientMessageId",
                table: "ConversationMessages",
                columns: new[] { "ConversationId", "SenderId", "ClientMessageId" },
                unique: true,
                filter: "\"ClientMessageId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ConversationMessages_ReplyToMessageId",
                table: "ConversationMessages",
                column: "ReplyToMessageId");

            migrationBuilder.CreateIndex(
                name: "IX_CalendarConnections_UserId_Provider",
                table: "CalendarConnections",
                columns: new[] { "UserId", "Provider" },
                unique: true);

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
                name: "IX_ExternalCalendarEvents_MeetingId_UserId_Provider",
                table: "ExternalCalendarEvents",
                columns: new[] { "MeetingId", "UserId", "Provider" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_IntegrationEventConsumerCheckpoints_EventId_HandlerName",
                table: "IntegrationEventConsumerCheckpoints",
                columns: new[] { "EventId", "HandlerName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_IntegrationEventConsumerCheckpoints_ProcessedAtUtc",
                table: "IntegrationEventConsumerCheckpoints",
                column: "ProcessedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_IntegrationEventOutboxMessages_EventId",
                table: "IntegrationEventOutboxMessages",
                column: "EventId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_IntegrationEventOutboxMessages_LockedUntilUtc",
                table: "IntegrationEventOutboxMessages",
                column: "LockedUntilUtc");

            migrationBuilder.CreateIndex(
                name: "IX_IntegrationEventOutboxMessages_ProcessedAtUtc_FailedAtUtc_A~",
                table: "IntegrationEventOutboxMessages",
                columns: new[] { "ProcessedAtUtc", "FailedAtUtc", "AvailableAtUtc" });

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

            migrationBuilder.CreateIndex(
                name: "IX_MeetingIntelligence_MeetingId",
                table: "MeetingIntelligence",
                column: "MeetingId",
                unique: true);

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

            migrationBuilder.CreateIndex(
                name: "IX_TeamChannels_ConversationId",
                table: "TeamChannels",
                column: "ConversationId");

            migrationBuilder.CreateIndex(
                name: "IX_TeamChannels_TeamSpaceId_Name",
                table: "TeamChannels",
                columns: new[] { "TeamSpaceId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeamChannelTabs_TeamChannelId_SortOrder",
                table: "TeamChannelTabs",
                columns: new[] { "TeamChannelId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_TeamSpaceMembers_TeamSpaceId_UserId",
                table: "TeamSpaceMembers",
                columns: new[] { "TeamSpaceId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeamSpaces_OrganizationId",
                table: "TeamSpaces",
                column: "OrganizationId");

            migrationBuilder.AddForeignKey(
                name: "FK_Meetings_TeamChannels_TeamChannelId",
                table: "Meetings",
                column: "TeamChannelId",
                principalTable: "TeamChannels",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Meetings_TeamChannels_TeamChannelId",
                table: "Meetings");

            migrationBuilder.DropTable(
                name: "CalendarConnections");

            migrationBuilder.DropTable(
                name: "ConversationDocumentShares");

            migrationBuilder.DropTable(
                name: "ConversationTaskActivities");

            migrationBuilder.DropTable(
                name: "ConversationTaskNotes");

            migrationBuilder.DropTable(
                name: "ExternalCalendarEvents");

            migrationBuilder.DropTable(
                name: "IntegrationEventConsumerCheckpoints");

            migrationBuilder.DropTable(
                name: "IntegrationEventOutboxMessages");

            migrationBuilder.DropTable(
                name: "MeetingCallLogs");

            migrationBuilder.DropTable(
                name: "MeetingIntelligence");

            migrationBuilder.DropTable(
                name: "PlatformAuditLogs");

            migrationBuilder.DropTable(
                name: "TeamChannelTabs");

            migrationBuilder.DropTable(
                name: "TeamSpaceMembers");

            migrationBuilder.DropTable(
                name: "ConversationTasks");

            migrationBuilder.DropTable(
                name: "TeamChannels");

            migrationBuilder.DropTable(
                name: "TeamSpaces");

            migrationBuilder.DropIndex(
                name: "IX_Meetings_OrganizationId",
                table: "Meetings");

            migrationBuilder.DropIndex(
                name: "IX_Meetings_TeamChannelId",
                table: "Meetings");

            migrationBuilder.DropIndex(
                name: "IX_Conversations_OrganizationId",
                table: "Conversations");

            migrationBuilder.DropIndex(
                name: "IX_ConversationMessages_ConversationId_SenderId_ClientMessageId",
                table: "ConversationMessages");

            migrationBuilder.DropIndex(
                name: "IX_ConversationMessages_ReplyToMessageId",
                table: "ConversationMessages");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "TeamChannelId",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "RespondedAt",
                table: "MeetingInvites");

            migrationBuilder.DropColumn(
                name: "ResponseReason",
                table: "MeetingInvites");

            migrationBuilder.DropColumn(
                name: "ResponseStatus",
                table: "MeetingInvites");

            migrationBuilder.DropColumn(
                name: "AttachmentContentType",
                table: "MeetingChatMessages");

            migrationBuilder.DropColumn(
                name: "AttachmentFileName",
                table: "MeetingChatMessages");

            migrationBuilder.DropColumn(
                name: "AttachmentSizeBytes",
                table: "MeetingChatMessages");

            migrationBuilder.DropColumn(
                name: "AttachmentUrl",
                table: "MeetingChatMessages");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Conversations");

            migrationBuilder.DropColumn(
                name: "ClientMessageId",
                table: "ConversationMessages");

            migrationBuilder.DropColumn(
                name: "IsImportant",
                table: "ConversationMessages");

            migrationBuilder.DropColumn(
                name: "IsPinned",
                table: "ConversationMessages");

            migrationBuilder.DropColumn(
                name: "ReplyToMessageId",
                table: "ConversationMessages");

            migrationBuilder.DropColumn(
                name: "ReplyToPreview",
                table: "ConversationMessages");

            migrationBuilder.DropColumn(
                name: "ReplyToSenderName",
                table: "ConversationMessages");

            migrationBuilder.CreateIndex(
                name: "IX_ConversationMessages_ConversationId",
                table: "ConversationMessages",
                column: "ConversationId");
        }
    }
}
