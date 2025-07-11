import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";

// Type for ChatMessage (should match App.tsx)
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

class MCPClient extends Client {
  public url: string;
  constructor(options: any, transport: SSEClientTransport, url: string) {
    super(options);
    this.url = url;
  }
  public Disconnect() {
    this.close();
  }
}

export class LLMClient {
  private client: any;
  private Messages: ChatMessage[] = [];
  private Tools: any[] = [];
  private McpClients: any[] = [];
  constructor(endpoint: string) {
    // endpoint is a LLM Proxy API. API Key to be provided by API
    this.client = ModelClient(endpoint, new AzureKeyCredential("DummyKey"));
  }
  public addMessage(msg: ChatMessage) {
    this.Messages.push(msg);
  }
  public getMessages() {
    return this.Messages;
  }
  public addTools(tool: any) {
    this.Tools.push(tool);
  }
  public getTools() {
    return this.Tools;
  }
  public addMCPClient(client: any) {
    this.McpClients.push(client);
  }
  public getMCPClients() {
    return this.McpClients;
  }
  public path(...args: any[]) {
    return this.client.path(...args);
  }
}

// Create MCP Client with SSE connection to MCP server
export async function createMCPClient(sseUrl: string) {
  const transport = new SSEClientTransport(new URL(sseUrl), {
    eventSourceInit: { withCredentials: true },
    requestInit: { credentials: "include" }
  });
  const client = new MCPClient({ name: "mcp-client", version: "1.0.0" }, transport, sseUrl);
  await client.connect(transport);
  return client;
}

export async function listMCPTools(client: any) {
  // Always fetch the latest tools list from the server
  const toolsRequest = { method: 'tools/list', params: {} };
  return await client.request(toolsRequest, ListToolsResultSchema);
}

export async function callMCPTool(client: any, name: string, args: any) {
  const toolRequest = { method: 'tools/call', params: { name, arguments: args } };
  const result = await client.request(toolRequest, CallToolResultSchema);
  let extractedText = '';
  if (result && result.content && Array.isArray(result.content)) {
    const textObj = result.content.find((item: any) => item.type === 'text' && item.text);
    if (textObj) extractedText = textObj.text;
  }
  return { result: extractedText ?? JSON.stringify(result) };
}

export function createLLMClient(endpoint: string) {
  return new LLMClient(endpoint);
}

export async function ChatWithFunctionCalls({
  llmClient,
  llmParams
}: {
  llmClient: any,
  llmParams: any
}): Promise<string> {
  let awaitingToolCallAnswer = true;
  let llmOutput = '';
  let tools: any[] = [];
  const toolNameToClient: Record<string, any> = {};
  // Aggregate tools from all MCP servers, check for duplicates
  for (const mcpClient of llmClient.getMCPClients()) {
    if (!mcpClient) {
      continue; // Skip if no MCP client is not connected
    }
    const mcpTools = await listMCPTools(mcpClient);
    if (mcpTools && Array.isArray(mcpTools.tools)) {
      for (const tool of mcpTools.tools) {
        if (toolNameToClient[tool.name]) {
          throw new Error(`Duplicate tool name detected: ${tool.name}`);
        }
        toolNameToClient[tool.name] = mcpClient;
        let parameters = tool.parameters;
        if (!parameters && tool.inputSchema) parameters = tool.inputSchema;
        tools.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters
          }
        });
      }
    }
  }
  // Add local tools on top of mcp tools
  for (const tool of llmClient.getTools()) {
    tools.push(tool);
  }
  console.log('DEBUG MCP tools passed to LLM via LLM Proxy API:', tools);
  while (awaitingToolCallAnswer) {
    const response = await llmClient.path('/LLM').post({
      ...llmParams,
      body: {
        ...llmParams.body,
        messages: llmClient.getMessages(),
        tools
      }
    });
    const responseBody = response.body;
    if (responseBody && Array.isArray(responseBody.choices)) {
      for (const choice of responseBody.choices) {
        const toolCallArray = choice.message?.tool_calls;
        // handle tool calls if they exist
        if (toolCallArray) {
          choice.message.role = 'assistant';
          llmClient.addMessage(choice.message);
          const functionArray: any[] = [];
          // Tool calls may be muliple
          for (const toolCall of toolCallArray) {
            console.log('DEBUG LLM request ToolCall:', toolCall);
            functionArray.push({
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
              id: toolCall.id
            });
          }
          // handle all tool calls and add results to LLM client ChatMessage
          const toolMessages = await handleToolCalls(functionArray, toolNameToClient);
          for (const toolMsg of toolMessages) {
            console.log('[ToolCall Result passed back to LLM]', toolMsg.content);
            llmClient.addMessage(toolMsg);
          }
        }
        if (choice.finish_reason === 'tool_calls') {
          continue; // Loop until all tool calls are processed
        } else { // No more tool calls, process the LLM output
          if (choice.message?.content && choice.message.content !== '') {
            llmOutput += choice.message.content;
            awaitingToolCallAnswer = false;
            console.log('[LLM token used]', responseBody.usage?.total_tokens || 0);
          }
        }
      }
    } else {
      awaitingToolCallAnswer = false; // No tool calls or choices, exit the loop
    }
  }
  if (llmOutput) {
    // Add the final LLM output to the client messages
    llmClient.addMessage({ role: 'assistant', content: llmOutput });
  }
  return llmOutput;
}

export async function handleToolCalls(
  functionArray: { name: string; arguments: string; id: string }[],
  toolNameToClient: Record<string, any>
): Promise<{
  role: 'tool';
  content: string;
  tool_call_id: string;
  name: string;
}[]> {
  const messageArray: any[] = [];
  for (const func of functionArray) {
    let content = '';
    const mcpClient = toolNameToClient[func.name];
    // Check if it's an MCP tool call
    if (mcpClient) {
      try {
        const args = JSON.parse(func.arguments);
        const { result: toolResult } = await callMCPTool(mcpClient, func.name, args);
        content = toolResult;
      } catch (err) {
        content = `[MCP] MCP Error: ${getErrorMessage(err)}`;
      }
    } else {
      // else, check if it is a local TypeScript function
      if (typeof (globalThis as any)[func.name] === 'function') {
        try {
          const args = JSON.parse(func.arguments);
          const result = await (globalThis as any)[func.name](JSON.stringify(args));
          content = result?.result ?? String(result);
          console.log(`[Local] Executed local function ${func.name} with jsonParam: ${JSON.stringify(args)} => Result: ${content}`);
        } catch (err) {
          content = `[Local] Error executing ${func.name}: ${getErrorMessage(err)}`;
        }
      } else {
        content = `[MCP] MCP client / local function not found for tool: ${func.name}`;
      }
    }
    // Add the tool call result to the message array
    messageArray.push({
      role: 'tool',
      content,
      tool_call_id: func.id,
      name: func.name,
    });
  }
  return messageArray;
}

export function getErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err && 'message' in (err as any)) {
    return (err as any).message;
  } else {
    return JSON.stringify(err);
  }
}

export async function connectMCP(url: string): Promise<any> {
  console.log(`[MCP] Connecting ${url}...`);
  try {
    const client = await createMCPClient(url);
    console.log('[MCP] Connected');
    const toolsResult = await listMCPTools(client);
    // Log the available tools
    try {
      if (toolsResult.tools.length === 0) {
        console.log('[MCP] No tools available');
      } else {
        console.log('[MCP] Available tool(s) listed:' + toolsResult.tools.map((tool: any) => `\n  - ${tool.name}: ${tool.description || ''}`).join(''));
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      console.log(`[MCP] Error listing tools: ${msg}`);
    }
    return client;
  } catch (err) {
    const msg = getErrorMessage(err);
    console.log(`[MCP] Error connecting: ${msg}`);
    throw err;
  }
}
