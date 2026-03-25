import React, { useEffect, useState } from 'react';
import axios from 'axios';
import GraphView from './components/GraphView';
import ChatPanel from './components/ChatPanel';
import { Network, Moon, Sun } from 'lucide-react';

function App() {
  const [graphData, setGraphData] = useState(null);
  const [nodeToChat, setNodeToChat] = useState(null);
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());
  const [error, setError] = useState('');
  const [theme, setTheme] = useState('light');

  const isDark = theme === 'dark';

  useEffect(() => {
    const fetchGraphData = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/graph');
        setGraphData(res.data);
      } catch (err) {
        console.error('Failed to fetch graph data:', err);
        setError('Could not connect to the backend. Please ensure the FastAPI server is running.');
      }
    };
    fetchGraphData();
  }, []);

  return (
    <div className={`flex flex-col h-screen overflow-hidden font-sans transition-colors duration-300 ${isDark ? 'bg-[#0B1120]' : 'bg-slate-50'}`}>
      {/* Header */}
      <header className={`px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-10 border-b transition-colors duration-300 ${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <Network className="w-5 h-5" />
          </div>
          <h1 className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
            Context Graph Query System
          </h1>
        </div>
        
        {/* Theme Toggle */}
        <button 
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className={`p-2 rounded-lg border transition-colors ${isDark ? 'bg-[#0F172A] border-slate-700 text-yellow-400 hover:bg-slate-800' : 'bg-slate-100 border-slate-300 text-indigo-600 hover:bg-slate-200'}`}
          title="Toggle Theme"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 p-6 gap-6 overflow-hidden">
        {error ? (
          <div className={`flex-1 flex items-center justify-center p-6 rounded-lg border ${isDark ? 'bg-red-900/20 text-red-400 border-red-900/50' : 'bg-red-50 text-red-600 border-red-200'}`}>
            {error}
          </div>
        ) : (
          <>
            {/* Graph Visualization (Left) */}
            <div className={`flex-1 min-w-0 h-full min-h-[500px] overflow-hidden drop-shadow-sm rounded-lg relative border transition-colors duration-300 ${isDark ? 'bg-[#0B1120] border-[#334155]' : 'bg-white border-slate-200'}`}>
              <GraphView 
                graphData={graphData} 
                onNodeClick={(node) => {
                  if (node) setNodeToChat(`${node.type.replace(/_/g, ' ')}: ${node.id}`);
                }}
                highlightedNodes={highlightedNodes}
                theme={theme}
              />
            </div>

            {/* Chat Interface (Right) */}
            <div className="w-[450px] shrink-0 h-full flex flex-col drop-shadow-sm transition-all focus-within:ring-2 ring-blue-500 rounded-lg">
              <ChatPanel nodeToChat={nodeToChat} onHighlightNodes={setHighlightedNodes} theme={theme} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
