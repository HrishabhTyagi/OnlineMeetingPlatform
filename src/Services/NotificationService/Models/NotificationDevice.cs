namespace NotificationService.Models;

public class NotificationDevice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string PushToken { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty;
    public string? DeviceName { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAtUtc { get; set; } = DateTime.UtcNow;
}

public class RegisterNotificationDeviceRequest
{
    public string PushToken { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty;
    public string? DeviceName { get; set; }
}

public class NotificationDeviceDto
{
    public Guid Id { get; set; }
    public string PushToken { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty;
    public string? DeviceName { get; set; }
    public bool IsActive { get; set; }
    public DateTime LastSeenAtUtc { get; set; }
}
