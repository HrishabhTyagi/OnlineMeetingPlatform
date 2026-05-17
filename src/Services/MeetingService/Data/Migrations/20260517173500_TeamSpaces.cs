using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MeetingService.Data.Migrations
{
    [DbContext(typeof(MeetingDbContext))]
    [Migration("20260517173500_TeamSpaces")]
    public partial class TeamSpaces : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "TeamChannelId",
                table: "Meetings",
                type: "uuid",
                nullable: true);

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
                name: "IX_Meetings_TeamChannelId",
                table: "Meetings",
                column: "TeamChannelId");

            migrationBuilder.CreateIndex(
                name: "IX_TeamChannelTabs_TeamChannelId_SortOrder",
                table: "TeamChannelTabs",
                columns: new[] { "TeamChannelId", "SortOrder" });

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

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Meetings_TeamChannels_TeamChannelId",
                table: "Meetings");

            migrationBuilder.DropTable(
                name: "TeamChannelTabs");

            migrationBuilder.DropTable(
                name: "TeamSpaceMembers");

            migrationBuilder.DropTable(
                name: "TeamChannels");

            migrationBuilder.DropTable(
                name: "TeamSpaces");

            migrationBuilder.DropIndex(
                name: "IX_Meetings_TeamChannelId",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "TeamChannelId",
                table: "Meetings");
        }
    }
}
