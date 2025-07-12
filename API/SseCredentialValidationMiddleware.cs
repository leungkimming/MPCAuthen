using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

public class SseCredentialValidationMiddleware
{
    private readonly RequestDelegate _next;

    public SseCredentialValidationMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Intercept only /sse endpoint for required authorization validation
        if (context.Request.Path.Equals("/sse", System.StringComparison.OrdinalIgnoreCase))
        {
            string name = context.User?.Identity?.Name ?? "anonymous";
            if (name == "anonymous")
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsync("Unauthorized");
                return;
            }
        }
        await _next(context);
    }
}
