using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using OrganizationService.Controllers;
using OrganizationService.Data;
using OrganizationService.Models;
using Samvaad.Common.Caching;

namespace OrganizationService.Tests;

public class OrganizationControllerTests
{
    private static OrganizationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<OrganizationDbContext>()
            .UseInMemoryDatabase($"organization-tests-{Guid.NewGuid():N}")
            .Options;
        return new OrganizationDbContext(options);
    }

    private static OrganizationsController CreateController(OrganizationDbContext db, Guid? userId = null, string email = "owner@samvaad.test")
    {
        var configuration = new ConfigurationBuilder().Build();
        var controller = new OrganizationsController(
            db,
            new NoOpAppCache(),
            NullLogger<OrganizationsController>.Instance,
            configuration,
            new TestWebHostEnvironment());
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, (userId ?? Guid.NewGuid()).ToString()),
            new(ClaimTypes.Email, email),
            new(ClaimTypes.GivenName, "Owner"),
            new(ClaimTypes.Surname, "User")
        };
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test"))
            }
        };
        return controller;
    }

    [Fact]
    public async Task CreateOrganization_generates_slug_owner_member_and_audit_event()
    {
        await using var db = CreateDbContext();
        var ownerId = Guid.NewGuid();
        var controller = CreateController(db, ownerId);

        var result = await controller.CreateOrganization(new CreateOrganizationRequest
        {
            Name = "Wipro Demo",
            PrimaryDomain = "wipro.test"
        });

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var dto = Assert.IsType<OrganizationSettingsDto>(created.Value);
        Assert.Equal("wipro-demo", dto.Slug);
        Assert.Equal("http://localhost:5173/org/wipro-demo", dto.LocalAppUrl);
        Assert.Single(await db.OrganizationMembers.Where(member => member.OrganizationId == dto.Id && member.UserId == ownerId).ToListAsync());
        Assert.Contains(await db.OrganizationAuditEvents.ToListAsync(), item => item.Action == "OrganizationCreated");
    }

    [Fact]
    public async Task UpdateOrganization_clamps_limits_trims_url_and_records_audit()
    {
        await using var db = CreateDbContext();
        var controller = CreateController(db);
        var created = await controller.CreateOrganization(new CreateOrganizationRequest { Name = "Acme" });
        var organization = Assert.IsType<OrganizationSettingsDto>(Assert.IsType<CreatedAtActionResult>(created.Result).Value);

        var result = await controller.UpdateOrganization(organization.Id, new UpdateOrganizationSettingsRequest
        {
            Name = "Acme Collaboration",
            Slug = "Acme Collaboration",
            StorageProvider = "CustomerPremises",
            StorageRootPath = "  C:/samvaad  ",
            PublicBaseUrl = "https://samvaad.example.com/",
            RecordingRetentionDays = 0,
            AttachmentRetentionDays = 99999,
            MaxRecordingMegabytes = 1,
            MaxAttachmentMegabytes = 99999,
            EnableRecordingByDefault = true,
            RequireLobbyByDefault = false,
            AllowExternalGuests = false
        });

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var dto = Assert.IsType<OrganizationSettingsDto>(ok.Value);
        Assert.Equal("acme-collaboration", dto.Slug);
        Assert.Equal("https://samvaad.example.com", dto.PublicBaseUrl);
        Assert.Equal(1, dto.RecordingRetentionDays);
        Assert.Equal(3650, dto.AttachmentRetentionDays);
        Assert.Equal(25, dto.MaxRecordingMegabytes);
        Assert.Equal(512, dto.MaxAttachmentMegabytes);
        Assert.Contains(await db.OrganizationAuditEvents.ToListAsync(), item => item.Action == "OrganizationUpdated");
    }

    [Fact]
    public async Task Member_management_prevents_duplicates_updates_roles_and_removes_members()
    {
        await using var db = CreateDbContext();
        var controller = CreateController(db);
        var created = await controller.CreateOrganization(new CreateOrganizationRequest { Name = "Acme" });
        var organization = Assert.IsType<OrganizationSettingsDto>(Assert.IsType<CreatedAtActionResult>(created.Result).Value);
        var memberId = Guid.NewGuid();

        var addResult = await controller.AddMember(organization.Id, new AddOrganizationMemberRequest
        {
            UserId = memberId,
            Email = "member@samvaad.test",
            DisplayName = "Member User",
            Role = "Member"
        });
        var createdMember = Assert.IsType<CreatedAtActionResult>(addResult.Result);
        var member = Assert.IsType<OrganizationMemberDto>(createdMember.Value);

        var duplicate = await controller.AddMember(organization.Id, new AddOrganizationMemberRequest
        {
            UserId = memberId,
            Email = "member@samvaad.test",
            Role = "Member"
        });
        Assert.IsType<ConflictObjectResult>(duplicate.Result);

        var update = await controller.UpdateMember(organization.Id, member.Id, new UpdateOrganizationMemberRequest { Role = "Admin" });
        Assert.Equal("Admin", Assert.IsType<OrganizationMemberDto>(Assert.IsType<OkObjectResult>(update.Result).Value).Role);

        var delete = await controller.RemoveMember(organization.Id, member.Id);
        Assert.IsType<NoContentResult>(delete);
        Assert.False(await db.OrganizationMembers.AnyAsync(item => item.Id == member.Id));
    }

    [Fact]
    public async Task Feature_toggles_return_catalog_and_store_tenant_values()
    {
        await using var db = CreateDbContext();
        var controller = CreateController(db);
        var created = await controller.CreateOrganization(new CreateOrganizationRequest { Name = "Feature Org" });
        var organization = Assert.IsType<OrganizationSettingsDto>(Assert.IsType<CreatedAtActionResult>(created.Result).Value);

        var catalogResult = await controller.GetFeatureToggles(organization.Id);
        var catalog = Assert.IsType<List<OrganizationFeatureToggleDto>>(Assert.IsType<OkObjectResult>(catalogResult.Result).Value);
        Assert.Contains(catalog, item => item.Key == "recording" && item.IsEnabled);

        var updateResult = await controller.UpdateFeatureToggles(organization.Id, new UpdateOrganizationFeatureTogglesRequest
        {
            Features = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase)
            {
                ["recording"] = false,
                ["whiteboard"] = false,
                ["chat"] = true
            }
        });

        var updated = Assert.IsType<List<OrganizationFeatureToggleDto>>(Assert.IsType<OkObjectResult>(updateResult.Result).Value);
        Assert.False(updated.Single(item => item.Key == "recording").IsEnabled);
        Assert.False(updated.Single(item => item.Key == "whiteboard").IsEnabled);
        Assert.True(updated.Single(item => item.Key == "chat").IsEnabled);
        Assert.Contains(await db.OrganizationAuditEvents.ToListAsync(), item => item.Action == "FeatureTogglesUpdated");
    }

    [Fact]
    public async Task Feature_toggles_reject_unknown_feature_keys()
    {
        await using var db = CreateDbContext();
        var controller = CreateController(db);
        var created = await controller.CreateOrganization(new CreateOrganizationRequest { Name = "Feature Org" });
        var organization = Assert.IsType<OrganizationSettingsDto>(Assert.IsType<CreatedAtActionResult>(created.Result).Value);

        var result = await controller.UpdateFeatureToggles(organization.Id, new UpdateOrganizationFeatureTogglesRequest
        {
            Features = new Dictionary<string, bool> { ["unknownFeature"] = true }
        });

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task GetMyOrganizations_returns_only_current_user_memberships()
    {
        await using var db = CreateDbContext();
        var ownerId = Guid.NewGuid();
        var controller = CreateController(db, ownerId, "owner@samvaad.test");
        var owned = await controller.CreateOrganization(new CreateOrganizationRequest { Name = "Owned Org" });
        var ownedOrganization = Assert.IsType<OrganizationSettingsDto>(Assert.IsType<CreatedAtActionResult>(owned.Result).Value);

        db.OrganizationSettings.Add(new OrganizationSettings
        {
            Id = Guid.NewGuid(),
            Name = "Other Org",
            Slug = "other-org"
        });
        await db.SaveChangesAsync();

        var result = await controller.GetMyOrganizations();
        var organizations = Assert.IsType<List<OrganizationSettingsDto>>(Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Single(organizations);
        Assert.Equal(ownedOrganization.Id, organizations[0].Id);
    }

    [Fact]
    public async Task Internal_membership_validation_rejects_non_members_and_returns_role_for_members()
    {
        await using var db = CreateDbContext();
        var ownerId = Guid.NewGuid();
        var controller = CreateController(db, ownerId, "owner@samvaad.test");
        var created = await controller.CreateOrganization(new CreateOrganizationRequest { Name = "Secure Org" });
        var organization = Assert.IsType<OrganizationSettingsDto>(Assert.IsType<CreatedAtActionResult>(created.Result).Value);

        controller.ControllerContext.HttpContext.Request.Headers["X-Organization-Id"] = organization.Id.ToString();
        controller.ControllerContext.HttpContext.Request.Headers["X-User-Id"] = ownerId.ToString();
        controller.ControllerContext.HttpContext.Request.Headers["X-User-Email"] = "owner@samvaad.test";

        var allowed = await controller.ValidateCurrentMembershipInternal();
        var allowedDto = Assert.IsType<OrganizationMembershipValidationDto>(Assert.IsType<OkObjectResult>(allowed.Result).Value);
        Assert.True(allowedDto.IsMember);
        Assert.Equal("Owner", allowedDto.Role);

        controller.ControllerContext.HttpContext.Request.Headers["X-User-Id"] = Guid.NewGuid().ToString();
        controller.ControllerContext.HttpContext.Request.Headers["X-User-Email"] = "outsider@samvaad.test";

        var forbidden = await controller.ValidateCurrentMembershipInternal();
        Assert.IsType<ForbidResult>(forbidden.Result);
    }

    private sealed class TestWebHostEnvironment : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "OrganizationService.Tests";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = AppContext.BaseDirectory;
        public string EnvironmentName { get; set; } = "Development";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
