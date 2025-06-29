import React, { useState, useEffect, useRef, FormEvent, 
  ChangeEvent, KeyboardEvent } from 'react';
import './App.css';
import { createMCPClient, callMCPTool, listMCPTools, ChatMessage,
  createLLMClient, ChatWithFunctionCalls, LLMClient } from './mcphelper';

function getErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err && 'message' in (err as any)) {
    return (err as any).message;
  } else {
    return JSON.stringify(err);
  }
}

function App() {
  const [prompt, setPrompt] = useState<string>('');
  const [mcpStatus, setMcpStatus] = useState<string>('Disconnected');
  const mcpClientRef = useRef<any>(null);
  const LLMClientRef = useRef<LLMClient | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'system', content: "You are a helpful assistant, delivering answer including the user's login ID as prefix of the response." }
  ]);

  useEffect(() => {
    async function connectMCP() {
      setMcpStatus("Connecting...");
      console.log('[MCP] Connecting...');
      try {
        const client = await createMCPClient("https://localhost:44322/sse");
        mcpClientRef.current = client;
        setMcpStatus("Connected");
        console.log('[MCP] Connected');
        const toolsResult = await listMCPTools(client);
        try {
          if (toolsResult.tools.length === 0) {
            console.log('[MCP] No tools available');
          } else {
            console.log('[MCP] Available tools:' + toolsResult.tools.map((tool: any) => `\n  - ${tool.name}: ${tool.description || ''}`).join(''));
          }
        } catch (err) {
          const msg = getErrorMessage(err);
          console.log(`[MCP] Error listing tools: ${msg}`);
        }
      } catch (err) {
        const msg = getErrorMessage(err);
        console.log(`[MCP] Error connecting: ${msg}`);
        setMcpStatus("Error");
      }
    }
    connectMCP();
    return () => {
      if (mcpClientRef.current && typeof mcpClientRef.current.Disconnect === 'function') {
        mcpClientRef.current.Disconnect();
      }
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
          LLMClientRef.current = createLLMClient(endpoint, apiKey, modelId);
        }
      })
      .catch(err => {
        // Optionally handle error
        console.error('Failed to load appsettings.json', err);
      });
  }, []);

  const handleCallAPI = async (e: FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    console.log('[MCP] Calling API Controller Time...');
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
      console.log(`[Time] API Controller Time Result: ${data.name}, cTime: ${data.cTime}`);
    } catch (err) {
      const msg = getErrorMessage(err);
      console.log(`[Time] Error: ${msg}`);
    }
  };

  const handleCallMCP = async () => {
    console.log('[MCP] Calling Direct Tool GetCurrentTime for New York...');
    const client = mcpClientRef.current;
    if (!client) {
      console.log('[MCP] Error: Client not connected');
      return;
    }
    try {
      const { result: toolResult } = await callMCPTool(client, 'GetCurrentTime', { city: 'New York' });
      console.log(`[MCP] Direct call MCP tool Result: ${toolResult}`);
    } catch (err) {
      const msg = getErrorMessage(err);
      console.log(`[MCP] MCP Error: ${msg}`);
    }
  };

  const handleCallLLM = async () => {
    console.log('[LLM] Calling LLM...');
    const client = LLMClientRef.current;
    if (!client) {
      console.log('[LLM] Error: LLM client not initialized');
      return;
    }
    // Add user message to LLMClient's Messages and UI
    const userMsg: ChatMessage = { role: 'user', content: prompt };
    if (typeof client.addMessage === 'function') {
      client.addMessage(userMsg);
    }
    setChatMessages((prev) => [...prev, userMsg]);
    setPrompt('');
    // Track message count before LLM call
    try {
      const llmOutput = await ChatWithFunctionCalls({
        llmClient: client,
        mcpClient: mcpClientRef.current,
        llmParams: {
          body: {
            max_tokens: 128
          },
          temperature: 0.1,
          top_p: 1.0,
        }
      });
      // Append the string return to setChatMessages as an assistant message
      if (llmOutput && llmOutput.trim().length > 0) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: llmOutput }]);
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      console.log(`[LLM] Error: ${msg}`);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `[LLM] Error: ${msg}` }]);
    }
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
      <form
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}
        onSubmit={e => { e.preventDefault(); handleCallLLM(); }}
      >
        <input
          type="text"
          value={prompt}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setPrompt(e.target.value)}
          placeholder="Enter your Prompt here, like 'What is the current time in Melbourne?' or 'What date is last Saturday in London?'"
          style={{ width: 800, marginRight: 10 }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleCallLLM();
            }
          }}
        />
        <button type="submit">Call LLM</button>
      </form>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <div>For debug purpose. Press [F12] to see all console debug messages --&gt; </div>
        <button type="button" style={{ width: 80 }} onClick={handleCallMCP}>Call MCP</button>
        <button type="button" style={{ width: 80 }} onClick={handleCallAPI}>Call API</button>
      </div>
    </div>
  );
}

export default App;
