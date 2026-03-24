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

  // Generate colors based on node type
  const getNodeColor = (node) => {
    let baseColor = '#94a3b8'; // slate default
    switch(node.type) {
      case 'Customer': baseColor = '#3b82f6'; break; // blue
      case 'Company': baseColor = '#8b5cf6'; break; // purple
      case 'BillingDocument': baseColor = '#10b981'; break; // green
      case 'AccountingDocument': baseColor = '#f59e0b'; break; // amber
    }
    return baseColor;
  };

  return (
    <div className="w-full h-full border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeLabel="label"
        nodeColor={getNodeColor}
        nodeVal={(node) => highlightedNodes && highlightedNodes.has(node.id) ? 12 : 3}
        onNodeClick={onNodeClick}
        nodeRelSize={5}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.25}
        width={window.innerWidth * 0.6} // roughly 60% width depending on layout
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
