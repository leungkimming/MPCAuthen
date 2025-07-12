using Microsoft.AspNetCore.Authentication.Negotiate;
using Services;

var builder = WebApplication.CreateBuilder(args);
// Add CORS for React & Blazor Clients
builder.Services.AddCors(options => {
    options.AddPolicy("AllowLocal3000", policy => {
        policy.WithOrigins("http://localhost:3000", "https://localhost:44328")
              .AllowCredentials()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});
// Add both MCP and API services to the container.
builder.Services.AddMcpServer().WithToolsFromAssembly().WithHttpTransport();
builder.Services.AddControllers();
builder.Services.AddScoped<TimeService>();
builder.Services.AddHttpClient();

// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
// Allow both windowsAuthentication and anonymousAuthentication to true to allow pre-flight CORS requests
// Instead, Use middlewares for authentication and authorization
builder.Services.AddAuthentication(NegotiateDefaults.AuthenticationScheme)
    .AddNegotiate();
builder.Services.AddAuthorization();
builder.Services.AddHttpContextAccessor();

var app = builder.Build();
app.UseCors("AllowLocal3000");
// Register SSE credential validation middleware BEFORE MapMcp
app.UseMiddleware<SseCredentialValidationMiddleware>();
// Map both MCP and API and use authorization and authentication
app.MapMcp().RequireAuthorization(); // MCP also requires authorization
app.MapControllers();
app.UseAuthentication();
app.UseAuthorization();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment()) {
    app.UseSwagger();
    app.UseSwaggerUI();
}

//app.UseHttpsRedirection(); Won't work for CORS pre-flight requests

app.Run();
