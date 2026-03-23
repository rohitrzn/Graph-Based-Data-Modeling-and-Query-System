import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, Bot, User, Database, Loader2 } from 'lucide-react';

const ChatPanel = ({ onNodeSelect }) => {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hello! Ask me any questions about the data.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  const endRef = useRef();
  
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const userMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);
    setInput('');
    
    try {
      const res = await axios.post('http://127.0.0.1:8000/api/query', { query: input });
      
      const assistantMessage = {
        role: 'assistant',
        text: res.data.response,
        sql: res.data.sql,
        metadata: res.data.data
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Sorry, I encountered an error. Ensure the backend is running and the API key is valid.',
        isError: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white border border-slate-200 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b border-slate-200 bg-slate-50 rounded-t-lg">
        <Bot className="text-blue-600 w-5 h-5" />
        <h2 className="font-semibold text-slate-800">Query Assistant</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <Bot className="w-4 h-4" />
              </div>
            )}
            
            <div className={`max-w-[80%] rounded-lg p-3 text-sm ${
              msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'
            }`}>
              <p className="whitespace-pre-wrap">{msg.text}</p>
              
              {msg.sql && (
                <div className="mt-3 p-2 bg-slate-800 rounded text-green-400 font-mono text-xs overflow-x-auto">
                  {msg.sql}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3 justify-start">
             <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <Bot className="w-4 h-4" />
              </div>
             <div className="max-w-[80%] rounded-lg p-3 bg-slate-100 flex items-center">
                 <Loader2 className="w-4 h-4 text-slate-600 animate-spin" />
             </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-200 bg-white rounded-b-lg">
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="flex-1 p-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ask a question about the graph..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
