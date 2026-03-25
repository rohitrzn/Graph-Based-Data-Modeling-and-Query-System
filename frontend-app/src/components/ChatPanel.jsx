import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';

const ChatPanel = ({ nodeToChat, onHighlightNodes, theme = 'light' }) => {
  const [messages, setMessages] = useState([{ role: 'assistant', text: 'Hello! Ask me any questions about the data.' }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef();
  
  const isDark = theme === 'dark';

  useEffect(() => {
    if (nodeToChat) {
      setInput(prev => prev ? `${prev} ${nodeToChat}` : nodeToChat);
    }
  }, [nodeToChat]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const userMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);
    setInput('');
    
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
      
      let currentMessage = { role: 'assistant', text: '', sql: '', metadata: [], type: 'streaming' };
      setMessages(prev => [...prev, currentMessage]);
      setLoading(false);

      let textIds = new Set(), sqlIds = new Set();
      
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
         textIds.forEach(id => { if (sqlIds.has(id)) validTextIds.add(id); });

         if (validTextIds.size > 0) onHighlightNodes(validTextIds);
         else if (sqlIds.size > 0) onHighlightNodes(sqlIds);
         else onHighlightNodes(textIds);
      };

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
                newMessages[newMessages.length - 1] = { ...newMessages[newMessages.length - 1], sql: currentMessage.sql, metadata: currentMessage.metadata, text: currentMessage.text };
                return newMessages;
              });
              updateHighlights();
            } catch (e) { /* ignore */ }
          }
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, I encountered an error receiving the stream. Ensure the backend is running.', isError: true }]);
      setLoading(false);
    }
  };

  return (
    <div className={`flex flex-col h-full w-full rounded-lg shadow-sm shrink-0 border transition-colors duration-300 ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}>
      {/* Header */}
      <div className={`flex items-center gap-2 p-4 border-b rounded-t-lg transition-colors duration-300 ${isDark ? 'bg-[#1E293B] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
        <Bot className={`w-5 h-5 ${isDark ? 'text-blue-500' : 'text-blue-600'}`} />
        <h2 className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Query Assistant</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                <Bot className="w-4 h-4" />
              </div>
            )}
            
            <div className={`max-w-[80%] rounded-lg p-3 text-sm flex flex-col ${
              msg.role === 'user' ? 'bg-blue-600 text-white shadow-sm' 
              : isDark ? 'bg-[#1E293B] border border-slate-700/50 text-slate-300 shadow-sm' 
              : 'bg-slate-100 border border-slate-200 text-slate-800 shadow-sm'
            }`}>
              <p className="whitespace-pre-wrap">{msg.text}</p>
              
              {msg.sql && (
                <div className={`mt-3 p-2 rounded font-mono text-xs overflow-x-auto ${isDark ? 'bg-[#0B1120] border border-slate-800 text-emerald-400' : 'bg-slate-800 border border-slate-700 text-green-400'}`}>
                  {msg.sql}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3 justify-start">
             <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                <Bot className="w-4 h-4" />
              </div>
             <div className={`max-w-[80%] rounded-lg p-3 flex items-center shadow-sm ${isDark ? 'bg-[#1E293B] border border-slate-700/50' : 'bg-slate-100 border border-slate-200'}`}>
                 <Loader2 className={`w-4 h-4 animate-spin ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
             </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className={`p-4 border-t rounded-b-lg transition-colors duration-300 ${isDark ? 'bg-[#1E293B] border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            className={`flex-1 p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
              isDark ? 'bg-[#0F172A] border border-slate-700 text-slate-200 placeholder-slate-500' 
              : 'bg-white border border-slate-300 text-slate-800 placeholder-slate-400'
            }`}
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
