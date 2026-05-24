using Serilog;

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

// Load YARP configuration
var yarpConfig = builder.Configuration.GetSection("ReverseProxy");

builder.Services
    .AddReverseProxy()
    .LoadFromConfig(yarpConfig);

// CORS
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
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "API Gateway");
        options.SwaggerEndpoint("/swagger/services/user/swagger.json", "User Service");
        options.SwaggerEndpoint("/swagger/services/meeting/swagger.json", "Meeting Service");
        options.SwaggerEndpoint("/swagger/services/notification/swagger.json", "Notification Service");
        options.SwaggerEndpoint("/swagger/services/organization/swagger.json", "Organization Service");
    });
}
else
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

UseSecurityHeaders(app);
app.UseCors("AllowFrontend");

app.MapControllers();
app.MapReverseProxy();

app.Run("http://localhost:5000");

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
