using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using OrganizationService.Data;

#nullable disable

namespace OrganizationService.Data.Migrations
{
    [DbContext(typeof(OrganizationDbContext))]
    [Migration("20260517110000_OrganizationSlug")]
    public partial class OrganizationSlug : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Slug",
                table: "OrganizationSettings",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_OrganizationSettings_Slug",
                table: "OrganizationSettings",
                column: "Slug",
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_OrganizationSettings_Slug",
                table: "OrganizationSettings");

            migrationBuilder.DropColumn(
                name: "Slug",
                table: "OrganizationSettings");
        }
    }
}
