using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MeetingService.Data.Migrations
{
    [DbContext(typeof(MeetingDbContext))]
    [Migration("20260517111000_OrganizationTenantScope")]
    public partial class OrganizationTenantScope : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Meetings",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Conversations",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Meetings_OrganizationId",
                table: "Meetings",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Conversations_OrganizationId",
                table: "Conversations",
                column: "OrganizationId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Meetings_OrganizationId",
                table: "Meetings");

            migrationBuilder.DropIndex(
                name: "IX_Conversations_OrganizationId",
                table: "Conversations");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Meetings");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Conversations");
        }
    }
}
