using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MeetingService.Data.Migrations
{
    [DbContext(typeof(MeetingDbContext))]
    [Migration("20260524013000_IntegrationEventConsumerCheckpoints")]
    public partial class IntegrationEventConsumerCheckpoints : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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

            migrationBuilder.CreateIndex(
                name: "IX_IntegrationEventConsumerCheckpoints_EventId_HandlerName",
                table: "IntegrationEventConsumerCheckpoints",
                columns: new[] { "EventId", "HandlerName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_IntegrationEventConsumerCheckpoints_ProcessedAtUtc",
                table: "IntegrationEventConsumerCheckpoints",
                column: "ProcessedAtUtc");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "IntegrationEventConsumerCheckpoints");
        }
    }
}
