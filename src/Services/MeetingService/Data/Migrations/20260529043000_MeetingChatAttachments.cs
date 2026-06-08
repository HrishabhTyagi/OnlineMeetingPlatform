using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MeetingService.Data.Migrations
{
    [DbContext(typeof(MeetingDbContext))]
    [Migration("20260529043000_MeetingChatAttachments")]
    public partial class MeetingChatAttachments : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "AttachmentContentType", table: "MeetingChatMessages");
            migrationBuilder.DropColumn(name: "AttachmentFileName", table: "MeetingChatMessages");
            migrationBuilder.DropColumn(name: "AttachmentSizeBytes", table: "MeetingChatMessages");
            migrationBuilder.DropColumn(name: "AttachmentUrl", table: "MeetingChatMessages");
        }
    }
}
