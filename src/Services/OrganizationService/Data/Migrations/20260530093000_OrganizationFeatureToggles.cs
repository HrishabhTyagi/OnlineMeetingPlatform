using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrganizationService.Data.Migrations
{
    [DbContext(typeof(OrganizationDbContext))]
    [Migration("20260530093000_OrganizationFeatureToggles")]
    public partial class OrganizationFeatureToggles : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OrganizationFeatureToggles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    FeatureKey = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrganizationFeatureToggles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrganizationFeatureToggles_OrganizationSettings_OrganizationId",
                        column: x => x.OrganizationId,
                        principalTable: "OrganizationSettings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OrganizationFeatureToggles_OrganizationId_FeatureKey",
                table: "OrganizationFeatureToggles",
                columns: new[] { "OrganizationId", "FeatureKey" },
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "OrganizationFeatureToggles");
        }
    }
}
