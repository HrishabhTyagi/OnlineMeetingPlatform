using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MeetingService.Data.Migrations
{
    /// <inheritdoc />
    public partial class MeetingInviteResponses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ResponseStatus",
                table: "MeetingInvites",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "ResponseReason",
                table: "MeetingInvites",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RespondedAt",
                table: "MeetingInvites",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.Sql(
                "UPDATE \"MeetingInvites\" SET \"ResponseStatus\" = 1, \"RespondedAt\" = \"CreatedAt\" WHERE \"HasAccepted\" = TRUE;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ResponseStatus",
                table: "MeetingInvites");

            migrationBuilder.DropColumn(
                name: "ResponseReason",
                table: "MeetingInvites");

            migrationBuilder.DropColumn(
                name: "RespondedAt",
                table: "MeetingInvites");
        }
    }
}
