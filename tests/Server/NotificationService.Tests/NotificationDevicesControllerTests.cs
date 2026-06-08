using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NotificationService.Controllers;
using NotificationService.Data;
using NotificationService.Models;

namespace NotificationService.Tests;

public class NotificationDevicesControllerTests
{
    [Fact]
    public async Task RegisterDevice_creates_device_for_signed_in_user()
    {
        await using var context = CreateContext();
        var userId = Guid.NewGuid();
        var controller = CreateController(context, userId);

        var result = await controller.RegisterDevice(new RegisterNotificationDeviceRequest
        {
            PushToken = "ExponentPushToken[test]",
            Platform = "IOS",
            DeviceName = "Rishabh iPhone"
        }, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var dto = Assert.IsType<NotificationDeviceDto>(ok.Value);
        Assert.Equal("ios", dto.Platform);
        Assert.Equal("Rishabh iPhone", dto.DeviceName);
        Assert.True(dto.IsActive);

        var device = Assert.Single(context.NotificationDevices);
        Assert.Equal(userId, device.UserId);
        Assert.Equal("ExponentPushToken[test]", device.PushToken);
    }

    [Fact]
    public async Task RegisterDevice_upserts_existing_token_and_reactivates_it()
    {
        await using var context = CreateContext();
        var userId = Guid.NewGuid();
        var device = new NotificationDevice
        {
            UserId = userId,
            PushToken = "token-1",
            Platform = "android",
            DeviceName = "Old",
            IsActive = false,
            LastSeenAtUtc = DateTime.UtcNow.AddDays(-2)
        };
        context.NotificationDevices.Add(device);
        await context.SaveChangesAsync();

        var controller = CreateController(context, userId);
        await controller.RegisterDevice(new RegisterNotificationDeviceRequest
        {
            PushToken = "token-1",
            Platform = "android",
            DeviceName = "New"
        }, CancellationToken.None);

        var saved = Assert.Single(context.NotificationDevices);
        Assert.True(saved.IsActive);
        Assert.Equal("New", saved.DeviceName);
        Assert.True(saved.LastSeenAtUtc > DateTime.UtcNow.AddMinutes(-1));
    }

    [Fact]
    public async Task UnregisterDevice_cannot_disable_another_users_device()
    {
        await using var context = CreateContext();
        var ownerId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var device = new NotificationDevice
        {
            UserId = ownerId,
            PushToken = "token-1",
            Platform = "android"
        };
        context.NotificationDevices.Add(device);
        await context.SaveChangesAsync();

        var controller = CreateController(context, otherUserId);
        var result = await controller.UnregisterDevice(device.Id, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        Assert.True((await context.NotificationDevices.SingleAsync()).IsActive);
    }

    [Fact]
    public async Task UnregisterToken_disables_only_current_users_matching_token()
    {
        await using var context = CreateContext();
        var userId = Guid.NewGuid();
        context.NotificationDevices.AddRange(
            new NotificationDevice { UserId = userId, PushToken = "token-1", Platform = "android" },
            new NotificationDevice { UserId = Guid.NewGuid(), PushToken = "token-1", Platform = "ios" });
        await context.SaveChangesAsync();

        var controller = CreateController(context, userId);
        var result = await controller.UnregisterToken("token-1", CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        var devices = await context.NotificationDevices.OrderBy(item => item.UserId == userId ? 0 : 1).ToListAsync();
        Assert.False(devices[0].IsActive);
        Assert.True(devices[1].IsActive);
    }

    private static NotificationDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<NotificationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new NotificationDbContext(options);
    }

    private static NotificationDevicesController CreateController(NotificationDbContext context, Guid userId)
    {
        var controller = new NotificationDevicesController(context);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, userId.ToString())
                }, "test"))
            }
        };

        return controller;
    }
}
