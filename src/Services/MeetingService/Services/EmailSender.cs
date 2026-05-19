using System.Net;
using System.Net.Mail;
using System.Text;
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
    public string FromEmail { get; set; } = "no-reply@samvaad.local";
    public string FromName { get; set; } = "Samvaad";
    public string LicenseRequestsToEmail { get; set; } = "sales@samvaad.local";
}

public interface IEmailSender
{
    Task SendMeetingInviteAsync(Meeting meeting, MeetingInvite invite);
    Task SendConversationInviteAsync(Conversation conversation, string recipientEmail, string inviterName);
    Task SendDocumentShareAsync(Conversation conversation, ConversationMessage message, string recipientEmail, string senderName, string? optionalMessage);
    Task SendLicenseRequestAsync(LicenseRequestEmail request);
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

    public async Task SendMeetingInviteAsync(Meeting meeting, MeetingInvite invite)
    {
        var recipientEmail = invite.Email;
        if (!_options.Enabled || string.IsNullOrWhiteSpace(_options.Host))
        {
            _logger.LogInformation("Email invite skipped because SMTP is disabled. Recipient: {RecipientEmail}, Meeting: {MeetingId}", recipientEmail, meeting.Id);
            return;
        }

        using var message = new MailMessage
        {
            From = new MailAddress(_options.FromEmail, _options.FromName),
            Subject = $"Meeting invitation: {meeting.Title}",
            Body = BuildInviteBody(meeting, invite),
            IsBodyHtml = true
        };
        message.To.Add(recipientEmail);
        message.Attachments.Add(BuildCalendarAttachment(meeting, invite));

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

    public async Task SendDocumentShareAsync(Conversation conversation, ConversationMessage sharedMessage, string recipientEmail, string senderName, string? optionalMessage)
    {
        if (!_options.Enabled || string.IsNullOrWhiteSpace(_options.Host))
        {
            _logger.LogInformation("Document share skipped because SMTP is disabled. Recipient: {RecipientEmail}, Conversation: {ConversationId}", recipientEmail, conversation.Id);
            return;
        }

        using var message = new MailMessage
        {
            From = new MailAddress(_options.FromEmail, _options.FromName),
            Subject = $"Shared document: {sharedMessage.AttachmentFileName ?? "Samvaad file"}",
            Body = BuildDocumentShareBody(conversation, sharedMessage, senderName, optionalMessage),
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
        _logger.LogInformation("Document share email sent. Recipient: {RecipientEmail}, Message: {MessageId}", recipientEmail, sharedMessage.Id);
    }

    public async Task SendLicenseRequestAsync(LicenseRequestEmail request)
    {
        if (!_options.Enabled || string.IsNullOrWhiteSpace(_options.Host))
        {
            _logger.LogInformation("License request email skipped because SMTP is disabled. Reference: {Reference}", request.Reference);
            return;
        }

        using var message = new MailMessage
        {
            From = new MailAddress(_options.FromEmail, _options.FromName),
            Subject = $"License request: {request.CompanyName} - {request.PlanName}",
            Body = BuildLicenseRequestBody(request),
            IsBodyHtml = true
        };

        message.To.Add(string.IsNullOrWhiteSpace(_options.LicenseRequestsToEmail) ? _options.FromEmail : _options.LicenseRequestsToEmail);
        if (!string.IsNullOrWhiteSpace(request.ContactEmail))
        {
            message.ReplyToList.Add(new MailAddress(request.ContactEmail, request.ContactName));
        }

        using var client = new SmtpClient(_options.Host, _options.Port)
        {
            EnableSsl = _options.UseSsl
        };

        if (!string.IsNullOrWhiteSpace(_options.Username))
        {
            client.Credentials = new NetworkCredential(_options.Username, _options.Password);
        }

        await client.SendMailAsync(message);
        _logger.LogInformation("License request email sent. Reference: {Reference}, Company: {Company}", request.Reference, request.CompanyName);
    }

    private Attachment BuildCalendarAttachment(Meeting meeting, MeetingInvite invite)
    {
        var calendar = BuildCalendarInvite(meeting, invite);
        var stream = new MemoryStream(Encoding.UTF8.GetBytes(calendar));
        var attachment = new Attachment(stream, "samvaad-meeting.ics", "text/calendar");
        attachment.ContentType.Parameters.Add("method", "REQUEST");
        attachment.ContentType.Parameters.Add("charset", "UTF-8");
        return attachment;
    }

    private string BuildCalendarInvite(Meeting meeting, MeetingInvite invite)
    {
        var start = ToIcsDate(meeting.StartTime);
        var end = ToIcsDate(meeting.EndTime ?? meeting.StartTime.AddMinutes(meeting.DurationMinutes ?? 60));
        var location = string.IsNullOrWhiteSpace(meeting.Location)
            ? (meeting.IsOnlineMeeting ? "Online meeting" : string.Empty)
            : meeting.Location;
        var joinLink = meeting.MeetingLink ?? string.Empty;
        var descriptionParts = new List<string>();
        if (!string.IsNullOrWhiteSpace(meeting.Description))
        {
            descriptionParts.Add(meeting.Description);
        }

        if (!string.IsNullOrWhiteSpace(joinLink))
        {
            descriptionParts.Add($"Join Samvaad meeting: {joinLink}");
        }

        return string.Join("\r\n", new[]
        {
            "BEGIN:VCALENDAR",
            "PRODID:-//Samvaad//Meeting Platform//EN",
            "VERSION:2.0",
            "CALSCALE:GREGORIAN",
            "METHOD:REQUEST",
            "BEGIN:VEVENT",
            $"UID:{meeting.Id}@samvaad",
            $"DTSTAMP:{ToIcsDate(DateTime.UtcNow)}",
            $"DTSTART:{start}",
            $"DTEND:{end}",
            $"SUMMARY:{IcsText(meeting.Title)}",
            $"DESCRIPTION:{IcsText(string.Join("\n\n", descriptionParts))}",
            $"LOCATION:{IcsText(location)}",
            $"URL:{IcsText(joinLink)}",
            $"ORGANIZER;CN={IcsText(_options.FromName)}:mailto:{_options.FromEmail}",
            $"ATTENDEE;CN={IcsText(invite.DisplayName ?? invite.Email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:{invite.Email}",
            "STATUS:CONFIRMED",
            "TRANSP:OPAQUE",
            "END:VEVENT",
            "END:VCALENDAR",
            string.Empty
        });
    }

    private static string BuildInviteBody(Meeting meeting, MeetingInvite invite)
    {
        var start = meeting.StartTime.ToLocalTime().ToString("f");
        var end = meeting.EndTime?.ToLocalTime().ToString("t");
        var joinLink = meeting.MeetingLink ?? string.Empty;
        var acceptLink = BuildResponseLink(meeting, invite, MeetingInviteResponseStatus.Accepted);
        var tentativeLink = BuildResponseLink(meeting, invite, MeetingInviteResponseStatus.Tentative);
        var declineLink = BuildResponseLink(meeting, invite, MeetingInviteResponseStatus.Declined);
        var location = string.IsNullOrWhiteSpace(meeting.Location)
            ? (meeting.IsOnlineMeeting ? "Online meeting" : "In person")
            : meeting.Location;
        var duration = ResolveDurationLabel(meeting);
        var recurrence = ResolveRecurrenceLabel(meeting.RecurrenceRule);
        var attendees = SplitEmails(meeting.AttendeeEmails);
        var attendeeLine = attendees.Count == 0
            ? string.Empty
            : $"<p><strong>Attendees:</strong> {string.Join(", ", attendees.Select(WebUtility.HtmlEncode))}</p>";
        var optionItems = new[]
        {
            meeting.LobbyEnabled ? "Lobby enabled" : "Lobby disabled",
            meeting.AllowChat ? "Chat enabled" : "Chat disabled",
            meeting.AllowScreenShare ? "Screen sharing enabled" : "Screen sharing disabled",
            meeting.AllowRecording ? "Recording allowed" : "Recording disabled"
        };
        var optionsList = string.Join("", optionItems.Select(item => $"<li>{WebUtility.HtmlEncode(item)}</li>"));

        return $"""
            <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0f172a">
              <h2>{WebUtility.HtmlEncode(meeting.Title)}</h2>
              <p>You have been invited to a meeting.</p>
              <p><strong>When:</strong> {WebUtility.HtmlEncode(start)}{(string.IsNullOrWhiteSpace(end) ? string.Empty : $" - {WebUtility.HtmlEncode(end)}")}</p>
              <p><strong>Duration:</strong> {WebUtility.HtmlEncode(duration)}</p>
              <p><strong>Repeat:</strong> {WebUtility.HtmlEncode(recurrence)}</p>
              <p><strong>Location:</strong> {WebUtility.HtmlEncode(location)}</p>
              {attendeeLine}
              <p><strong>Options:</strong></p>
              <ul>{optionsList}</ul>
              {(string.IsNullOrWhiteSpace(meeting.Description) ? string.Empty : $"<p><strong>Agenda:</strong><br>{HtmlText(meeting.Description)}</p>")}
              <p><strong>Response:</strong></p>
              <p>
                <a href="{WebUtility.HtmlEncode(acceptLink)}" style="display:inline-block;background:#16a34a;color:white;padding:10px 16px;text-decoration:none;border-radius:6px;margin-right:8px">Accept</a>
                <a href="{WebUtility.HtmlEncode(tentativeLink)}" style="display:inline-block;background:#d97706;color:white;padding:10px 16px;text-decoration:none;border-radius:6px;margin-right:8px">Tentative</a>
                <a href="{WebUtility.HtmlEncode(declineLink)}" style="display:inline-block;background:#dc2626;color:white;padding:10px 16px;text-decoration:none;border-radius:6px">Decline</a>
              </p>
              {(string.IsNullOrWhiteSpace(joinLink) ? string.Empty : $"<p><a href=\"{WebUtility.HtmlEncode(joinLink)}\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"display:inline-block;background:#2563eb;color:white;padding:10px 16px;text-decoration:none;border-radius:6px\">Join meeting</a></p><p>{WebUtility.HtmlEncode(joinLink)}</p>")}
              <p style="color:#475569;font-size:13px">A calendar invite is attached to this email. Use the response buttons above or open the meeting in Samvaad to add a response reason.</p>
            </div>
            """;
    }

    private static string BuildResponseLink(Meeting meeting, MeetingInvite invite, MeetingInviteResponseStatus status)
    {
        var baseLink = string.IsNullOrWhiteSpace(meeting.MeetingLink)
            ? $"http://localhost:5173/meeting/{meeting.Id}"
            : meeting.MeetingLink;

        return AppendQuery(baseLink, $"response={Uri.EscapeDataString(status.ToString())}&inviteId={Uri.EscapeDataString(invite.Id.ToString())}");
    }

    private static string AppendQuery(string url, string query)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return url;
        }

        return $"{url}{(url.Contains('?') ? '&' : '?')}{query.TrimStart('?')}";
    }

    private static string ToIcsDate(DateTime value)
    {
        return value.ToUniversalTime().ToString("yyyyMMdd'T'HHmmss'Z'");
    }

    private static string IcsText(string? value)
    {
        return (value ?? string.Empty)
            .Replace("\\", "\\\\")
            .Replace(";", "\\;")
            .Replace(",", "\\,")
            .Replace("\r\n", "\\n")
            .Replace("\n", "\\n");
    }

    private static string ResolveDurationLabel(Meeting meeting)
    {
        var minutes = meeting.DurationMinutes
            ?? (meeting.EndTime.HasValue ? Math.Max(15, (int)Math.Round((meeting.EndTime.Value - meeting.StartTime).TotalMinutes)) : 60);

        return minutes < 60
            ? $"{minutes} minutes"
            : $"{minutes / 60d:0.#} hours";
    }

    private static string ResolveRecurrenceLabel(string? recurrenceRule)
    {
        return recurrenceRule switch
        {
            "Daily" => "Daily",
            "Weekdays" => "Every weekday",
            "Weekly" => "Weekly",
            _ => "Does not repeat"
        };
    }

    private static IReadOnlyList<string> SplitEmails(string? emails)
    {
        if (string.IsNullOrWhiteSpace(emails))
        {
            return Array.Empty<string>();
        }

        return emails
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(email => !string.IsNullOrWhiteSpace(email))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string HtmlText(string value)
    {
        return WebUtility.HtmlEncode(value).Replace("\n", "<br>");
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

    private static string BuildDocumentShareBody(Conversation conversation, ConversationMessage message, string senderName, string? optionalMessage)
    {
        var title = ResolveConversationTitle(conversation);
        var fileName = message.AttachmentFileName ?? "Shared document";
        var fileUrl = string.IsNullOrWhiteSpace(message.AttachmentUrl)
            ? "http://localhost:5173/chat"
            : $"http://localhost:5000{message.AttachmentUrl}";

        return $"""
            <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0f172a">
              <h2>{WebUtility.HtmlEncode(fileName)}</h2>
              <p>{WebUtility.HtmlEncode(senderName)} shared a document from {WebUtility.HtmlEncode(title)}.</p>
              {(string.IsNullOrWhiteSpace(optionalMessage) ? string.Empty : $"<p>{HtmlText(optionalMessage)}</p>")}
              <p><a href="{WebUtility.HtmlEncode(fileUrl)}" style="display:inline-block;background:#0f766e;color:white;padding:10px 16px;text-decoration:none;border-radius:6px">Open document</a></p>
              <p>{WebUtility.HtmlEncode(fileUrl)}</p>
            </div>
            """;
    }

    private static string BuildLicenseRequestBody(LicenseRequestEmail request)
    {
        var amount = request.EstimatedAmount <= 0
            ? "Not calculated"
            : $"{request.Currency} {request.EstimatedAmount:N0}";
        var payment = string.IsNullOrWhiteSpace(request.PaymentLast4)
            ? "Simulated payment details were not provided"
            : $"Simulated card ending {request.PaymentLast4}";

        return $"""
            <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0f172a">
              <h2>Samvaad license request</h2>
              <p><strong>Reference:</strong> {WebUtility.HtmlEncode(request.Reference)}</p>
              <p><strong>Requested at:</strong> {WebUtility.HtmlEncode(request.RequestedAtUtc.ToString("u"))}</p>
              <table style="border-collapse:collapse;margin-top:16px">
                <tr><td style="padding:6px 16px 6px 0;color:#475569">Company</td><td style="padding:6px 0"><strong>{WebUtility.HtmlEncode(request.CompanyName)}</strong></td></tr>
                <tr><td style="padding:6px 16px 6px 0;color:#475569">Company Samvaad email</td><td style="padding:6px 0"><strong>{WebUtility.HtmlEncode(request.CompanySamvaadEmail)}</strong></td></tr>
                <tr><td style="padding:6px 16px 6px 0;color:#475569">Plan</td><td style="padding:6px 0">{WebUtility.HtmlEncode(request.PlanName)}</td></tr>
                <tr><td style="padding:6px 16px 6px 0;color:#475569">Billing</td><td style="padding:6px 0">{WebUtility.HtmlEncode(request.BillingCycle)}</td></tr>
                <tr><td style="padding:6px 16px 6px 0;color:#475569">Seats</td><td style="padding:6px 0">{request.SeatCount}</td></tr>
                <tr><td style="padding:6px 16px 6px 0;color:#475569">Estimated amount</td><td style="padding:6px 0">{WebUtility.HtmlEncode(amount)}</td></tr>
                <tr><td style="padding:6px 16px 6px 0;color:#475569">Payment</td><td style="padding:6px 0">{WebUtility.HtmlEncode(payment)}</td></tr>
                <tr><td style="padding:6px 16px 6px 0;color:#475569">Owner action</td><td style="padding:6px 0">Create and configure the organization from Samvaad Admin</td></tr>
              </table>
              <h3 style="margin-top:20px">Contact</h3>
              <p>
                <strong>{WebUtility.HtmlEncode(request.ContactName)}</strong><br>
                {WebUtility.HtmlEncode(request.ContactEmail)}
                {(string.IsNullOrWhiteSpace(request.Phone) ? string.Empty : $"<br>{WebUtility.HtmlEncode(request.Phone)}")}
              </p>
              <h3 style="margin-top:20px">Requester</h3>
              <p>
                {WebUtility.HtmlEncode(request.RequestedByName)}<br>
                {WebUtility.HtmlEncode(request.RequestedByEmail)}<br>
                User ID: {request.RequestedByUserId}
              </p>
              {(string.IsNullOrWhiteSpace(request.Notes) ? string.Empty : $"<h3 style=\"margin-top:20px\">Notes</h3><p>{HtmlText(request.Notes)}</p>")}
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
