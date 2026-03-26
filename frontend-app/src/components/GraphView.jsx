import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

// Premium Theme Palettes
const THEMES = {
  dark: {
    bg: '#0B1120',
    panelBg: 'rgba(30, 41, 59, 0.95)',
    panelBorder: 'rgba(51, 65, 85, 0.5)',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    coreEdge: 'light', // handled in logic
    metaEdge: 'rgba(71, 85, 105, 0.4)',
    styles: {
      business_partners: { fill: '#60A5FA', border: '#3B82F6', label: 'Business Partners' },
      sales_order_headers: { fill: '#FBBF24', border: '#F59E0B', label: 'Sales Orders' },
      outbound_delivery_headers: { fill: '#34D399', border: '#10B981', label: 'Deliveries' },
      billing_document_headers: { fill: '#F87171', border: '#EF4444', label: 'Invoices' },
      payments_accounts_receivable: { fill: '#A78BFA', border: '#8B5CF6', label: 'Payments' },
      journal_entry_items_accounts_receivable: { fill: '#2DD4BF', border: '#14B8A6', label: 'Journal Entries' },
      products: { fill: '#D97706', border: '#B45309', label: 'Products' },
      default: { fill: '#94A3B8', border: '#64748B', label: 'Other' }
    }
  },
  light: {
    bg: '#F8FAFC',
    panelBg: 'rgba(255, 255, 255, 0.95)',
    panelBorder: 'rgba(226, 232, 240, 0.8)',
    textPrimary: '#1E293B',
    textSecondary: '#64748B',
    coreEdge: 'dark', // handled in logic
    metaEdge: 'rgba(203, 213, 225, 0.5)',
    styles: {
      business_partners: { fill: '#3B82F6', border: '#2563EB', label: 'Business Partners' },
      sales_order_headers: { fill: '#F59E0B', border: '#D97706', label: 'Sales Orders' },
      outbound_delivery_headers: { fill: '#10B981', border: '#059669', label: 'Deliveries' },
      billing_document_headers: { fill: '#EF4444', border: '#DC2626', label: 'Invoices' },
      payments_accounts_receivable: { fill: '#8B5CF6', border: '#7C3AED', label: 'Payments' },
      journal_entry_items_accounts_receivable: { fill: '#14B8A6', border: '#0D9488', label: 'Journal Entries' },
      products: { fill: '#92400E', border: '#78350F', label: 'Products' },
      default: { fill: '#94A3B8', border: '#64748B', label: 'Other' }
    }
  }
};

const SKIP_KEYS = new Set(['id', 'label', 'type', 'x', 'y', 'vx', 'vy', 'fx', 'fy', 'index', 'color', 'indexColor', '__indexColor', 'nodeVal', 'val', '__threeObj']);

const GraphView = ({ 
  graphData, 
  onNodeClick, 
  onNodeRightClick,
  onNodeDoubleClick,
  onNodeHoverProp, 
  highlightedNodes, 
  highlightedLinks, 
  theme = 'light' 
}) => {
  const fgRef = useRef();
  const containerRef = useRef();
  const tipRef = useRef();
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [showAllLinks, setShowAllLinks] = useState(false);
  
  // Ref for hover state tracking 
  const hoveredNodeRef = useRef(null);

  const t = THEMES[theme] || THEMES.light;
  const TYPE_STYLE = t.styles;
  const DEFAULT_STYLE = t.styles.default;

  // ── Container sizing ─────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      const finalW = r.width > 50 ? r.width : containerRef.current.offsetWidth || 800;
      const finalH = r.height > 50 ? r.height : containerRef.current.offsetHeight || 600;
      if (finalW > 20 && finalH > 20) {
        setWidth(Math.floor(finalW));
        setHeight(Math.floor(finalH));
      }
    };
    measure();
    const timer = setTimeout(measure, 500);
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, []);

  // ── Data Filtering & Degree Map ──────────────────────────────
  const displayData = useMemo(() => {
    if (!graphData?.nodes) return { nodes: [], links: [] };
    
    // Safety check: Create a quick lookup for valid node boundaries to prevent d3-force from crashing
    // if backend generates a link to a missing or non-core node.
    const validNodeIds = new Set(graphData.nodes.map(n => String(n.id)));
    
    // Always map arrays to new objects to prevent react-force-graph crashes on filter changes
    const links = (graphData.links || [])
      .filter(l => showAllLinks || l.is_core !== false)
      .filter(l => {
          const s = typeof l.source === 'object' ? l.source.id : String(l.source);
          const t = typeof l.target === 'object' ? l.target.id : String(l.target);
          return validNodeIds.has(s) && validNodeIds.has(t);
      })
      .map(l => ({...l}));
      
    return { nodes: graphData.nodes.map(n => ({...n})), links };
  }, [graphData, showAllLinks]);

  const degreeMap = useMemo(() => {
    const map = {};
    displayData.links.forEach(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      if (s) map[s] = (map[s] || 0) + 1;
      if (t) map[t] = (map[t] || 0) + 1;
    });
    return map;
  }, [displayData]);

  // ── D3 Force Tuning & Actions ───────────────────────────────────────────
  useEffect(() => {
    if (!fgRef.current || !displayData?.nodes?.length) return;
    const fg = fgRef.current;
    fg.d3Force('link')?.distance(30);
    fg.d3Force('charge')?.strength(-150);
  }, [displayData, degreeMap]);

  // ── Mouse Follow Tooltip (Viewport-Aware & Crash-Proof) ────────────────
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (tipRef.current && hoveredNodeRef.current && containerRef.current) {
        const tipEl = tipRef.current;
        // Wait for it to render to get actual dimensions
        if (tipEl.offsetWidth === 0) return;

        const rect = containerRef.current.getBoundingClientRect();
        
        // Base coordinates initially placed 16px to the bottom-right of cursor
        let x = e.clientX - rect.left + 16;
        let y = e.clientY - rect.top + 16;
        
        // Calculate potential overflow against actual window boundaries
        const overflowX = (e.clientX + tipEl.offsetWidth + 20) - window.innerWidth;
        const overflowY = (e.clientY + tipEl.offsetHeight + 20) - window.innerHeight;

        // If it overflows the right side, flip it to the left side of the cursor
        if (overflowX > 0) {
          x = (e.clientX - rect.left) - tipEl.offsetWidth - 16;
        }
        
        // If it overflows the bottom, flip it ABOVE the cursor
        if (overflowY > 0) {
          y = (e.clientY - rect.top) - tipEl.offsetHeight - 16;
        }

        // Final safety clamp to prevent it from escaping the top/left of the container entirely
        tipEl.style.left = `${Math.max(8, x)}px`;
        tipEl.style.top = `${Math.max(8, y)}px`;
      }
    };
    const c = containerRef.current;
    if (c) c.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => c && c.removeEventListener('mousemove', handleMouseMove);
  }, [width, height]);

  // ── Hover Interactivity ──────────────────────────────────────────────────
  const handleNodeHover = useCallback((node) => {
    if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'default';
    hoveredNodeRef.current = node;
    
    if (tipRef.current) {
      if (node) {
        tipRef.current.style.display = 'block';
        const style = TYPE_STYLE[node.type] || DEFAULT_STYLE;
        
        let headerLabel = node.label?.split(':')[0]?.trim() || node.type;
        // Format to Title Case, convert underscores
        headerLabel = headerLabel.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        
        let html = `
          <div style="font-weight: 700; margin-bottom: 8px; font-size: 13px; color: ${t.textPrimary};">
            ${headerLabel}
          </div>
        `;
        
        const entries = Object.entries(node).filter(([k, v]) => !SKIP_KEYS.has(k) && v != null && String(v).trim() !== '');
        
        html += `
          <div style="margin-bottom: 4px; font-size: 11px; color: ${t.textPrimary}">
            <span style="font-weight: 500; color: ${t.textSecondary}">Entity:</span> ${headerLabel}
          </div>
        `;

        entries.slice(0, 10).forEach(([key, val]) => {
          let displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
          if (displayVal.length > 50) displayVal = displayVal.substring(0, 47) + '...';
          
          html += `
            <div style="margin-bottom: 4px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${t.textPrimary}">
              <span style="font-weight: 500; color: ${t.textSecondary}">${key.replace(/_/g, '')}:</span> ${displayVal}
            </div>
          `;
        });
        
        if (entries.length > 10) {
          html += `<div style="font-size: 10px; font-style: italic; color: ${t.textSecondary}; margin-top: 6px; margin-bottom: 4px;">Additional fields hidden for readability</div>`;
        }
        
        html += `
          <div style="margin-top: 6px; font-size: 11px; font-weight: 600; color: ${t.textPrimary}">
            Connections: ${degreeMap[node.id] || 0}
          </div>
        `;
        
        tipRef.current.innerHTML = html;
      } else {
        tipRef.current.style.display = 'none';
      }
    }
    
    if (onNodeHoverProp) onNodeHoverProp(node);
  }, [onNodeHoverProp, TYPE_STYLE, DEFAULT_STYLE, t, degreeMap, width, height]);

  if (!graphData?.nodes) {
    return <div className="flex items-center justify-center h-full text-slate-500" style={{ background: t.bg }}>Loading graph geometry...</div>;
  }

  return (
    <div
      ref={containerRef}
      onMouseLeave={() => handleNodeHover(null)}
      className="w-full h-full rounded-lg overflow-hidden relative transition-colors duration-300"
      style={{ background: t.bg }}
    >
      {/* Legend & Controls Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-3 pointer-events-none">
        
        {/* Controls Panel */}
        <div className="backdrop-blur border rounded-lg p-3 shadow-xl pointer-events-auto transition-colors" style={{ background: t.panelBg, borderColor: t.panelBorder }}>
          <label className="flex items-center gap-3 cursor-pointer mb-3">
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={showAllLinks} onChange={(e) => setShowAllLinks(e.target.checked)} />
              <div className={`block w-10 h-6 rounded-full transition-colors ${showAllLinks ? 'bg-blue-500' : (theme === 'dark' ? 'bg-slate-700' : 'bg-slate-300')}`}></div>
              <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showAllLinks ? 'transform translate-x-4' : ''}`}></div>
            </div>
            <span className="text-xs font-medium" style={{ color: t.textPrimary }}>Show Full Metadata Web</span>
          </label>
        </div>

        {/* Legend */}
        <div className="backdrop-blur border rounded-lg p-3 shadow-xl pointer-events-auto transition-colors" style={{ background: t.panelBg, borderColor: t.panelBorder }}>
          {Object.entries(TYPE_STYLE).map(([type, s]) => {
             if (type === 'default') return null;
             return (
              <div key={type} className="flex items-center gap-2 mb-1.5">
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', background: s.fill,
                  display: 'inline-block', flexShrink: 0, boxShadow: `0 0 8px ${s.fill}`
                }} />
                <span className="text-[11px] font-medium" style={{ color: t.textPrimary }}>{s.label}</span>
              </div>
            );
          })}
          <div className="mt-2 pt-2 border-t text-[9px] italic" style={{ borderColor: t.panelBorder, color: t.textSecondary }}>Directional particles indicate flow</div>
        </div>
      </div>

      {/* High-Performance Cursor Tooltip Container */}
      <div 
        ref={tipRef}
        style={{
          display: 'none', position: 'absolute', zIndex: 100,
          background: t.panelBg, border: `1px solid ${t.panelBorder}`, 
          backdropFilter: 'blur(8px)', borderRadius: '8px',
          padding: '12px 14px', minWidth: '220px', maxWidth: '300px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)', pointerEvents: 'none',
          lineHeight: '1.4'
        }}
      />

      {width > 0 && height > 0 && (
        <ForceGraph2D
          ref={fgRef}
          graphData={displayData}
          width={width}
          height={height}
          backgroundColor={t.bg}
          nodeVal={node => Math.max(1, Math.min(degreeMap[node.id] || 1, 3))}
          warmupTicks={120}
          cooldownTicks={100}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.5}
          onNodeHover={handleNodeHover}
          onNodeClick={(node) => onNodeClick?.(node)}
          onNodeRightClick={(node, event) => {
            if (event && event.preventDefault) event.preventDefault();
            onNodeRightClick?.(node);
          }}
          onNodeDoubleClick={(node) => onNodeDoubleClick?.(node)}
          
          // Edge Styling
          linkColor={link => {
             if (!highlightedLinks?.size) return link.is_core === false ? t.metaEdge : (theme === 'dark' ? 'rgba(100, 116, 139, 0.25)' : 'rgba(148, 163, 184, 0.4)');
             const sid = String(typeof link.source === 'object' ? link.source.id : link.source);
             const tid = String(typeof link.target === 'object' ? link.target.id : link.target);
             if (highlightedLinks.has(`${sid}-${tid}`) || highlightedLinks.has(`${tid}-${sid}`)) {
                 return theme === 'dark' ? 'rgba(234, 179, 8, 0.9)' : 'rgba(217, 119, 6, 0.9)'; // Bright Amber
             }
             // Dim non-highlighted links significantly
             return theme === 'dark' ? 'rgba(51, 65, 85, 0.15)' : 'rgba(226, 232, 240, 0.2)';
          }}
          linkWidth={link => {
             const sid = String(typeof link.source === 'object' ? link.source.id : link.source);
             const tid = String(typeof link.target === 'object' ? link.target.id : link.target);
             if (highlightedLinks?.has(`${sid}-${tid}`) || highlightedLinks?.has(`${tid}-${sid}`)) return 3.0;
             return link.is_core === false ? 0.3 : 0.8;
          }}
          linkDirectionalParticles={link => {
             const sid = String(typeof link.source === 'object' ? link.source.id : link.source);
             const tid = String(typeof link.target === 'object' ? link.target.id : link.target);
             if (highlightedLinks?.has(`${sid}-${tid}`) || highlightedLinks?.has(`${tid}-${sid}`)) return 6;
             return link.is_core === false ? 0 : 2;
          }}
          linkDirectionalParticleWidth={link => {
             const sid = String(typeof link.source === 'object' ? link.source.id : link.source);
             const tid = String(typeof link.target === 'object' ? link.target.id : link.target);
             if (highlightedLinks?.has(`${sid}-${tid}`) || highlightedLinks?.has(`${tid}-${sid}`)) return 4.0;
             return 1.5;
          }}
          linkDirectionalParticleSpeed={link => {
             const sid = String(typeof link.source === 'object' ? link.source.id : link.source);
             const tid = String(typeof link.target === 'object' ? link.target.id : link.target);
             if (highlightedLinks?.has(`${sid}-${tid}`) || highlightedLinks?.has(`${tid}-${sid}`)) return 0.012;
             return 0.006;
          }}
          linkDirectionalParticleColor={link => {
             const sid = String(typeof link.source === 'object' ? link.source.id : link.source);
             const tid = String(typeof link.target === 'object' ? link.target.id : link.target);
             if (highlightedLinks?.has(`${sid}-${tid}`) || highlightedLinks?.has(`${tid}-${sid}`)) {
                 return theme === 'dark' ? '#FDE047' : '#F59E0B'; // Bright Gold particles
             }
             return theme === 'dark' ? '#CBD5E1' : '#64748B';
          }}
          
          nodeCanvasObject={(node, ctx, globalScale) => {
            const deg = degreeMap[node.id] || 1;
            const isHovered = hoveredNodeRef.current?.id === node.id;
            const isHigh = !!highlightedNodes?.has(node.id);
            const style = TYPE_STYLE[node.type] || DEFAULT_STYLE;

            // Give AI highlighted nodes a noticeably larger size bump (reduced by ~12% from previous version)
            const radius = isHigh ? Math.max(8, 12.5 / globalScale) : isHovered ? 4.5 : Math.min(2 + Math.log10(deg), 4);

            ctx.shadowColor = style.fill; 
            // Enhance glow dramatically if node is highlighted
            ctx.shadowBlur = isHigh ? 35 : isHovered ? 15 : Math.min(deg, 8);

            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = style.fill; // Now using native color even for highlights
            ctx.fill();
            
            // Draw a prominent thick outer ring for highlighted nodes to distinguish them
            if (isHigh) {
              ctx.strokeStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.2)';
              ctx.lineWidth = 4 / globalScale;
              ctx.stroke();
            }
            ctx.shadowBlur = 0;

            if (isHovered || (deg > 15 && globalScale > 1.2)) {
              const label = (node.label || '').split(':').pop().trim();
              const size = Math.max(2, 4 / globalScale);
              ctx.font = `500 ${size}px Inter, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              const textWidth = ctx.measureText(label.length > 15 ? label.slice(0, 13) + '…' : label).width;
              ctx.fillStyle = theme === 'dark' ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)'; 
              ctx.fillRect(node.x - textWidth/2 - 1/globalScale, node.y + radius + 1/globalScale, textWidth + 2/globalScale, size + 1/globalScale);
              
              ctx.fillStyle = theme === 'dark' ? '#E2E8F0' : '#1E293B'; 
              ctx.fillText(label.length > 15 ? label.slice(0, 13) + '…' : label, node.x, node.y + radius + size/2 + 1/globalScale);
            }
          }}
        />
      )}
    </div>
  );
};

export default GraphView;
