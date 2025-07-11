using Azure;
using Azure.AI.OpenAI;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Configuration;
using ModelContextProtocol;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

var config = new ConfigurationBuilder()
    .AddJsonFile($"appsettings.json")
    .Build();

// Connect to an MCP server
Console.WriteLine("Now connecting client to MCP server");
IMcpClient mcpClient;

switch (config["Transport"]?.ToUpper()) {
    case "STDIO":
        // TransportType = Standard Input/Output (Stdio)
        mcpClient = await McpClientFactory.CreateAsync(
            new StdioClientTransport(
                new() {
                    Name = "Time MCP Server",
                    Command = "dotnet",
                    Arguments = ["run", "--project", @"..\..\..\..\McpServer.ConsoleHost\McpServer.ConsoleHost.csproj"]
                }
            )
        );
        break;
    case "SSE":
        // TransportType = Server-Sent Events (SSE)
        HttpClientHandler handler = new HttpClientHandler {
            UseDefaultCredentials = true
        };
        HttpClient client = new HttpClient(handler);
        SseClientTransport sseClientTransport = new SseClientTransport(
            new SseClientTransportOptions() {
                Endpoint = new Uri(config["LLM:MCP_ENDPOINT"] ?? "https://localhost")
            },
            client
        );
        mcpClient = await McpClientFactory.CreateAsync(sseClientTransport);
        break;
    default:
        throw new InvalidOperationException($"Unsupported transport type: {config["Transport"]}");
}

Console.WriteLine("Successfully connected!");
Console.WriteLine("---------------------------------");

// Get all available tools
Console.WriteLine("Tools available:");
IList<McpClientTool> tools = await mcpClient.ListToolsAsync();
foreach (McpClientTool tool in tools)
{
    Console.WriteLine($"{tool.Name} ({tool.Description})");
}
Console.WriteLine("---------------------------------");

// Execute a tool directly.
Console.WriteLine("Use tool directly in McpClient:");
CallToolResult result = await mcpClient.CallToolAsync(
    "GetCurrentTime",
    new Dictionary<string, object?>() { ["city"] = "New York" });
Console.WriteLine(result.Content.First(c => c.Type == "text").ToAIContent());
Console.WriteLine("---------------------------------");

// Driven by LLM tool invocations.
Console.WriteLine("Use tool in ChatClient:");
AzureKeyCredential AzureApiKeyCredential = new AzureKeyCredential(config["LLM:Azure_API_Key"] ?? "");
Uri AzureEndpoint = new Uri(config["LLM:LLM_PROXY_ENDPOINT"] ?? "");
IChatClient chatClient = new ChatClientBuilder(
    new AzureOpenAIClient(AzureEndpoint, AzureApiKeyCredential)
    .GetChatClient(config["LLM:ModelId"] ?? "").AsChatClient())
.UseFunctionInvocation()
.Build();

IList<Microsoft.Extensions.AI.ChatMessage> chatHistory =
[
    new(ChatRole.System, @"
You are a helpful assistant, delivering answer including the user's login ID as prefix of the response."),
];
// Core Part: Get AI Tools from MCP Server
IList<McpClientTool> mcpTools = await mcpClient.ListToolsAsync();
ChatOptions chatOptions = new ChatOptions()
{
    Tools = [..mcpTools, AIFunctionFactory.Create(ShowBookMeeting, "ShowBookMeeting", "book an urgent meeting in the city, datetime and agenda")]
};

foreach (AITool tool in chatOptions.Tools)
{
    Console.WriteLine($"Tool: {tool.Name}, Description: {tool.Description}");
}

// Prompt the user for a question.
Console.ForegroundColor = ConsoleColor.Green;
Console.WriteLine($"Assistant> How can I assist you today? ('exit' to quit)");

while (true)
{
    // Read the user question.
    Console.ForegroundColor = ConsoleColor.White;
    Console.Write("User> ");
    string question = Console.ReadLine();

    // Exit the application if the user didn't type anything.
    if (!string.IsNullOrWhiteSpace(question) && question.ToUpper() == "EXIT")
        break;

    chatHistory.Add(new ChatMessage(ChatRole.User, question));
    Console.ForegroundColor = ConsoleColor.Green;
    ChatResponse response = await chatClient.GetResponseAsync(chatHistory, chatOptions);
    string content = response.ToString();
    Console.WriteLine($"Assistant> {content}");
    chatHistory.Add(new ChatMessage(ChatRole.Assistant, content));

    Console.WriteLine();
}
// kill the mcp server process created by McpClientFactory
if (mcpClient is IAsyncDisposable asyncDisposable) {
    await mcpClient.DisposeAsync(); // Uncomment if such method exists
    await asyncDisposable.DisposeAsync();
}
Environment.Exit(0);


string ShowBookMeeting(string city, DateTime meetingDateTime, string agenda) {
    var result = $"Meeting Room R1 booked in {city} at {meetingDateTime} with agenda: {agenda}";
    Console.WriteLine($"local method 'ShowBookMeeting' called with result: {result}");
    return result;
}



