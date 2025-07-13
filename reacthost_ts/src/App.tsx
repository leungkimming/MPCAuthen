import React, { useState, useEffect, useRef, FormEvent, 
  ChangeEvent, KeyboardEvent } from 'react';
import './App.css';
import { callMCPTool, ChatMessage, createLLMClient, ChatWithFunctionCalls, 
  LLMClient, getErrorMessage, connectMCP } from './mcphelper';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import BookUrgentMeeting from './BookUrgentMeeting';
import Dialog from '@mui/material/Dialog';

function App() {
  const [prompt, setPrompt] = useState<string>('');
  const [mcpStatus, setMcpStatus] = useState<string>('Disconnected');
  const mcpClientRef = useRef<any>(null);
  const mcpClientRef_1 = useRef<any>(null); // For testing multiple MCP client reference
  const LLMClientRef = useRef<LLMClient | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'system', content: "You are a helpful assistant, delivering short answer, including the user's login ID as prefix of the response." }
  ]);
  const [showBookMeetingDialog, setShowBookMeetingDialog] = useState(false);
  const [bookMeetingParams, setBookMeetingParams] = useState<{jsonParam?: string}>({});
  const bookMeetingPromiseRef = useRef<((result: any) => void) | null>(null);

  // Create MCP Client with SSE connection to MCP server
  useEffect(() => {
    (async () => {
      try {
        const endpoint = process.env.REACT_APP_MCP_ENDPOINT;
        if (endpoint) {
          const client = await connectMCP(endpoint);
          mcpClientRef.current = client;
          setMcpStatus("Connected");
        } else {
          console.error('REACT_APP_MCP_ENDPOINT is not set in .env');
        }
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

  // Create an LLM client and add initial messages, mcp tools and local function call
  useEffect(() => {
    if (!mcpClientRef.current) {
      console.log('MCP client is not yet initialized');
      return;
    }
    const endpoint = process.env.REACT_APP_LLM_PROXY_ENDPOINT;
    if (endpoint) {
      LLMClientRef.current = createLLMClient(endpoint); // a LLM Proxy API. API Key to be provided by API
      LLMClientRef.current.addMessage(chatMessages[0]);
      LLMClientRef.current.addMCPClient(mcpClientRef.current);
      // descriptions are critical for LLM to understand when and how to use the local function call tool
      const bookMeetingTool = {
        type: 'function',
        function: {
          name: 'navigate2bookmeetings',
          description: 'book an urgent meeting in the city and datetime',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City to book the meeting in' },
              DateTime: { type: 'string', description: 'Date and time for the meeting' },
              Description: { type: 'string', description: 'Agenda or meeting description' }
            },
            required: ['city', 'DateTime']
          }
        }
      };
      LLMClientRef.current.addTools(bookMeetingTool);
    } else {
      console.error('REACT_APP_LLM_PROXY_ENDPOINT is not set in .env');
    }
  }, [mcpClientRef.current]);

  // Demo direct call API
  const handleCallAPI = async (e: FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    console.log('[MCP] Calling API Controller Time...');
    const endpoint = process.env.REACT_APP_API_ENDPOINT || '';
    try {
      const response = await fetch(endpoint, {
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

  // Demo direct call MCP tool
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

  // Post user prompt to LLM and handle function calls
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
    // Call LLM with function calling handler
    try {
      const llmOutput = await ChatWithFunctionCalls({
        llmClient: client,
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

  // Replace navigate2bookmeetings to open dialog and return a Promise
  useEffect(() => {
    (globalThis as any).navigate2bookmeetings = (jsonParam: string) => {
      setBookMeetingParams({ jsonParam });
      setShowBookMeetingDialog(true);
      return new Promise(resolve => {
        bookMeetingPromiseRef.current = resolve;
      });
    };
  }, []);

  // Update handleBookMeetingComplete to resolve the Promise
  const handleBookMeetingComplete = (data?: {city?: string, DateTime?: string, description?: string, participants?: string, result?: string}) => {
    setShowBookMeetingDialog(false);
    if (bookMeetingPromiseRef.current) {
      bookMeetingPromiseRef.current(data?.result);
      bookMeetingPromiseRef.current = null;
    }
  };

  return (
    <Router>
      <div className="App" style={{ padding: 15 }}>
        <div className="header-title">ReactJS UI Chat App with MCP Server support</div>
        <nav style={{ margin: '10px 0' }}>
          <a href="#" onClick={e => { e.preventDefault(); setBookMeetingParams({}); setShowBookMeetingDialog(true); }}>Book Urgent Meeting</a>
        </nav>
        <Dialog open={showBookMeetingDialog} onClose={() => setShowBookMeetingDialog(false)} maxWidth="sm" fullWidth>
          <BookUrgentMeeting onComplete={handleBookMeetingComplete} jsonParam={bookMeetingParams.jsonParam} />
        </Dialog>
        <Routes>
          <Route path="/" element={
            <>
              <div className={`status ${mcpStatus.toLowerCase()}`}>MCP Server Connection Status: <b>{mcpStatus}</b></div>
              <div style={{ marginTop: 5, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                {/* Chat message list */}
                <div
                  className="chat-output"
                  style={{ width: 800, height: 550, overflowY: 'auto', background: '#f8f8f8', padding: 10, borderRadius: 6, border: '1px solid #ccc' }}
                >
                  {chatMessages.map((msg, idx) => (
                    msg.content && (
                      <div
                        key={idx}
                        className={`chat-message ${msg.role}`}
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
            </>
          } />
        </Routes>
      </div>
    </Router>
  );
}

export function navigate2bookmeetings(jsonParam: string): Promise<{ jsonParam?: string }> {
  return Promise.resolve({ jsonParam }); 
}

// Ensure the function is available on globalThis for tool call execution
(globalThis as any).navigate2bookmeetings = navigate2bookmeetings;

export default App;
