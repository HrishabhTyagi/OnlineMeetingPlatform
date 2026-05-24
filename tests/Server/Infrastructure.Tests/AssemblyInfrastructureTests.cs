using System.Reflection;
using MeetingService.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using NotificationService.Data;
using NotificationService.Hubs;
using OrganizationService.Data;
using UserService.Data;

namespace Infrastructure.Tests;

public class AssemblyInfrastructureTests
{
    [Fact]
    public void Service_assemblies_load_all_types_without_reflection_errors()
    {
        var assemblies = ServiceAssemblies();

        foreach (var assembly in assemblies)
        {
            var exception = Record.Exception(() => assembly.GetTypes());

            Assert.Null(exception);
            Assert.Contains(assembly.GetTypes(), type => type.IsPublic);
        }
    }

    [Fact]
    public void Controllers_are_api_controllers_with_route_attributes()
    {
        var controllerTypes = ServiceAssemblies()
            .SelectMany(assembly => assembly.GetTypes())
            .Where(type => !type.IsAbstract && typeof(ControllerBase).IsAssignableFrom(type))
            .OrderBy(type => type.FullName)
            .ToList();

        Assert.Contains(controllerTypes, type => type.Name == "AuthController");
        Assert.Contains(controllerTypes, type => type.Name == "MeetingsController");
        Assert.Contains(controllerTypes, type => type.Name == "OrganizationsController");
        Assert.Contains(controllerTypes, type => type.Name == "InternalNotificationsController");

        foreach (var controller in controllerTypes)
        {
            Assert.NotNull(controller.GetCustomAttribute<ApiControllerAttribute>());
            Assert.NotEmpty(controller.GetCustomAttributes<RouteAttribute>());
            Assert.Contains(
                controller.GetCustomAttributes<RouteAttribute>(),
                route => !string.IsNullOrWhiteSpace(route.Template) && route.Template.StartsWith("api/", StringComparison.OrdinalIgnoreCase));
        }
    }

    [Fact]
    public void Notification_hub_is_discoverable_and_exposes_realtime_contract_methods()
    {
        var hubType = typeof(NotificationHub);
        Assert.True(typeof(Hub).IsAssignableFrom(hubType));

        var publicMethods = hubType
            .GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly)
            .Select(method => method.Name)
            .ToHashSet(StringComparer.Ordinal);

        var expectedMethods = new[]
        {
            "JoinMeetingGroup",
            "LeaveMeetingGroup",
            "JoinUserNotifications",
            "JoinConversation",
            "LeaveConversation",
            "SendConversationMessage",
            "SendIncomingCall",
            "SendIncomingCallCancelled",
            "SendIncomingCallResponse",
            "SendWebRtcOffer",
            "SendWebRtcAnswer",
            "SendWebRtcIceCandidate",
            "NotifyMeetingEnded",
            "NotifyWhiteboardUpdated",
            "BroadcastMeetingInvite"
        };

        foreach (var method in expectedMethods)
        {
            Assert.Contains(method, publicMethods);
        }
    }

    [Fact]
    public void Entity_framework_models_build_for_all_service_dbcontexts()
    {
        using var userDb = new UserDbContext(
            new DbContextOptionsBuilder<UserDbContext>()
                .UseInMemoryDatabase($"infra-user-{Guid.NewGuid():N}")
                .Options);
        using var meetingDb = new MeetingDbContext(
            new DbContextOptionsBuilder<MeetingDbContext>()
                .UseInMemoryDatabase($"infra-meeting-{Guid.NewGuid():N}")
                .Options);
        using var organizationDb = new OrganizationDbContext(
            new DbContextOptionsBuilder<OrganizationDbContext>()
                .UseInMemoryDatabase($"infra-organization-{Guid.NewGuid():N}")
                .Options);
        using var notificationDb = new NotificationDbContext(
            new DbContextOptionsBuilder<NotificationDbContext>()
                .UseInMemoryDatabase($"infra-notification-{Guid.NewGuid():N}")
                .Options);

        Assert.Contains(userDb.Model.GetEntityTypes(), entity => entity.ClrType.Name == "User");
        Assert.Contains(meetingDb.Model.GetEntityTypes(), entity => entity.ClrType.Name == "Meeting");
        Assert.Contains(meetingDb.Model.GetEntityTypes(), entity => entity.ClrType.Name == "MeetingCallLog");
        Assert.Contains(meetingDb.Model.GetEntityTypes(), entity => entity.ClrType.Name == "ConversationTask");
        Assert.Contains(meetingDb.Model.GetEntityTypes(), entity => entity.ClrType.Name == "IntegrationEventOutboxMessage");
        Assert.Contains(meetingDb.Model.GetEntityTypes(), entity => entity.ClrType.Name == "IntegrationEventConsumerCheckpoint");
        Assert.Contains(organizationDb.Model.GetEntityTypes(), entity => entity.ClrType.Name == "OrganizationSettings");
        Assert.Contains(organizationDb.Model.GetEntityTypes(), entity => entity.ClrType.Name == "OrganizationMember");
        Assert.Contains(notificationDb.Model.GetEntityTypes(), entity => entity.ClrType.Name == "ProcessedNotificationEvent");
    }

    [Fact]
    public void Ef_migration_assemblies_have_unique_migration_ids()
    {
        var contexts = new[]
        {
            typeof(UserDbContext),
            typeof(MeetingDbContext),
            typeof(OrganizationDbContext),
            typeof(NotificationDbContext)
        };

        foreach (var contextType in contexts)
        {
            var migrations = contextType.Assembly
                .GetTypes()
                .Where(type => !type.IsAbstract && typeof(Migration).IsAssignableFrom(type))
                .Select(type => new
                {
                    Type = type,
                    Attribute = type.GetCustomAttribute<MigrationAttribute>()
                })
                .Where(item => item.Attribute != null)
                .ToList();

            Assert.NotEmpty(migrations);
            Assert.Equal(
                migrations.Count,
                migrations.Select(item => item.Attribute!.Id).Distinct(StringComparer.Ordinal).Count());
            Assert.All(migrations, item => Assert.EndsWith("Migration", item.Type.BaseType?.Name ?? "Migration"));
        }
    }

    private static Assembly[] ServiceAssemblies() =>
    [
        typeof(UserDbContext).Assembly,
        typeof(MeetingDbContext).Assembly,
        typeof(OrganizationDbContext).Assembly,
        typeof(NotificationDbContext).Assembly,
        typeof(NotificationHub).Assembly
    ];
}
