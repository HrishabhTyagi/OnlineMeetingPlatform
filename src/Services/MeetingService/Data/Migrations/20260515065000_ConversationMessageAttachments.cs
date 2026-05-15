using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace MeetingService.Data.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(MeetingDbContext))]
    [Migration("20260515065000_ConversationMessageAttachments")]
    public partial class ConversationMessageAttachments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AttachmentContentType",
                table: "ConversationMessages",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AttachmentFileName",
                table: "ConversationMessages",
                type: "character varying(260)",
                maxLength: 260,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "AttachmentSizeBytes",
                table: "ConversationMessages",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AttachmentUrl",
                table: "ConversationMessages",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AttachmentContentType",
                table: "ConversationMessages");

            migrationBuilder.DropColumn(
                name: "AttachmentFileName",
                table: "ConversationMessages");

            migrationBuilder.DropColumn(
                name: "AttachmentSizeBytes",
                table: "ConversationMessages");

            migrationBuilder.DropColumn(
                name: "AttachmentUrl",
                table: "ConversationMessages");
        }
    }
}
