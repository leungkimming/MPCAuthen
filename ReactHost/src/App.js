import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";

function App() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [mcpStatus, setMcpStatus] = useState('Disconnected');
  const mcpClientRef = useRef(null);
  const LLMClientRef = useRef(null);
  const mcpToolsRef = useRef(null); // 1. Store toolsResult here
  const messagesRef = useRef([ // 2. Move messages to useRef
    { role: 'system', content: "You are a helpful assistant, delivering answer including the user's login ID as prefix of the response." }
  ]);
  // Add chatMessages state to track chat history
  const [chatMessages, setChatMessages] = useState([
    { role: 'system', content: "You are a helpful assistant, delivering answer including the user's login ID as prefix of the response." }
  ]);

  useEffect(() => {
    const transport = new SSEClientTransport(
      new URL("https://localhost:44322/sse"),
      {
        eventSourceInit: { withCredentials: true },
        requestInit: { credentials: "include" }
      }
    );

    const client = new Client(
        {
            name: "mcp-client",
            version: "1.0.0"
        },
    );
    mcpClientRef.current = client;
    setMcpStatus("Connecting...");
    setOutput((prev) => prev + (prev ? '\n' : '') + '[MCP] Connecting...');
    client.connect(transport)
      .then(async () => {
        setMcpStatus("Connected");
        setOutput((prev) => prev + (prev ? '\n' : '') + '[MCP] Connected');
        // List available tools after connecting
        try {
          const toolsRequest = {
            method: 'tools/list',
            params: {}
          };
          const toolsResult = await client.request(toolsRequest, ListToolsResultSchema);
          mcpToolsRef.current = toolsResult; // 1. Store toolsResult in ref
          if (toolsResult.tools.length === 0) {
            setOutput((prev) => prev + '\n[MCP] No tools available');
          } else {
            setOutput((prev) => prev + '\n[MCP] Available tools:' + toolsResult.tools.map(tool => `\n  - ${tool.name}: ${tool.description || ''}`).join(''));
          }
        } catch (err) {
          setOutput((prev) => prev + `\n[MCP] Error listing tools: ${err && err.message ? err.message : JSON.stringify(err)}`);
        }
      })
      .catch((err) => {
        setMcpStatus("Error");
        setOutput((prev) => prev + (prev ? '\n' : '') + '[MCP] Error: ' + (err && err.message ? err.message : JSON.stringify(err)));
      });
    // Optionally, listen for messages or errors here if needed
    return () => {
      if (client && client.disconnect) client.disconnect();
    };
  }, []);

  // Fetch appsettings.json from public folder and initialize LLMClientRef
  useEffect(() => {
    fetch('/appsettings.json')
      .then(res => res.json())
      .then(config => {
        const endpoint = config.LLM?.EndPoint;
        const apiKey = config.LLM?.Azure_API_key;
        const modelId = config.LLM?.ModelId;
        if (endpoint && apiKey && modelId) {
          const fullEndpoint = endpoint.replace(/\/$/, '') + '/openai/deployments/' + modelId;
          LLMClientRef.current = ModelClient(fullEndpoint, new AzureKeyCredential(apiKey));
        }
      })
      .catch(err => {
        // Optionally handle error
        console.error('Failed to load appsettings.json', err);
      });
  }, []);

  const handleCallAPI = async (e) => {
    e.preventDefault();
    setOutput((prev) => prev + (prev ? '\n' : '') + '[MCP] Calling API Controller Time...');
    setInput('');
    try {
      const response = await fetch('https://localhost:44322/Time', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!response.ok) throw new Error('HTTP error ' + response.status);
      const data = await response.json();
      setOutput((prev) => prev + `\n[Time] API Controller Time Result: ${data.name}, cTime: ${data.cTime}`);
    } catch (err) {
      setOutput((prev) => prev + `\n[Time] Error: ${err.message}`);
    }
  };

  const handleCallMCP = async () => {
    setOutput((prev) => prev + (prev ? '\n' : '') + '[MCP] Calling Direct Tool GetCurrentTime for New York...');
    const client = mcpClientRef.current;
    if (!client) {
      setOutput((prev) => prev + '\n[MCP] Error: Client not connected');
      return;
    }
    try {
      const toolRequest = {
        method: 'tools/call',
        params: {
          name: 'GetCurrentTime',
          arguments: { city: 'New York' }
        }
      };
      const result = await client.request(toolRequest, CallToolResultSchema);
      // Extraction logic: get just the text from the result
      let extractedText = '';
      if (result && result.content && Array.isArray(result.content)) {
        const textObj = result.content.find(item => item.type === 'text' && item.text);
        if (textObj) extractedText = textObj.text;
      }
      setOutput((prev) => prev + `\n[MCP] Direct call MCP tool Result: ${extractedText || JSON.stringify(result)}`);
    } catch (err) {
      setOutput((prev) => prev + `\n[MCP] MCP Error: ${err && err.message ? err.message : JSON.stringify(err)}`);
    }
  };

  // 3 & 4. Update handleCallLLM to use tools and messagesRef, and handle tool_calls in a while loop
  const handleCallLLM = async () => {
    setOutput((prev) => prev + (prev ? '\n' : '') + '[LLM] Calling LLM...');
    const client = LLMClientRef.current;
    if (!client) {
      setOutput((prev) => prev + '\n[LLM] Error: LLM client not initialized');
      return;
    }
    // Add user input to messagesRef
    messagesRef.current.push({ role: 'user', content: input });
    // Add user message to chatMessages (for chat UI)
    setChatMessages((prev) => [...prev, { role: 'user', content: input }]);
    setInput('');
    try {
      // Convert MCP toolsResult to OpenAI tools format
      let tools = [];
      if (mcpToolsRef.current && Array.isArray(mcpToolsRef.current.tools)) {
        // Debug: print full mcpToolsRef.current.tools array in output textarea
           setOutput(prev => prev + '\nDEBUG mcpToolsRef.current.tools:' + JSON.stringify(mcpToolsRef.current.tools, null, 2));
        tools = mcpToolsRef.current.tools.map(tool => {
          // Simplified: if inputSchema exists, use it directly as parameters
          let parameters = tool.parameters;
          if (!parameters && tool.inputSchema) {
            parameters = tool.inputSchema;
          }
          return {
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters
            }
          };
        });
        // Debug: print tools array in output textarea
           setOutput(prev => prev + '\nDEBUG pass to LLM tools:' + JSON.stringify(tools, null, 2));
      }
      let awaitingToolCallAnswer = true;
      let llmOutput = '';
      while (awaitingToolCallAnswer) {
        const response = await client.path('/chat/completions').post({
          body: {
            messages: messagesRef.current,
            tools,
            max_tokens: 128
          },
          temperature: 0.1,
          top_p: 1.0,
        });
        // Log the raw response body for debugging
        // setOutput(prev => prev + '\nLLM raw response.body:', response.body);
        if (response.body && Array.isArray(response.body.choices)) {
          for (const choice of response.body.choices) {
            const toolCallArray = choice.message?.tool_calls;
            if (toolCallArray) {
              // Add assistant message requesting tool call
              choice.message.role = 'assistant';
              messagesRef.current.push(choice.message);
              // Add assistant message to chatMessages (for chat UI)
              setChatMessages((prev) => [...prev, { role: 'assistant', content: choice.message.content }]);
              for (const toolCall of toolCallArray) {
                // Debug: print toolCall in JSON format
                   setOutput(prev => prev + '\nDEBUG LLM request ToolCall:'+ JSON.stringify(toolCall, null, 2));
                // Actually call the tool using handleToolCalls
                const functionArray = [{
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                  id: toolCall.id
                }];
                const toolMessages = await handleToolCalls(functionArray, mcpClientRef.current, mcpToolsRef.current);
                for (const toolMsg of toolMessages) {
                  // Debug: Show toolcall result in output
                     setOutput(prev => prev + `\n[ToolCall Result] ${toolMsg.content}`);
                  messagesRef.current.push(toolMsg);
                }
              }
            }
            if (choice.finish_reason === 'tool_calls') {
              // Continue loop to send tool results
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
      // Add assistant message to chatMessages (for chat UI)
      if (llmOutput) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: llmOutput }]);
      }
    } catch (err) {
      setOutput((prev) => prev + `\n[LLM] Error: ${err && err.message ? err.message : JSON.stringify(err)}`);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `[LLM] Error: ${err && err.message ? err.message : JSON.stringify(err)}` }]);
    }
  };

  // Replace the handleToolCalls function to check against mcpToolsRef and actually call the MCP tool using the client, similar to handleCallMCP
  const handleToolCalls = async (
    functionArray,
    mcpClient,
    mcpToolsRef
  ) => {
    const messageArray = [];
    for (const func of functionArray) {
      let content = '';
      // Find the tool in mcpToolsRef by name
      const tool = mcpToolsRef?.tools?.find(t => t.name === func.name);
      if (tool && mcpClient) {
        try {
          // Parse arguments from the tool call
          const args = JSON.parse(func.arguments);
          // Call the MCP tool using the same logic as handleCallMCP
          const toolRequest = {
            method: 'tools/call',
            params: {
              name: func.name,
              arguments: args
            }
          };
          // Debug: print toolRequest in JSON format
             setOutput(prev => prev + '\nDEBUG Call MCP server toolRequest:'+ JSON.stringify(toolRequest, null, 2));
          const result = await mcpClient.request(toolRequest, CallToolResultSchema);
          let extractedText = '';
          if (result && result.content && Array.isArray(result.content)) {
            const textObj = result.content.find(item => item.type === 'text' && item.text);
            if (textObj) extractedText = textObj.text;
          }
          content = extractedText || JSON.stringify(result);
        } catch (err) {
          content = `[MCP] MCP Error: ${err && err.message ? err.message : JSON.stringify(err)}`;
        }
      } else {
        content = `[MCP] Tool ${func.name} not found or MCP client not connected`;
      }
      messageArray.push({
        role: 'tool',
        content,
        tool_call_id: func.id,
        name: func.name,
      });
    }
    return messageArray;
  };

  return (
    <div className="App" style={{ padding: 15 }}>
      <h2 style={{ marginTop: -10 }}>ReactJS UI Chat App with MCP Server support</h2>
      <div>MCP Server Connection Status: <b>{mcpStatus}</b></div>
      <div style={{ marginTop: 5, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Chat message list */}
        <div
          className="chat-output"
          style={{ width: 800, height: 400, overflowY: 'auto', background: '#f8f8f8', padding: 10, borderRadius: 6, border: '1px solid #ccc' }}
        >
          {chatMessages.map((msg, idx) => (
            msg.content && (
              <div
                key={idx}
                className={`chat-message ${msg.role}`}
                style={{
                  textAlign: msg.role === 'user' ? 'right' : 'left',
                  margin: '8px 0',
                  color: msg.role === 'user' ? '#1976d2' : '#333',
                  fontWeight: msg.role === 'user' ? 500 : 400
                }}
              >
                {msg.role === 'user' && '[User] '}
                {msg.role === 'assistant' && '[LLM] '}
                {msg.role !== 'user' && msg.role !== 'assistant' ? '' : ''}
                {msg.content}
              </div>
            )
          ))}
        </div>
      </div>
      {/* Chat input form moved below chat output */}
      <form
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}
        onSubmit={e => { e.preventDefault(); handleCallLLM(); }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter your Prompt here, like 'What is the current time in Melbourne?' or 'What date is last Saturday in London?'"
          style={{ width: 800, marginRight: 10 }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleCallLLM();
            }
          }}
        />
        <button type="submit">Call LLM</button>
      </form>
      {/* Debug output area for setOutput and action buttons */}
      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 20 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontWeight: 600 }}>Debug Output:</label>
          <textarea value={output} readOnly rows={15} style={{ width: 800, marginTop: 5, background: '#f4f4f4', borderRadius: 4, border: '1px solid #bbb', fontFamily: 'monospace', fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 25 }}>
          <button type="button" style={{ width: 80 }} onClick={handleCallMCP}>Call MCP</button>
          <button type="button" style={{ width: 80 }} onClick={handleCallAPI}>Call API</button>
        </div>
      </div>
    </div>
  );
}

export default App;
