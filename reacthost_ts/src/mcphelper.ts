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
  constructor(options: any, transport: SSEClientTransport) {
    super(options);
    // No need to store transport, base Client handles it
  }
  public Disconnect() {
    this.close();
  }
}

export class LLMClient {
  private client: any;
  private Messages: ChatMessage[] = [];
  constructor(endpoint: string, apiKey: string, modelId: string) {
    const fullEndpoint = endpoint.replace(/\/$/, '') + '/openai/deployments/' + modelId;
    this.client = ModelClient(fullEndpoint, new AzureKeyCredential(apiKey));
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
  const client = new MCPClient({ name: "mcp-client", version: "1.0.0" }, transport);
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

export function createLLMClient(endpoint: string, apiKey: string, modelId: string) {
  return new LLMClient(endpoint, apiKey, modelId);
}

export async function ChatWithFunctionCalls({
  llmClient,
  mcpClient,
  llmParams
}: {
  llmClient: any,
  mcpClient: any,
  llmParams: any
}): Promise<string> {
  let awaitingToolCallAnswer = true;
  let llmOutput = '';
  let tools: any[] = [];
  // Always fetch the latest tools list from the server
  const mcpTools = await listMCPTools(mcpClient);
  if (mcpTools && Array.isArray(mcpTools.tools)) {
    tools = mcpTools.tools.map((tool: any) => {
      let parameters = tool.parameters;
      if (!parameters && tool.inputSchema) parameters = tool.inputSchema;
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters
        }
      };
    });
    console.log('DEBUG MCP tools passed to LLM:', tools);
  }
  while (awaitingToolCallAnswer) {
    const response = await llmClient.path('/chat/completions').post({
      ...llmParams,
      body: {
        ...llmParams.body,
        messages: llmClient.getMessages(),
        tools
      }
    });
    if (response.body && Array.isArray(response.body.choices)) {
      for (const choice of response.body.choices) {
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
          const toolMessages = await handleToolCalls(functionArray, mcpClient);
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
  mcpClient: any
): Promise<{
  role: 'tool';
  content: string;
  tool_call_id: string;
  name: string;
}[]> {
  const messageArray: any[] = [];
  for (const func of functionArray) {
    let content = '';
    //const tool = mcpToolsRef?.tools?.find((t: any) => t.name === func.name);
    if (mcpClient) {
      try {
        const args = JSON.parse(func.arguments);
        const { result: toolResult } = await callMCPTool(mcpClient, func.name, args);
        content = toolResult;
      } catch (err) {
        let msg = '';
        if (typeof err === 'object' && err && 'message' in err) {
          msg = (err as any).message;
        } else {
          msg = JSON.stringify(err);
        }
        content = `[MCP] MCP Error: ${msg}`;
      }
    } else {
      content = `[MCP] MCP client not connected`;
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