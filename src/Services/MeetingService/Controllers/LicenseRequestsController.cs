using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MeetingService.Models;
using MeetingService.Services;
using Samvaad.Common.Events;

namespace MeetingService.Controllers;

[ApiController]
[Route("api/license-requests")]
[Authorize]
public class LicenseRequestsController : ControllerBase
{
    private readonly IIntegrationEventOutbox _outbox;
    private readonly IOrganizationTenantContext _tenantContext;
    private readonly ILogger<LicenseRequestsController> _logger;

    public LicenseRequestsController(
        IIntegrationEventOutbox outbox,
        IOrganizationTenantContext tenantContext,
        ILogger<LicenseRequestsController> logger)
    {
        _outbox = outbox;
        _tenantContext = tenantContext;
        _logger = logger;
    }

    [HttpPost]
    public async Task<ActionResult<LicensePurchaseResponse>> Create([FromBody] LicensePurchaseRequest request)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        var companyName = ResolveCompanyName(request);
        var companySamvaadEmail = string.IsNullOrWhiteSpace(request.CompanySamvaadEmail)
            ? BuildCompanySamvaadEmail(companyName)
            : request.CompanySamvaadEmail.Trim().ToLowerInvariant();
        var validationError = Validate(request, companyName, companySamvaadEmail);
        if (!string.IsNullOrWhiteSpace(validationError))
        {
            return BadRequest(validationError);
        }

        var currentUserName = GetCurrentUserName();
        var currentUserEmail = GetCurrentUserEmail() ?? request.ContactEmail.Trim();
        var reference = $"LIC-{DateTime.UtcNow:yyyyMMddHHmmss}-{Random.Shared.Next(1000, 9999)}";

        var licenseRequest = new LicenseRequestEmail
        {
            Reference = reference,
            RequestedByUserId = userId,
            RequestedAtUtc = DateTime.UtcNow,
            OrganizationId = _tenantContext.OrganizationId,
            OrganizationSlug = string.IsNullOrWhiteSpace(request.OrganizationSlug) ? _tenantContext.OrganizationSlug : request.OrganizationSlug.Trim(),
            CompanyName = companyName,
            CompanySamvaadEmail = companySamvaadEmail,
            PlanName = request.PlanName.Trim(),
            BillingCycle = request.BillingCycle.Trim(),
            SeatCount = request.SeatCount,
            EstimatedAmount = request.EstimatedAmount,
            Currency = string.IsNullOrWhiteSpace(request.Currency) ? "INR" : request.Currency.Trim().ToUpperInvariant(),
            RequestedByName = currentUserName,
            RequestedByEmail = currentUserEmail,
            ContactName = request.ContactName.Trim(),
            ContactEmail = request.ContactEmail.Trim(),
            Phone = request.Phone?.Trim(),
            Notes = request.Notes?.Trim(),
            PaymentLast4 = request.PaymentLast4?.Trim()
        };

        try
        {
            await _outbox.EnqueueAsync(new LicenseRequestSubmittedEvent(
                Guid.NewGuid(),
                DateTime.UtcNow,
                licenseRequest.Reference,
                licenseRequest.RequestedByUserId,
                licenseRequest.RequestedAtUtc,
                licenseRequest.OrganizationId,
                licenseRequest.OrganizationSlug,
                licenseRequest.CompanyName,
                licenseRequest.CompanySamvaadEmail,
                licenseRequest.PlanName,
                licenseRequest.BillingCycle,
                licenseRequest.SeatCount,
                licenseRequest.EstimatedAmount,
                licenseRequest.Currency,
                licenseRequest.RequestedByName,
                licenseRequest.RequestedByEmail,
                licenseRequest.ContactName,
                licenseRequest.ContactEmail,
                licenseRequest.Phone,
                licenseRequest.Notes,
                licenseRequest.PaymentLast4));
            await _outbox.SaveChangesAsync();
            return Ok(new LicensePurchaseResponse
            {
                Reference = reference,
                Message = "License request sent. The Samvaad team will contact you shortly."
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending license request email. Reference: {Reference}", reference);
            return StatusCode(StatusCodes.Status500InternalServerError, "Unable to send license request");
        }
    }

    private static string? Validate(LicensePurchaseRequest request, string companyName, string companySamvaadEmail)
    {
        if (string.IsNullOrWhiteSpace(request.PlanName))
        {
            return "Select a license plan";
        }

        if (request.SeatCount <= 0)
        {
            return "Seat count must be greater than zero";
        }

        if (string.IsNullOrWhiteSpace(companyName))
        {
            return "Company name is required";
        }

        if (string.IsNullOrWhiteSpace(companySamvaadEmail) || !companySamvaadEmail.EndsWith("@samvaad.com", StringComparison.OrdinalIgnoreCase))
        {
            return "Company Samvaad email must end with @samvaad.com";
        }

        if (string.IsNullOrWhiteSpace(request.ContactName))
        {
            return "Contact name is required";
        }

        if (string.IsNullOrWhiteSpace(request.ContactEmail) || !request.ContactEmail.Contains('@'))
        {
            return "A valid contact email is required";
        }

        if (string.IsNullOrWhiteSpace(request.BillingCycle))
        {
            return "Billing cycle is required";
        }

        return null;
    }

    private static string ResolveCompanyName(LicensePurchaseRequest request)
    {
        return !string.IsNullOrWhiteSpace(request.CompanyName)
            ? request.CompanyName.Trim()
            : request.OrganizationName?.Trim() ?? string.Empty;
    }

    private static string BuildCompanySamvaadEmail(string companyName)
    {
        var aliasBuilder = new System.Text.StringBuilder();
        var previousWasDot = false;

        foreach (var character in companyName.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(character))
            {
                aliasBuilder.Append(character);
                previousWasDot = false;
                continue;
            }

            if (!previousWasDot && aliasBuilder.Length > 0)
            {
                aliasBuilder.Append('.');
                previousWasDot = true;
            }
        }

        var alias = aliasBuilder.ToString().Trim('.');
        return $"{(string.IsNullOrWhiteSpace(alias) ? "company" : alias)}@samvaad.com";
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(userIdClaim, out userId);
    }

    private string? GetCurrentUserEmail()
    {
        return User.FindFirst(ClaimTypes.Email)?.Value;
    }

    private string GetCurrentUserName()
    {
        var firstName = User.FindFirst(ClaimTypes.GivenName)?.Value;
        var lastName = User.FindFirst(ClaimTypes.Surname)?.Value;
        var fullName = $"{firstName} {lastName}".Trim();
        return string.IsNullOrWhiteSpace(fullName) ? GetCurrentUserEmail() ?? "User" : fullName;
    }
}
