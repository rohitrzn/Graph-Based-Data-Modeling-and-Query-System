import React, { useRef, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const GraphView = ({ graphData, onNodeClick }) => {
  const fgRef = useRef();

  useEffect(() => {
    if (fgRef.current && graphData) {
      fgRef.current.d3Force('charge').strength(-200);
    }
  }, [graphData]);

  if (!graphData || !graphData.nodes) {
    return <div className="flex items-center justify-center h-full text-slate-400">Loading graph data...</div>;
  }

  // Generate colors based on node type
  const getNodeColor = (node) => {
    switch(node.type) {
      case 'Customer': return '#3b82f6'; // blue
      case 'Company': return '#8b5cf6'; // purple
      case 'BillingDocument': return '#10b981'; // green
      case 'AccountingDocument': return '#f59e0b'; // amber
      default: return '#94a3b8'; // slate
    }
  };

  return (
    <div className="w-full h-full border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeLabel="label"
        nodeColor={getNodeColor}
        onNodeClick={onNodeClick}
        nodeRelSize={6}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.25}
        width={window.innerWidth * 0.6} // roughly 60% width depending on layout
      />
    </div>
  );
};

export default GraphView;
