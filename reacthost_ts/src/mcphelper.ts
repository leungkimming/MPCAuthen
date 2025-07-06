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
  constructor(endpoint: string) {
    this.client = ModelClient(endpoint, new AzureKeyCredential("DummyKey"));
  }
  public addMessage(msg: ChatMessage) {
    this.Messages.push(msg);
  }
  public getMessages() {
    return this.Messages;
  }
  public path(...args: any[]) {
    return this.client.path(...args);
  }
}

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
  mcpClients,
  llmParams
}: {
  llmClient: any,
  mcpClients: any[], // Now an array
  llmParams: any
}): Promise<string> {
  let awaitingToolCallAnswer = true;
  let llmOutput = '';
  let tools: any[] = [];
  const toolNameToClient: Record<string, any> = {};
  // Aggregate tools from all MCP servers, check for duplicates
  for (const mcpClient of mcpClients) {
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
  // Add navigate2bookmeetings as a tool for the LLM
  tools.push({
    type: 'function',
    function: {
      name: 'navigate2bookmeetings',
      description: 'book an urgent meeting in the city and datetime',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City to book the meeting in' },
          DateTime: { type: 'string', description: 'Date and time for the meeting' }
        },
        required: ['city', 'DateTime']
      }
    }
  });
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
        if (toolCallArray) {
          choice.message.role = 'assistant';
          llmClient.addMessage(choice.message);
          const functionArray: any[] = [];
          for (const toolCall of toolCallArray) {
            console.log('DEBUG LLM request ToolCall:', toolCall);
            functionArray.push({
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
              id: toolCall.id
            });
          }
          const toolMessages = await handleToolCalls(functionArray, toolNameToClient);
          for (const toolMsg of toolMessages) {
            console.log('[ToolCall Result passed back to LLM]', toolMsg.content);
            llmClient.addMessage(toolMsg);
          }
        }
        if (choice.finish_reason === 'tool_calls') {
          continue;
        } else {
          if (choice.message?.content && choice.message.content !== '') {
            llmOutput += choice.message.content;
            awaitingToolCallAnswer = false;
            console.log('[LLM token used]', responseBody.usage?.total_tokens || 0);
          }
        }
      }
    } else {
      awaitingToolCallAnswer = false;
    }
  }
  if (llmOutput) {
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
    if (mcpClient) {
      try {
        const args = JSON.parse(func.arguments);
        const { result: toolResult } = await callMCPTool(mcpClient, func.name, args);
        content = toolResult;
      } catch (err) {
        content = `[MCP] MCP Error: ${getErrorMessage(err)}`;
      }
    } else {
      // Check if it's a local TypeScript function
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

export function navigate2bookmeetings(jsonParam: string): Promise<{ jsonParam?: string }> {
  return Promise.resolve({ jsonParam }); 
}

// Ensure the function is available on globalThis for tool call execution
(globalThis as any).navigate2bookmeetings = navigate2bookmeetings;