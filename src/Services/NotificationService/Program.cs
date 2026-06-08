using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using NotificationService.Data;
using NotificationService.Hubs;
using NotificationService.Services;
using Samvaad.Common.Messaging;

var builder = WebApplication.CreateBuilder(args);

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .WriteTo.Console()
    .CreateLogger();

builder.Host.UseSerilog();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddSignalR();

var notificationConnection = builder.Configuration.GetConnectionString("DefaultConnection");
var rabbitEnabled = builder.Configuration.GetValue<bool>("RabbitMq:Enabled");
if (!string.IsNullOrWhiteSpace(notificationConnection))
{
    builder.Services.AddDbContext<NotificationDbContext>(options => options.UseNpgsql(notificationConnection));
    builder.Services.AddScoped<INotificationEventCheckpointStore, EfNotificationEventCheckpointStore>();
    builder.Services.AddHttpClient<INotificationPushSender, ExpoNotificationPushSender>();
}
else
{
    if (rabbitEnabled && !builder.Environment.IsDevelopment())
    {
        throw new InvalidOperationException("ConnectionStrings:DefaultConnection is required for persistent notification event idempotency when RabbitMQ is enabled.");
    }

    builder.Services.AddSingleton<INotificationEventCheckpointStore, InMemoryNotificationEventCheckpointStore>();
    builder.Services.AddSingleton<INotificationPushSender, NoopNotificationPushSender>();
}

builder.Services.AddRabbitMqEventBus(builder.Configuration, typeof(Program).Assembly);

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

    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

var allowedOrigins = GetAllowedOrigins(builder.Configuration, builder.Environment, "http://localhost:5173", "http://localhost:5174", "http://localhost:3000", "http://localhost:8091");
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
app.MapHub<NotificationHub>("/hubs/notifications");

if (!string.IsNullOrWhiteSpace(notificationConnection))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<NotificationDbContext>();
    db.Database.Migrate();
}

app.Run("http://localhost:5003");

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
