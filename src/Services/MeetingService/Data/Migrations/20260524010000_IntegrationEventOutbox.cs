using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MeetingService.Data.Migrations
{
    [DbContext(typeof(MeetingDbContext))]
    [Migration("20260524010000_IntegrationEventOutbox")]
    public partial class IntegrationEventOutbox : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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
                name: "IX_IntegrationEventOutboxMessages_ProcessedAtUtc_FailedAtUtc_AvailableAtUtc",
                table: "IntegrationEventOutboxMessages",
                columns: new[] { "ProcessedAtUtc", "FailedAtUtc", "AvailableAtUtc" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "IntegrationEventOutboxMessages");
        }
    }
}
