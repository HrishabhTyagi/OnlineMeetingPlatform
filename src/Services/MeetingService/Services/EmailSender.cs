using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;
using MeetingService.Models;

namespace MeetingService.Services;

public class EmailOptions
{
    public bool Enabled { get; set; }
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public bool UseSsl { get; set; } = true;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FromEmail { get; set; } = "no-reply@meeting-platform.local";
    public string FromName { get; set; } = "Online Meeting Platform";
}

public interface IEmailSender
{
    Task SendMeetingInviteAsync(Meeting meeting, string recipientEmail);
    Task SendConversationInviteAsync(Conversation conversation, string recipientEmail, string inviterName);
}

public class SmtpEmailSender : IEmailSender
{
    private readonly EmailOptions _options;
    private readonly ILogger<SmtpEmailSender> _logger;

    public SmtpEmailSender(IOptions<EmailOptions> options, ILogger<SmtpEmailSender> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task SendMeetingInviteAsync(Meeting meeting, string recipientEmail)
    {
        if (!_options.Enabled || string.IsNullOrWhiteSpace(_options.Host))
        {
            _logger.LogInformation("Email invite skipped because SMTP is disabled. Recipient: {RecipientEmail}, Meeting: {MeetingId}", recipientEmail, meeting.Id);
            return;
        }

        using var message = new MailMessage
        {
            From = new MailAddress(_options.FromEmail, _options.FromName),
            Subject = $"Meeting invitation: {meeting.Title}",
            Body = BuildInviteBody(meeting),
            IsBodyHtml = true
        };
        message.To.Add(recipientEmail);

        using var client = new SmtpClient(_options.Host, _options.Port)
        {
            EnableSsl = _options.UseSsl
        };

        if (!string.IsNullOrWhiteSpace(_options.Username))
        {
            client.Credentials = new NetworkCredential(_options.Username, _options.Password);
        }

        await client.SendMailAsync(message);
        _logger.LogInformation("Meeting invite email sent. Recipient: {RecipientEmail}, Meeting: {MeetingId}", recipientEmail, meeting.Id);
    }

    public async Task SendConversationInviteAsync(Conversation conversation, string recipientEmail, string inviterName)
    {
        if (!_options.Enabled || string.IsNullOrWhiteSpace(_options.Host))
        {
            _logger.LogInformation("Chat invite skipped because SMTP is disabled. Recipient: {RecipientEmail}, Conversation: {ConversationId}", recipientEmail, conversation.Id);
            return;
        }

        using var message = new MailMessage
        {
            From = new MailAddress(_options.FromEmail, _options.FromName),
            Subject = $"Chat invitation: {ResolveConversationTitle(conversation)}",
            Body = BuildConversationInviteBody(conversation, inviterName),
            IsBodyHtml = true
        };
        message.To.Add(recipientEmail);

        using var client = new SmtpClient(_options.Host, _options.Port)
        {
            EnableSsl = _options.UseSsl
        };

        if (!string.IsNullOrWhiteSpace(_options.Username))
        {
            client.Credentials = new NetworkCredential(_options.Username, _options.Password);
        }

        await client.SendMailAsync(message);
        _logger.LogInformation("Chat invite email sent. Recipient: {RecipientEmail}, Conversation: {ConversationId}", recipientEmail, conversation.Id);
    }

    private static string BuildInviteBody(Meeting meeting)
    {
        var start = meeting.StartTime.ToLocalTime().ToString("f");
        var end = meeting.EndTime?.ToLocalTime().ToString("t");
        var joinLink = meeting.MeetingLink ?? string.Empty;
        var location = string.IsNullOrWhiteSpace(meeting.Location) ? "Online" : meeting.Location;

        return $"""
            <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0f172a">
              <h2>{WebUtility.HtmlEncode(meeting.Title)}</h2>
              <p>You have been invited to a meeting.</p>
              <p><strong>When:</strong> {WebUtility.HtmlEncode(start)}{(string.IsNullOrWhiteSpace(end) ? string.Empty : $" - {WebUtility.HtmlEncode(end)}")}</p>
              <p><strong>Location:</strong> {WebUtility.HtmlEncode(location)}</p>
              {(string.IsNullOrWhiteSpace(meeting.Description) ? string.Empty : $"<p><strong>Agenda:</strong> {WebUtility.HtmlEncode(meeting.Description)}</p>")}
              {(string.IsNullOrWhiteSpace(joinLink) ? string.Empty : $"<p><a href=\"{WebUtility.HtmlEncode(joinLink)}\" style=\"display:inline-block;background:#2563eb;color:white;padding:10px 16px;text-decoration:none;border-radius:6px\">Join meeting</a></p><p>{WebUtility.HtmlEncode(joinLink)}</p>")}
            </div>
            """;
    }

    private static string BuildConversationInviteBody(Conversation conversation, string inviterName)
    {
        var title = ResolveConversationTitle(conversation);
        const string chatLink = "http://localhost:5173/chat";

        return $"""
            <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0f172a">
              <h2>{WebUtility.HtmlEncode(title)}</h2>
              <p>{WebUtility.HtmlEncode(inviterName)} invited you to chat.</p>
              <p><a href="{chatLink}" style="display:inline-block;background:#2563eb;color:white;padding:10px 16px;text-decoration:none;border-radius:6px">Open chat</a></p>
              <p>{chatLink}</p>
            </div>
            """;
    }

    private static string ResolveConversationTitle(Conversation conversation)
    {
        return string.IsNullOrWhiteSpace(conversation.Title)
            ? (conversation.Type == ConversationType.Group ? "Group chat" : "Direct chat")
            : conversation.Title;
    }
}
