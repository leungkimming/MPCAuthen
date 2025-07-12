using Common;
using Microsoft.Extensions.Configuration;
using ModelContextProtocol.Server;
using System.ComponentModel;
using System.Text.Json;

namespace McpServer.Tools.ConsoleHost;

// Annotations '[...]' is critical for LLM to understand when and how to use this tool.
[McpServerToolType]
public static class TimeTool
{
    [McpServerTool, Description("Get the current time for a city")]
    public static string GetCurrentTime([Description("The city to get the local time for")] string city)
    {
        var config = new ConfigurationBuilder()
            .AddJsonFile($"appsettings.json")
            .Build();
        // Create handler with default credentials
        var handler = new HttpClientHandler
        {
            UseDefaultCredentials = true
        };
        using var client = new HttpClient(handler);
        // Call the API endpoint to get the current time
        var response = client.GetAsync(config["LLM:API_ENDPOINT"]).GetAwaiter().GetResult();
        string result;
        if (response.IsSuccessStatusCode)
        {
            var json = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            var options = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };
            var data = JsonSerializer.Deserialize<TimeResultDto>(json, options);
            // MCP return INFORMATION with INSTRUCTIONS, while API returns DTO
            result = $"Hi {data?.Name}, the current local time in Hong Kong is {data?.CTime:HH:mm} on {data?.CTime:dd/MM/yyyy} (GMT+8). To provide the local time for {city}, please convert this time from GMT+8 to the GMT offset of {city} before answering.";
        }
        else
        {
            result = $"Failed to get time data. Status: {response.StatusCode}";
        }
        return result;
    }
}
