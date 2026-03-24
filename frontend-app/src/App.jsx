import React, { useEffect, useState } from 'react';
import axios from 'axios';
import GraphView from './components/GraphView';
import ChatPanel from './components/ChatPanel';
import { Network } from 'lucide-react';

function App() {
  const [graphData, setGraphData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());
  const [error, setError] = useState('');

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
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <Network className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Context Graph Query System</h1>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 p-6 gap-6 overflow-hidden">
        {error ? (
          <div className="flex-1 flex items-center justify-center p-6 bg-red-50 text-red-600 rounded-lg border border-red-200">
            {error}
          </div>
        ) : (
          <>
            {/* Graph Visualization (Left) */}
            <div className="flex-1 min-w-0 h-full drop-shadow-sm rounded-lg relative bg-white">
              <GraphView 
                graphData={graphData} 
                onNodeClick={(node) => setSelectedNode(node)} 
                highlightedNodes={highlightedNodes}
              />
              
              {/* Selected Node Overlay */}
              {selectedNode && (
                <div className="absolute top-4 right-4 max-w-sm bg-white p-4 rounded-lg shadow-lg border border-slate-200 pointer-events-auto z-10 transition-all opacity-95 hover:opacity-100">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-slate-800">{selectedNode.label}</h3>
                    <button 
                      onClick={() => setSelectedNode(null)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      ×
                    </button>
                  </div>
                  <div className="text-sm text-slate-600 space-y-1 max-h-64 overflow-y-auto pr-2 mt-2">
                    <p><span className="font-medium">Type:</span> {selectedNode.type}</p>
                    <p><span className="font-medium">ID:</span> {selectedNode.id}</p>
                    <div className="border-t border-slate-100 my-2"></div>
                    {Object.entries(selectedNode)
                      .filter(([key, val]) => !['x', 'y', 'vx', 'vy', 'index', 'color', 'label', 'id', 'type', 'indexColor', '__indexColor'].includes(key) && val !== null && val !== undefined)
                      .map(([key, value]) => (
                        <p key={key}>
                          <span className="font-medium capitalize text-slate-500">{key.replace(/_/g, ' ')}:</span>{' '}
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </p>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Chat Interface (Right) */}
            <div className="w-[450px] shrink-0 h-full flex flex-col drop-shadow-sm transition-all focus-within:ring-2 ring-blue-500 rounded-lg">
              <ChatPanel onNodeSelect={setSelectedNode} onHighlightNodes={setHighlightedNodes} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
