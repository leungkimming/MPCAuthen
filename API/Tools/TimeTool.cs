using Services;
using ModelContextProtocol.Server;
using System.ComponentModel;

namespace API.Tools;

// Annotations '[...]' is critical for LLM to understand when and how to use this tool.
[McpServerToolType]
public class TimeTool
{
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly TimeService _timeService;

    public TimeTool(IHttpContextAccessor httpContextAccessor, TimeService timeService) {
        _httpContextAccessor = httpContextAccessor;
        _timeService = timeService;
    }

    [McpServerTool, Description("Get the current time for a city")]
    public string GetCurrentTime([Description("The city to get the local time for")] string city) {
        var context = _httpContextAccessor.HttpContext;
        string name = context?.User?.Identity?.Name ?? "anonymous";
        // Validate authentication here

        // MCP and API call the same service
        DateTime cTime = _timeService.GetCurrentTime();
        // MCP return INFORMATION with INSTRUCTIONS, while API returns DTO
        string reply = $"Hi {name}, the current local time in Hong Kong is {cTime.Hour}:{cTime.Minute} on {cTime:dd/MM/yyyy} (GMT+8). To provide the local time for {city}, please convert this time from GMT+8 to the GMT offset of {city} before answering.";
        Console.WriteLine($"MCP called and I reply: {reply}");
        return reply;
    }
}
