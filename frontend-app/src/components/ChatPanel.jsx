import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, Bot, User, Database, Loader2 } from 'lucide-react';

const ChatPanel = ({ onNodeSelect, onHighlightNodes }) => {
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
    
    // Clear previous highlights
    if (onHighlightNodes) onHighlightNodes(new Set());

    const historyPayload = messages
        .filter((msg, index) => index > 0 && !msg.isError)
        .map(msg => ({ role: msg.role, content: msg.text }));

    try {
      const response = await fetch('http://127.0.0.1:8000/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: input, history: historyPayload }),
      });
      
      if (!response.ok) throw new Error('Network error');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let currentMessage = {
        role: 'assistant',
        text: '',
        sql: '',
        metadata: [],
        type: 'streaming'
      };
      
      setMessages(prev => [...prev, currentMessage]);
      setLoading(false); // Stop standard spinner since streaming started

      let textIds = new Set();
      let sqlIds = new Set();
      
      const extractIds = (text, dataArray, targetSet) => {
          if (text) {
              const words = text.split(/\s+/);
              words.forEach(word => {
                  const clean = word.replace(/[^a-zA-Z0-9-]/g, '');
                  if (clean.length > 0) {
                     targetSet.add(`customer_${clean}`);
                     targetSet.add(`company_${clean}`);
                     targetSet.add(`billing_${clean}`);
                     targetSet.add(`accounting_${clean}`);
                  }
              });
          }
          if (dataArray) {
              dataArray.forEach(row => {
                  if (row.id) {
                      targetSet.add(`customer_${row.id}`);
                      targetSet.add(`company_${row.id}`);
                      targetSet.add(`billing_${row.id}`);
                      targetSet.add(`accounting_${row.id}`);
                  }
                  if (row.customer_id) targetSet.add(`customer_${row.customer_id}`);
                  if (row.company_id) targetSet.add(`company_${row.company_id}`);
                  if (row.accounting_document_id) targetSet.add(`accounting_${row.accounting_document_id}`);
              });
          }
      };

      const updateHighlights = () => {
         if (!onHighlightNodes) return;
         const validTextIds = new Set();
         textIds.forEach(id => {
            if (sqlIds.has(id)) validTextIds.add(id);
         });

         if (validTextIds.size > 0) {
             onHighlightNodes(validTextIds);
         } else if (sqlIds.size > 0) {
             onHighlightNodes(sqlIds);
         } else {
             onHighlightNodes(textIds);
         }
      };

      // Initial user text IDs
      extractIds(userMessage.text, null, textIds);
      updateHighlights();

      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; 
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6);
            if (!dataStr.trim()) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'metadata') {
                currentMessage.sql = data.sql;
                currentMessage.metadata = data.data;
                extractIds(null, data.data, sqlIds);
              } else if (data.type === 'text') {
                currentMessage.text += data.content;
                extractIds(data.content, null, textIds);
              } else if (data.type === 'error') {
                currentMessage.text += data.response;
              } else if (data.error) {
                currentMessage.text += data.error;
              }
              
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  ...newMessages[newMessages.length - 1],
                  sql: currentMessage.sql,
                  metadata: currentMessage.metadata,
                  text: currentMessage.text
                };
                return newMessages;
              });
              
              updateHighlights();
            } catch (e) {
              // Ignore invalid JSON chunks
            }
          }
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Sorry, I encountered an error receiving the stream. Ensure the backend is running.',
        isError: true
      }]);
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
