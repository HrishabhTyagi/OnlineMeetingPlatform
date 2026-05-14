using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 750_000_000;
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
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins("http://localhost:5173", "http://localhost:3000")
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
    });
}

app.UseCors("AllowFrontend");

app.MapControllers();
app.MapReverseProxy();

app.Run("http://localhost:5000");
