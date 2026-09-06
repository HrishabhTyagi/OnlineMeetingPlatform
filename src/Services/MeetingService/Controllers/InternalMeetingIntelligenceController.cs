using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MeetingService.Models;
using MeetingService.Services;

namespace MeetingService.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/internal/meetings")]
public sealed class InternalMeetingIntelligenceController : ControllerBase
{
    private readonly IMeetingService _meetingService;
    private readonly IOrganizationStorageService _storageService;
    private readonly IConfiguration _configuration;

    public InternalMeetingIntelligenceController(
        IMeetingService meetingService,
        IOrganizationStorageService storageService,
        IConfiguration configuration)
    {
        _meetingService = meetingService;
        _storageService = storageService;
        _configuration = configuration;
    }

    [HttpGet("{id:guid}/recording")]
    public async Task<IActionResult> DownloadRecording(Guid id)
    {
        if (!HasValidApiKey())
        {
            return Unauthorized();
        }

        var meeting = await _meetingService.GetMeetingByIdAsync(id);
        if (meeting?.RecordingUrl == null)
        {
            return NotFound();
        }

        var fileName = Path.GetFileName(Uri.UnescapeDataString(meeting.RecordingUrl));
        var filePath = await _storageService.GetPhysicalPathAsync(OrganizationFileKind.Recording, id, fileName);
        return filePath == null ? NotFound() : PhysicalFile(filePath, "video/webm", enableRangeProcessing: true);
    }

    [HttpPost("{id:guid}/intelligence")]
    public async Task<ActionResult<MeetingIntelligenceDto>> Complete(Guid id, [FromBody] CompleteMeetingIntelligenceRequest request)
    {
        if (!HasValidApiKey())
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.RecordingUrl))
        {
            return BadRequest("RecordingUrl is required");
        }

        try
        {
            var intelligence = await _meetingService.CompleteMeetingIntelligenceAsync(id, request);
            return Ok(MeetingsController.MapIntelligenceToDto(intelligence));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }

    private bool HasValidApiKey()
    {
        var expectedApiKey = _configuration["InternalService:ApiKey"];
        var providedApiKey = Request.Headers["X-Samvaad-Internal-Key"].ToString();
        return !string.IsNullOrWhiteSpace(expectedApiKey)
            && string.Equals(expectedApiKey, providedApiKey, StringComparison.Ordinal);
    }
}