using System.Text.Json;
using System.Xml.Linq;
using YamlDotNet.Serialization;

namespace Infrastructure.Tests;

public class ConfigurationInfrastructureTests
{
    [Fact]
    public void Api_gateway_reverse_proxy_config_has_valid_routes_clusters_and_swagger_sources()
    {
        using var document = JsonDocument.Parse(File.ReadAllText(RepoPath("src", "Gateway", "ApiGateway", "appsettings.json")));
        var reverseProxy = document.RootElement.GetProperty("ReverseProxy");
        var routes = reverseProxy.GetProperty("Routes");
        var clusters = reverseProxy.GetProperty("Clusters");
        var clusterIds = clusters.EnumerateObject().Select(item => item.Name).ToHashSet(StringComparer.Ordinal);

        var expectedRouteIds = new[]
        {
            "userservice-swagger",
            "meetingservice-swagger",
            "notificationservice-swagger",
            "organizationservice-swagger",
            "userservice",
            "userauth",
            "useravatars",
            "meetingservice",
            "conversations",
            "calendarconnections",
            "teamspaces",
            "licenserequests",
            "messaging",
            "organizations",
            "notificationhub"
        };

        foreach (var routeId in expectedRouteIds)
        {
            Assert.True(routes.TryGetProperty(routeId, out var route), $"Missing gateway route '{routeId}'.");
            var clusterId = route.GetProperty("ClusterId").GetString();
            Assert.False(string.IsNullOrWhiteSpace(clusterId));
            Assert.Contains(clusterId!, clusterIds);

            var path = route.GetProperty("Match").GetProperty("Path").GetString();
            Assert.False(string.IsNullOrWhiteSpace(path));
            Assert.StartsWith("/", path);

            var methods = route.GetProperty("Match").GetProperty("Methods").EnumerateArray().Select(item => item.GetString()).ToList();
            Assert.NotEmpty(methods);
            Assert.All(methods, method => Assert.Contains(method, new[] { "GET", "POST", "PUT", "DELETE" }));
        }

        AssertGatewayCluster(clusters, "userservice-cluster", 5001);
        AssertGatewayCluster(clusters, "meetingservice-cluster", 5002);
        AssertGatewayCluster(clusters, "notificationservice-cluster", 5003);
        AssertGatewayCluster(clusters, "organizationservice-cluster", 5004);

        AssertSwaggerRoute(routes, "userservice-swagger", "userservice-cluster");
        AssertSwaggerRoute(routes, "meetingservice-swagger", "meetingservice-cluster");
        AssertSwaggerRoute(routes, "notificationservice-swagger", "notificationservice-cluster");
        AssertSwaggerRoute(routes, "organizationservice-swagger", "organizationservice-cluster");
    }

    [Fact]
    public void Docker_compose_defines_required_infra_services_ports_volumes_and_healthchecks()
    {
        var compose = LoadDockerCompose();
        var services = AsMap(compose["services"]);

        AssertDockerService(services, "postgres", "postgres:15-alpine", new[] { "5432:5432" }, requiresHealthcheck: true);
        AssertDockerService(services, "redis", "redis:7-alpine", new[] { "6379:6379" }, requiresHealthcheck: true);
        AssertDockerService(services, "rabbitmq", "rabbitmq:3.13-management-alpine", new[] { "5672:5672", "15672:15672" }, requiresHealthcheck: true);
        AssertDockerService(services, "mailpit", "axllent/mailpit:latest", new[] { "1025:1025", "8025:8025" }, requiresHealthcheck: false);

        var postgres = AsMap(services["postgres"]);
        var volumes = AsList(postgres["volumes"]).Select(item => item.ToString() ?? string.Empty).ToList();
        Assert.Contains(volumes, volume => volume.StartsWith("./init-db.sql:", StringComparison.Ordinal));
        Assert.True(File.Exists(RepoPath("init-db.sql")));

        var rootVolumes = AsMap(compose["volumes"]);
        Assert.Contains("postgres_data", rootVolumes.Keys.Cast<string>());
        Assert.Contains("redis_data", rootVolumes.Keys.Cast<string>());
        Assert.Contains("rabbitmq_data", rootVolumes.Keys.Cast<string>());

        var networks = AsMap(compose["networks"]);
        Assert.Contains("meeting_network", networks.Keys.Cast<string>());
    }

    [Fact]
    public void Run_all_services_script_stops_existing_processes_and_verifies_compose_services_before_starting_apps()
    {
        var script = File.ReadAllText(RepoPath("run-all-services.ps1"));

        Assert.Contains("function Stop-ExistingApplications", script);
        Assert.Contains("function Get-ComposeServices", script);
        Assert.Contains("function Ensure-DockerComposeServices", script);
        Assert.Contains("\"ps\" \"--services\" \"--filter\" \"status=running\"", script);
        Assert.Contains("Invoke-DockerCompose \"up\" \"-d\"", script);

        var cleanupIndex = script.IndexOf("Stop-ExistingApplications", StringComparison.Ordinal);
        var dockerIndex = script.IndexOf("$dockerReady = Ensure-DockerComposeServices", StringComparison.Ordinal);
        var startIndex = script.IndexOf("Start-LocalService -ServiceName \"API Gateway\"", StringComparison.Ordinal);

        Assert.True(cleanupIndex >= 0);
        Assert.True(dockerIndex > cleanupIndex);
        Assert.True(startIndex > dockerIndex);
    }

    [Fact]
    public void Dotnet_service_projects_use_expected_sdks_target_frameworks_and_package_floor()
    {
        var projects = new[]
        {
            ("ApiGateway", RepoPath("src", "Gateway", "ApiGateway", "ApiGateway.csproj"), "net8.0"),
            ("MeetingService", RepoPath("src", "Services", "MeetingService", "MeetingService.csproj"), "net8.0"),
            ("NotificationService", RepoPath("src", "Services", "NotificationService", "NotificationService.csproj"), "net8.0"),
            ("OrganizationService", RepoPath("src", "Services", "OrganizationService", "OrganizationService.csproj"), "net8.0"),
            ("UserService", RepoPath("src", "Services", "UserService", "UserService.csproj"), "net9.0")
        };

        foreach (var (name, path, targetFramework) in projects)
        {
            var document = XDocument.Load(path);
            Assert.Equal("Microsoft.NET.Sdk.Web", document.Root?.Attribute("Sdk")?.Value);
            Assert.Equal(targetFramework, document.Descendants("TargetFramework").Single().Value);

            var packageReferences = document
                .Descendants("PackageReference")
                .ToDictionary(
                    item => item.Attribute("Include")?.Value ?? string.Empty,
                    item => item.Attribute("Version")?.Value ?? string.Empty,
                    StringComparer.Ordinal);

            Assert.Contains("Swashbuckle.AspNetCore", packageReferences.Keys);
            if (name != "ApiGateway")
            {
                Assert.Contains("Microsoft.AspNetCore.Authentication.JwtBearer", packageReferences.Keys);
            }

            if (name is "MeetingService" or "UserService" or "OrganizationService" or "NotificationService")
            {
                Assert.Contains("Microsoft.EntityFrameworkCore", packageReferences.Keys);
                Assert.Contains("Npgsql.EntityFrameworkCore.PostgreSQL", packageReferences.Keys);
            }
        }
    }

    private static void AssertGatewayCluster(JsonElement clusters, string clusterId, int port)
    {
        Assert.True(clusters.TryGetProperty(clusterId, out var cluster), $"Missing gateway cluster '{clusterId}'.");
        var destinations = cluster.GetProperty("Destinations");
        var address = destinations.GetProperty("destination1").GetProperty("Address").GetString();
        Assert.True(Uri.TryCreate(address, UriKind.Absolute, out var uri));
        Assert.Equal("http", uri!.Scheme);
        Assert.Equal("localhost", uri.Host);
        Assert.Equal(port, uri.Port);
    }

    private static void AssertSwaggerRoute(JsonElement routes, string routeId, string clusterId)
    {
        var route = routes.GetProperty(routeId);
        Assert.Equal(clusterId, route.GetProperty("ClusterId").GetString());
        Assert.Equal("/swagger/v1/swagger.json", route.GetProperty("Transforms")[0].GetProperty("PathSet").GetString());
    }

    private static void AssertDockerService(
        IDictionary<object, object> services,
        string serviceName,
        string image,
        IReadOnlyCollection<string> expectedPorts,
        bool requiresHealthcheck)
    {
        Assert.True(services.TryGetValue(serviceName, out var serviceObject), $"Missing docker compose service '{serviceName}'.");
        var service = AsMap(serviceObject);
        Assert.Equal(image, service["image"].ToString());

        var ports = AsList(service["ports"]).Select(item => item.ToString()).ToHashSet(StringComparer.Ordinal);
        foreach (var expectedPort in expectedPorts)
        {
            Assert.Contains(expectedPort, ports);
        }

        Assert.Contains("meeting_network", AsList(service["networks"]).Select(item => item.ToString()));
        if (requiresHealthcheck)
        {
            Assert.True(service.ContainsKey("healthcheck"), $"{serviceName} should define a healthcheck.");
        }
    }

    private static Dictionary<object, object> LoadDockerCompose()
    {
        var deserializer = new DeserializerBuilder().Build();
        using var reader = File.OpenText(RepoPath("docker-compose.yml"));
        return deserializer.Deserialize<Dictionary<object, object>>(reader);
    }

    private static IDictionary<object, object> AsMap(object value)
    {
        return Assert.IsAssignableFrom<IDictionary<object, object>>(value);
    }

    private static IList<object> AsList(object value)
    {
        return Assert.IsAssignableFrom<IList<object>>(value);
    }

    private static string RepoPath(params string[] parts)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "docker-compose.yml")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        return Path.Combine(new[] { directory!.FullName }.Concat(parts).ToArray());
    }
}
