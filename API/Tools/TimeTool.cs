using Services;
using ModelContextProtocol.Server;
using System.ComponentModel;

namespace API.Tools;

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
    public string GetCurrentTime(string city) {
        var context = _httpContextAccessor.HttpContext;
        string name = context?.User?.Identity?.Name ?? "anonymous";

        DateTime cTime = _timeService.GetCurrentTime();
        string reply = $"Hi {name}, it is {cTime.Hour}:{cTime.Minute} on {cTime:dd/MM/yyyy} in Hong Kong, which is GMT +8. You have to adjust to {city}'s GMT offset before answering.";
        Console.WriteLine($"MCP called and I reply: {reply}");
        return reply;
    }
}
