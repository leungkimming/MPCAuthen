using Microsoft.AspNetCore.Authentication.Negotiate;
using Services;

var builder = WebApplication.CreateBuilder(args);
// Add CORS for React Client
builder.Services.AddCors(options => {
    options.AddPolicy("AllowLocal3000", policy => {
        policy.WithOrigins("http://localhost:3000")
              .AllowCredentials()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});
// Add services to the container.
builder.Services.AddMcpServer().WithToolsFromAssembly().WithHttpTransport();
builder.Services.AddControllers();
builder.Services.AddScoped<TimeService>();
builder.Services.AddHttpClient();

// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddAuthentication(NegotiateDefaults.AuthenticationScheme)
    .AddNegotiate();
builder.Services.AddAuthorization();
builder.Services.AddHttpContextAccessor();

var app = builder.Build();
app.UseCors("AllowLocal3000");
// Register SSE credential validation middleware BEFORE MapMcp
app.UseMiddleware<SseCredentialValidationMiddleware>();
app.MapMcp().RequireAuthorization();
app.MapControllers();
app.UseAuthentication();
app.UseAuthorization();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment()) {
    app.UseSwagger();
    app.UseSwaggerUI();
}

//app.UseHttpsRedirection();

app.Run();
