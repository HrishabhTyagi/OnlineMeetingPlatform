using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using Samvaad.Common.Caching;
using Serilog;
using UserService.Data;
using UserService.Services;

var builder = WebApplication.CreateBuilder(args);

// Logging
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .WriteTo.Console()
    .CreateLogger();

builder.Host.UseSerilog();

// Add services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Database
var defaultConnection = GetRequiredConnectionString(builder.Configuration, builder.Environment);
builder.Services.AddDbContext<UserDbContext>(options =>
    options.UseNpgsql(defaultConnection)
);

// Authentication
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

// Services
var dataProtectionKeysPath = Path.Combine(builder.Environment.ContentRootPath, "DataProtectionKeys");
Directory.CreateDirectory(dataProtectionKeysPath);
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionKeysPath))
    .SetApplicationName("Samvaad.UserService");
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IMfaService, MfaService>();
builder.Services.AddScoped<IUserService, UserServiceImpl>();
builder.Services.AddSamvaadRedisCache(builder.Configuration);

// CORS
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

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("auth", limiter =>
    {
        limiter.PermitLimit = 8;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
        limiter.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    });
});

var app = builder.Build();

// Middleware
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

var avatarPath = Path.Combine(app.Environment.ContentRootPath, "UserAvatars");
Directory.CreateDirectory(avatarPath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(avatarPath),
    RequestPath = "/user-avatars"
});

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapControllers();

// Database migration
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<UserDbContext>();
    db.Database.Migrate();
}

app.Run("http://localhost:5001");

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
