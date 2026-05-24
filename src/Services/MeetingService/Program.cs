using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using MeetingService.Data;
using MeetingService.Services;
using Samvaad.Common.Caching;
using Samvaad.Common.Messaging;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = builder.Configuration.GetValue<long?>("Security:MaxRequestBodyBytes")
        ?? (builder.Environment.IsDevelopment() ? 750_000_000 : 104_857_600);
});

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .WriteTo.Console()
    .CreateLogger();

builder.Host.UseSerilog();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddDataProtection();
builder.Services.AddSamvaadRedisCache(builder.Configuration);

var defaultConnection = GetRequiredConnectionString(builder.Configuration, builder.Environment);
builder.Services.AddDbContext<MeetingDbContext>(options =>
    options.UseNpgsql(defaultConnection)
);

var jwtSettings = builder.Configuration.GetSection("JwtSettings");
var secretKey = GetJwtSecret(jwtSettings, builder.Environment);
var signingKey = CreateJwtSigningKey(secretKey);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = signingKey,
        IssuerSigningKeyResolver = (_, _, _, _) => new[] { signingKey },
        ValidateIssuer = true,
        ValidIssuer = jwtSettings["Issuer"],
        ValidateAudience = true,
        ValidAudience = jwtSettings["Audience"],
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IOrganizationTenantContext, OrganizationTenantContext>();
builder.Services.AddScoped<IMeetingService, MeetingServiceImpl>();
builder.Services.AddScoped<ITeamSpaceService, TeamSpaceService>();
builder.Services.AddScoped<IOrganizationStorageService, OrganizationStorageService>();
builder.Services.AddScoped<IExternalCalendarSyncService, ExternalCalendarSyncService>();
builder.Services.Configure<IntegrationEventOutboxOptions>(builder.Configuration.GetSection("IntegrationOutbox"));
builder.Services.AddScoped<IIntegrationEventOutbox, EfIntegrationEventOutbox>();
builder.Services.AddScoped<IIntegrationEventConsumerCheckpointStore, EfIntegrationEventConsumerCheckpointStore>();
builder.Services.AddHostedService<IntegrationEventOutboxDispatcher>();
builder.Services.AddHostedService<ScheduledConversationMessageDispatcher>();
builder.Services.AddHostedService<OrganizationStorageRetentionWorker>();
builder.Services.AddHttpClient("CalendarSync");
builder.Services.AddHttpClient("NotificationService", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["NotificationService:BaseUrl"] ?? "http://localhost:5003");
});
builder.Services.AddHttpClient("OrganizationService", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["OrganizationService:BaseUrl"] ?? "http://localhost:5004");
    var internalApiKey = builder.Configuration["InternalService:ApiKey"];
    if (!string.IsNullOrWhiteSpace(internalApiKey))
    {
        client.DefaultRequestHeaders.TryAddWithoutValidation("X-Samvaad-Internal-Key", internalApiKey);
    }
});
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection("Email"));
builder.Services.Configure<CalendarSyncOptions>(builder.Configuration.GetSection("CalendarSync"));
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
builder.Services.AddRabbitMqEventBus(builder.Configuration, typeof(Program).Assembly);

var allowedOrigins = GetAllowedOrigins(builder.Configuration, builder.Environment, "http://localhost:5173", "http://localhost:5174", "http://localhost:3000");
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
else
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

UseSecurityHeaders(app);
app.UseCors("AllowFrontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<MeetingDbContext>();
    db.Database.Migrate();
}

app.Run("http://localhost:5002");

static string GetRequiredConnectionString(IConfiguration configuration, IWebHostEnvironment environment)
{
    var connectionString = configuration.GetConnectionString("DefaultConnection");
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        throw new InvalidOperationException("ConnectionStrings:DefaultConnection must be configured.");
    }

    if (!environment.IsDevelopment() && connectionString.Contains("Password=postgres123", StringComparison.OrdinalIgnoreCase))
    {
        throw new InvalidOperationException("Production database password must not use the local development default.");
    }

    return connectionString;
}

static byte[] GetJwtSecret(IConfigurationSection jwtSettings, IWebHostEnvironment environment)
{
    var secret = jwtSettings["SecretKey"];
    var isPlaceholder = string.IsNullOrWhiteSpace(secret)
        || secret.Contains("change-in-production", StringComparison.OrdinalIgnoreCase)
        || secret.Contains("development-only", StringComparison.OrdinalIgnoreCase);

    if (!environment.IsDevelopment() && isPlaceholder)
    {
        throw new InvalidOperationException("JwtSettings:SecretKey must be configured with a production secret.");
    }

    if (string.IsNullOrWhiteSpace(secret) || Encoding.UTF8.GetByteCount(secret) < 32)
    {
        throw new InvalidOperationException("JwtSettings:SecretKey must be at least 32 bytes.");
    }

    return Encoding.UTF8.GetBytes(secret);
}

static SymmetricSecurityKey CreateJwtSigningKey(byte[] secretKey)
{
    return new SymmetricSecurityKey(secretKey)
    {
        KeyId = "samvaad-shared-jwt-key"
    };
}

static string[] GetAllowedOrigins(IConfiguration configuration, IWebHostEnvironment environment, params string[] developmentDefaults)
{
    var origins = configuration.GetSection("Security:AllowedOrigins").Get<string[]>()
        ?.Where(origin => !string.IsNullOrWhiteSpace(origin))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray() ?? Array.Empty<string>();

    if (origins.Length > 0)
    {
        return origins;
    }

    if (environment.IsDevelopment())
    {
        return developmentDefaults;
    }

    throw new InvalidOperationException("Security:AllowedOrigins must be configured in production.");
}

static void UseSecurityHeaders(WebApplication app)
{
    app.Use(async (context, next) =>
    {
        var headers = context.Response.Headers;
        headers.TryAdd("X-Content-Type-Options", "nosniff");
        headers.TryAdd("X-Frame-Options", "DENY");
        headers.TryAdd("Referrer-Policy", "strict-origin-when-cross-origin");
        headers.TryAdd("Permissions-Policy", "geolocation=(), camera=(self), microphone=(self), display-capture=(self)");
        await next();
    });
}
