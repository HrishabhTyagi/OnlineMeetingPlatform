using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MeetingService.Data.Migrations
{
    [DbContext(typeof(MeetingDbContext))]
    [Migration("20260516014500_ConversationMessageActions")]
    public partial class ConversationMessageActions : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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

            migrationBuilder.CreateIndex(
                name: "IX_ConversationMessages_ReplyToMessageId",
                table: "ConversationMessages",
                column: "ReplyToMessageId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ConversationMessages_ReplyToMessageId",
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
        }
    }
}
