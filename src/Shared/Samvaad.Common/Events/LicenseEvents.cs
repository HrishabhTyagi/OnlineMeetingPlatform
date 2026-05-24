using Samvaad.Common.Messaging;

namespace Samvaad.Common.Events;

[RabbitEvent("license.request.submitted")]
public sealed record LicenseRequestSubmittedEvent(
    Guid EventId,
    DateTime OccurredAtUtc,
    string Reference,
    Guid RequestedByUserId,
    DateTime RequestedAtUtc,
    Guid? OrganizationId,
    string? OrganizationSlug,
    string CompanyName,
    string CompanySamvaadEmail,
    string PlanName,
    string BillingCycle,
    int SeatCount,
    decimal EstimatedAmount,
    string Currency,
    string RequestedByName,
    string RequestedByEmail,
    string ContactName,
    string ContactEmail,
    string? Phone,
    string? Notes,
    string? PaymentLast4) : IEvent;
