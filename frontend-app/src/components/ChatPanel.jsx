import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';

const ChatPanel = ({ nodeToChat, onHighlightNodes, onHighlightLinks, graphData, theme = 'light' }) => {
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
          if (!graphData?.nodes) return;
          const validNodeIds = new Set(graphData.nodes.map(n => String(n.id)));
          
          if (text) {
              // Extract potential IDs (numbers or alphanumeric codes)
              const words = text.split(/[\s,.-]+/);
              words.forEach(word => {
                  const clean = word.trim();
                  // Check if the word exactly matches ANY node ID in the graph
                  if (clean.length > 0 && validNodeIds.has(clean)) {
                      targetSet.add(clean);
                  }
                  // Fallback: Check if prefix-added versions exist (since the LLM might just say "320000083")
                  if (validNodeIds.has(`business_partners_${clean}`)) targetSet.add(`business_partners_${clean}`);
                  if (validNodeIds.has(`sales_order_headers_${clean}`)) targetSet.add(`sales_order_headers_${clean}`);
                  if (validNodeIds.has(`products_${clean}`)) targetSet.add(`products_${clean}`);
                  if (validNodeIds.has(`outbound_delivery_headers_${clean}`)) targetSet.add(`outbound_delivery_headers_${clean}`);
                  if (validNodeIds.has(`billing_document_headers_${clean}`)) targetSet.add(`billing_document_headers_${clean}`);
                  if (validNodeIds.has(`payments_accounts_receivable_${clean}`)) targetSet.add(`payments_accounts_receivable_${clean}`);
                  if (validNodeIds.has(`journal_entry_items_accounts_receivable_${clean}`)) targetSet.add(`journal_entry_items_accounts_receivable_${clean}`);
              });
          }
          if (dataArray) {
              dataArray.forEach(row => {
                  ['id', 'customer_id', 'company_id', 'accounting_document_id', 'sales_order', 'delivery', 'product'].forEach(key => {
                      if (row[key]) {
                          const val = String(row[key]);
                          if (validNodeIds.has(val)) targetSet.add(val);
                          else if (validNodeIds.has(`business_partners_${val}`)) targetSet.add(`business_partners_${val}`);
                          else if (validNodeIds.has(`sales_order_headers_${val}`)) targetSet.add(`sales_order_headers_${val}`);
                          else if (validNodeIds.has(`products_${val}`)) targetSet.add(`products_${val}`);
                          else if (validNodeIds.has(`outbound_delivery_headers_${val}`)) targetSet.add(`outbound_delivery_headers_${val}`);
                          else if (validNodeIds.has(`billing_document_headers_${val}`)) targetSet.add(`billing_document_headers_${val}`);
                          else if (validNodeIds.has(`payments_accounts_receivable_${val}`)) targetSet.add(`payments_accounts_receivable_${val}`);
                          else if (validNodeIds.has(`journal_entry_items_accounts_receivable_${val}`)) targetSet.add(`journal_entry_items_accounts_receivable_${val}`);
                      }
                  });
              });
          }
      };

      const updateHighlights = () => {
         if (!onHighlightNodes || !onHighlightLinks || !graphData?.links) return;
         
         // Completely re-evaluate textIds based on the full combined string so streamed tokens don't break regex
         textIds.clear();
         extractIds(userMessage.text + ' ' + currentMessage.text, null, textIds);

         // Combine textIds and sqlIds. That way, if the LLM talks about a path, 
         // the intermediate connecting nodes from the SQL data will also be highlighted 
         // allowing continuous edge paths to form.
         let finalNodesToHighlight = new Set([...textIds, ...sqlIds]);
         
         onHighlightNodes(finalNodesToHighlight);
         
         // Path Calculation: If multiple nodes are highlighted, find edges between them
         const linksToHighlight = new Set();
         if (finalNodesToHighlight.size > 1) {
             const nodeArr = Array.from(finalNodesToHighlight);
             graphData.links.forEach(l => {
                 const sid = String(typeof l.source === 'object' ? l.source.id : l.source);
                 const tid = String(typeof l.target === 'object' ? l.target.id : l.target);
                 // If the link connects any two nodes currently highlighted
                 if (finalNodesToHighlight.has(sid) && finalNodesToHighlight.has(tid)) {
                     linksToHighlight.add(`${sid}-${tid}`);
                     linksToHighlight.add(`${tid}-${sid}`); // Add both directions for easy lookup
                 }
             });
         }
         onHighlightLinks(linksToHighlight);
      };

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
