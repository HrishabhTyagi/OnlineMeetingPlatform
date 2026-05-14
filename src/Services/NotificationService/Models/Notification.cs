namespace NotificationService.Models;

public class Notification
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty; // MeetingInvite, ParticipantJoined, etc.
    public Dictionary<string, string> Data { get; set; } = new();
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class NotificationDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public Dictionary<string, string> Data { get; set; } = new();
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; }
}
