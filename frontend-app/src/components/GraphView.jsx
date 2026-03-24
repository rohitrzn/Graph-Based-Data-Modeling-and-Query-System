import React, { useRef, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const GraphView = ({ graphData, onNodeClick, highlightedNodes }) => {
  const fgRef = useRef();

  useEffect(() => {
    if (fgRef.current && graphData) {
      fgRef.current.d3Force('charge').strength(-400);
      fgRef.current.d3Force('link').distance(100);
    }
  }, [graphData]);

  if (!graphData || !graphData.nodes) {
    return <div className="flex items-center justify-center h-full text-slate-400">Loading graph data...</div>;
  }

  // Colors are natively assigned by the nodeAutoColorBy prop instead

  return (
    <div className="w-full h-full border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeLabel="label"
        nodeAutoColorBy="type"
        nodeVal={(node) => highlightedNodes && highlightedNodes.has(node.id) ? 12 : 2}
        onNodeClick={onNodeClick}
        nodeRelSize={3}
        linkWidth={0.2}
        width={window.innerWidth * 0.6}
        nodeCanvasObjectMode={() => "after"}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const isHighlighted = highlightedNodes && highlightedNodes.has(node.id);
          if (isHighlighted) {
             // draw a prominent red ring around the enalrged node
             // default radius calculation: Math.sqrt(node.val) * nodeRelSize
             // For val=12, relSize=5, radius is ~ 17.3
             const radius = Math.sqrt(12) * 5 + 3; 
             ctx.beginPath();
             ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
             ctx.strokeStyle = '#ef4444';
             ctx.lineWidth = 3 / globalScale; // Thicker ring, scaled correctly on zoom
             ctx.stroke();
          }
        }}
      />
    </div>
  );
};

export default GraphView;
