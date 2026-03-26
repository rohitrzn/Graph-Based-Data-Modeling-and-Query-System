import React, { useEffect, useState } from 'react';
import axios from 'axios';
import GraphView from './components/GraphView';
import ChatPanel from './components/ChatPanel';
import { Network, Moon, Sun } from 'lucide-react';
import { apiUrl } from './config';

function App() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const fullGraphData = React.useRef(null);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [nodeToChat, setNodeToChat] = useState(null);
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());
  const [highlightedLinks, setHighlightedLinks] = useState(new Set());
  const [error, setError] = useState('');
  const [theme, setTheme] = useState('light');

  const isDark = theme === 'dark';

  useEffect(() => {
    const fetchGraphData = async () => {
      try {
        const res = await axios.get(apiUrl('/api/graph'));
        fullGraphData.current = res.data;
        
        // Initial view: only Header nodes (non-items)
        const initialNodes = res.data.nodes.filter(n => !n.is_item);
        const nodeIds = new Set(initialNodes.map(n => n.id));
        const initialLinks = res.data.links.filter(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            return nodeIds.has(s) && nodeIds.has(t);
        });
        
        setGraphData({ nodes: initialNodes, links: initialLinks });
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
                  if (!node || !graphData) return;
                  
                  // 1. Copy Data to Chat Assistant (Populate Query Bar)
                  setNodeToChat(`${node.type.replace(/_/g, ' ')}: ${node.id}`);

                  // 2. Toggle Highlighting Logic
                  if (highlightedNodes.has(node.id)) {
                    setHighlightedNodes(new Set());
                    setHighlightedLinks(new Set());
                    return;
                  }

                  // Calculate Neighborhood Highlights
                  const newHighlightedNodes = new Set();
                  const newHighlightedLinks = new Set();
                  newHighlightedNodes.add(node.id);
                  graphData.links.forEach(link => {
                    const sid = String(typeof link.source === 'object' ? link.source.id : link.source);
                    const tid = String(typeof link.target === 'object' ? link.target.id : link.target);
                    if (sid === node.id || tid === node.id) {
                      newHighlightedNodes.add(sid);
                      newHighlightedNodes.add(tid);
                      newHighlightedLinks.add(`${sid}-${tid}`);
                      newHighlightedLinks.add(`${tid}-${sid}`);
                    }
                  });
                  setHighlightedNodes(newHighlightedNodes);
                  setHighlightedLinks(newHighlightedLinks);
                }}
                onNodeRightClick={(node) => {
                  if (!node || !fullGraphData.current) return;
                  
                  const isExpanded = expandedNodes.has(node.id);
                  const nextExpanded = new Set(expandedNodes);
                  if (isExpanded) nextExpanded.delete(node.id);
                  else nextExpanded.add(node.id);
                  
                  setExpandedNodes(nextExpanded);
                  
                  // 1. Double check highlights (Auto-highlight the expanded node)
                  const newHighlightNodes = new Set(highlightedNodes);
                  newHighlightNodes.add(node.id);

                  // 2. Re-calculate the visible subset
                  const visibleNodes = fullGraphData.current.nodes.filter(n => !n.is_item);
                  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
                  
                  // Add items directly connected to any expanded node
                  fullGraphData.current.links.forEach(l => {
                    const sid = String(typeof l.source === 'object' ? l.source.id : l.source);
                    const tid = String(typeof l.target === 'object' ? l.target.id : l.target);
                    
                    if (nextExpanded.has(sid) || nextExpanded.has(tid)) {
                      visibleNodeIds.add(sid);
                      visibleNodeIds.add(tid);
                      // Auto-highlight items as well? Let's stay with the header for now to avoid clutter
                    }
                  });

                  // Build the node list, inheriting coordinates + small jitter to prevent "teleporting"
                  const nextNodes = fullGraphData.current.nodes
                    .filter(n => visibleNodeIds.has(n.id))
                    .map(n => {
                      const existing = graphData.nodes.find(en => en.id === n.id);
                      if (existing) return existing;
                      // New child node: spawn it NEAR parent with tiny random offset to prevent overlap-explosions
                      return { 
                        ...n, 
                        x: node.x + (Math.random() - 0.5) * 4, 
                        y: node.y + (Math.random() - 0.5) * 4 
                      };
                    });

                  const nextLinks = fullGraphData.current.links.filter(l => {
                    const sid = String(typeof l.source === 'object' ? l.source.id : l.source);
                    const tid = String(typeof l.target === 'object' ? l.target.id : l.target);
                    return visibleNodeIds.has(sid) && visibleNodeIds.has(tid);
                  });

                  setGraphData({ nodes: nextNodes, links: nextLinks });
                  setHighlightedNodes(newHighlightNodes);
                }}
                onNodeDoubleClick={() => {}} // Double-click disabled for now as per request
                expandedNodes={expandedNodes}
                canExpandMap={Object.fromEntries(
                    (fullGraphData.current?.nodes || [])
                      .filter(n => !n.is_item)
                      .map(n => [
                        n.id, 
                        fullGraphData.current.links.some(l => {
                          const sid = String(typeof l.source === 'object' ? l.source.id : l.source);
                          const tid = String(typeof l.target === 'object' ? l.target.id : l.target);
                          if (sid !== n.id && tid !== n.id) return false;
                          const otherId = sid === n.id ? tid : sid;
                          const otherNode = fullGraphData.current.nodes.find(node => node.id === otherId);
                          return otherNode && otherNode.is_item === true;
                        })
                      ])
                )}
                highlightedNodes={highlightedNodes}
                highlightedLinks={highlightedLinks}
                theme={theme}
              />
            </div>

            {/* Chat Interface (Right) */}
            <div className="w-[450px] shrink-0 h-full flex flex-col drop-shadow-sm transition-all focus-within:ring-2 ring-blue-500 rounded-lg">
              <ChatPanel 
                nodeToChat={nodeToChat} 
                onHighlightNodes={setHighlightedNodes}
                onHighlightLinks={setHighlightedLinks}
                graphData={graphData}
                theme={theme} 
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
