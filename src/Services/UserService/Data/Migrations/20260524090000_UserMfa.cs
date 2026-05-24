using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace UserService.Data.Migrations
{
    /// <inheritdoc />
    public partial class UserMfa : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "MfaEnabled",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "MfaEnabledAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "MfaLastVerifiedAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MfaRecoveryCodeHashes",
                table: "Users",
                type: "character varying(4096)",
                maxLength: 4096,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "MfaRememberDeviceExpiresAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MfaRememberDeviceTokenHash",
                table: "Users",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MfaSecretProtected",
                table: "Users",
                type: "character varying(2048)",
                maxLength: 2048,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MfaEnabled",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "MfaEnabledAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "MfaLastVerifiedAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "MfaRecoveryCodeHashes",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "MfaRememberDeviceExpiresAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "MfaRememberDeviceTokenHash",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "MfaSecretProtected",
                table: "Users");
        }
    }
}
