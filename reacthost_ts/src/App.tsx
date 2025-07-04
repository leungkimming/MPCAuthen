import React, { useState, useEffect, useRef, FormEvent, 
  ChangeEvent, KeyboardEvent } from 'react';
import './App.css';
import { callMCPTool, ChatMessage, createLLMClient, ChatWithFunctionCalls, 
  LLMClient, getErrorMessage, connectMCP } from './mcphelper';

function App() {
  const [prompt, setPrompt] = useState<string>('');
  const [mcpStatus, setMcpStatus] = useState<string>('Disconnected');
  const mcpClientRef = useRef<any>(null);
  const mcpClientRef_1 = useRef<any>(null); // For testing multiple MCP client reference
  const LLMClientRef = useRef<LLMClient | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'system', content: "You are a helpful assistant, delivering answer including the user's login ID as prefix of the response." }
  ]);

  useEffect(() => {
    (async () => {
      try {
        const client = await connectMCP("https://localhost:44322/sse");
        mcpClientRef.current = client;
        setMcpStatus("Connected");
      } catch (err) {
        setMcpStatus("Error");
      }
    })();
    return () => {
      if (mcpClientRef.current && typeof mcpClientRef.current.Disconnect === 'function') {
        mcpClientRef.current.Disconnect();
      }
    };
  }, []);
  // Initialize more MCP clients as needed

  // Fetch appsettings.json from public folder and initialize LLMClientRef
  useEffect(() => {
    fetch('/appsettings.json')
      .then(res => res.json())
      .then(config => {
        const endpoint = config.LLMProxy?.EndPoint;
        if (endpoint) {
          LLMClientRef.current = createLLMClient(endpoint);
          LLMClientRef.current.addMessage(chatMessages[0]); // Sync system message to LLM client
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
        mcpClients: [mcpClientRef.current], // Can pass multiple MCP clients
        llmParams: {
          body: {
            max_tokens: 256
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
      <div className="header-title">ReactJS UI Chat App with MCP Server support</div>
      <div className={`status ${mcpStatus.toLowerCase()}`}>MCP Server Connection Status: <b>{mcpStatus}</b></div>
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
                // Remove inline styles, use CSS classes
              >
                {msg.role === 'user' && <span>[User] </span>}
                {msg.role === 'assistant' && <span>[LLM] </span>}
                {msg.role !== 'user' && msg.role !== 'assistant' && <span>[{msg.role}] </span>}
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
