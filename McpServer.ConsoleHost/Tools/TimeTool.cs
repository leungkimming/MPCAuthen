using ModelContextProtocol.Server;
using System.ComponentModel;
using System.Text.Json;
using Common;

namespace McpServer.Tools.ConsoleHost;

[McpServerToolType]
public static class TimeTool
{
    [McpServerTool, Description("Get the current time for a city")]
    public static string GetCurrentTime(string city)
    {
        // Create handler with default credentials
        var handler = new HttpClientHandler
        {
            UseDefaultCredentials = true
        };
        using var client = new HttpClient(handler);
        var response = client.GetAsync($"https://localhost:44322/Time").GetAwaiter().GetResult();
        string result;
        if (response.IsSuccessStatusCode)
        {
            var json = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            var options = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };
            var data = JsonSerializer.Deserialize<TimeResultDto>(json, options);            result = $"Hi {data?.Name}, it is {data?.CTime.Hour}:{data?.CTime.Minute} on {data?.CTime:dd/MM/yyyy} in Hong Kong, which is GMT +8. You have to adjust to {city}'s GMT offset before answering.";
        }
        else
        {
            result = $"Failed to get time data. Status: {response.StatusCode}";
        }
        return result;
    }
}
