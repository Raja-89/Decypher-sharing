import { useState, useRef, useCallback, useMemo } from "react";
import { GraphNode, GraphEdge, graphNodes, graphEdges } from "../data/dummy";
import { entityColor, entityBadge, PALETTE } from "../theme";
import {useLocale} from "../context/LocaleContext";

// Fixed legend order so a filter change never reshuffles identity.
const TYPE_ORDER: GraphNode["type"][] = ["person", "org", "phone", "vehicle", "location", "account", "case", "event"];
const TYPE_LABEL: Record<string, string> = {
  person: "Person",
  org: "Organization",
  phone: "Phone / Comms",
  vehicle: "Vehicle",
  location: "Location",
  account: "Account",
  case: "Case",
  event: "Event",
};

interface Props {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  onNodeClick?: (node: GraphNode) => void;
  height?: number;
  showLegend?: boolean;
  filterType?: string | null;
  compact?: boolean;
  caption?: string;
}

export default function InvestigationGraph({
  nodes = graphNodes,
  edges = graphEdges,
  onNodeClick,
  height = 520,
  showLegend = true,
  filterType = null,
  compact = false,
  caption = "Evidence relationship graph",
}: Props) {
  const {locale}=useLocale();const L=(en:string,hi:string)=>locale==="hi"?hi:en;
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() =>
    Object.fromEntries(nodes.map((n) => [n.id, { x: n.x, y: n.y }]))
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Filter nodes/edges
  const visibleNodes = filterType ? nodes.filter((n) => n.type === filterType) : nodes;
  const visibleEdgeIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = filterType
    ? edges.filter((e) => visibleEdgeIds.has(e.source) && visibleEdgeIds.has(e.target))
    : edges;

  const presentTypes = useMemo(() => {
    const seen = new Set(nodes.map((n) => n.type));
    return TYPE_ORDER.filter((t) => seen.has(t));
  }, [nodes]);

  const getPos = (id: string) => positions[id] || nodes.find(n=>n.id===id) || { x: 200, y: 200 };

  // Bezier control point
  const svgPoint = (clientX:number,clientY:number) => {
    const point=svgRef.current?.createSVGPoint(); const matrix=svgRef.current?.getScreenCTM();
    if(!point||!matrix)return {x:0,y:0};point.x=clientX;point.y=clientY;
    return point.matrixTransform(matrix.inverse());
  };
  const getBezier = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const cx = mx - dy * 0.2;
    const cy = my + dx * 0.2;
    return { cx, cy };
  };

  const handleMouseDown = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const pos = getPos(nodeId);
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;
      const point=svgPoint(e.clientX,e.clientY);
      const mx = (point.x - pan.x) / scale;
      const my = (point.y - pan.y) / scale;
      setDragging(nodeId);
      setDragOffset({ x: mx - pos.x, y: my - pos.y });
    },
    [pan, scale, positions]
  );

  const handleMouseMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragging) {
        const svgRect = svgRef.current?.getBoundingClientRect();
        if (!svgRect) return;
        const point=svgPoint(e.clientX,e.clientY);
        const mx = (point.x - pan.x) / scale;
        const my = (point.y - pan.y) / scale;
        setPositions((p) => ({ ...p, [dragging]: { x: mx - dragOffset.x, y: my - dragOffset.y } }));
      } else if (isPanning.current) {
        const point=svgPoint(e.clientX,e.clientY);
        const previous=svgPoint(panStart.current.x,panStart.current.y);
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
        panStart.current = { x: e.clientX, y: e.clientY };
      }
    },
    [dragging, dragOffset, pan, scale]
  );

  const handleSvgMouseDown = (e: React.PointerEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === "rect") {
      isPanning.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      panStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => {
    setDragging(null);
    isPanning.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(Math.max(s * delta, 0.3), 3));
  };

  const getNodeRadius = (node: GraphNode) => {
    if (node.highlighted) return 22;
    if (node.type === "person") return 18;
    if (node.type === "org") return 16;
    return 14;
  };

  const zoomBtn =
    "w-8 h-8 bg-[var(--color-surface)] border border-[var(--color-border-strong)] text-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] flex items-center justify-center transition-colors font-bold rounded-sm";

  return (
    <div className="relative bg-[var(--color-base-bg)] overflow-hidden select-none border border-[var(--color-border-subtle)]" style={{ height }}>
      {/* Legend */}
      {showLegend && !compact && (
        <div className="absolute top-3 left-3 z-10 bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-sm p-2.5 max-w-[240px]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">{L("Entity types","इकाई प्रकार")}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {presentTypes.map((type) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: entityColor(type) }} />
                <span className="text-[10px] text-[var(--color-text-secondary)] font-medium">{L(TYPE_LABEL[type] ?? type,({person:"व्यक्ति",org:"संगठन",phone:"फ़ोन / संचार",vehicle:"वाहन",location:"स्थान",account:"खाता",case:"केस",event:"घटना"} as Record<string,string>)[type]||type)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
        <button className={zoomBtn} onClick={() => setScale((s) => Math.min(s * 1.2, 3))} aria-label={L("Zoom in","बड़ा करें")}>
          +
        </button>
        <button className={zoomBtn} onClick={() => setScale((s) => Math.max(s * 0.8, 0.3))} aria-label={L("Zoom out","छोटा करें")}>
          −
        </button>
        <button
          className={`${zoomBtn} text-[11px] font-mono`}
          onClick={() => {
            setScale(1);
            setPan({ x: 0, y: 0 });
          }}
          aria-label={L("Reset view","दृश्य रीसेट करें")}
          title={L("Reset view","दृश्य रीसेट करें")}
        >
          1:1
        </button>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="graph-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>
          {tooltip.content}
        </div>
      )}

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox="0 0 800 600"
        onPointerMove={handleMouseMove}
        onPointerUp={handleMouseUp}
        onPointerCancel={handleMouseUp}
        onPointerDown={handleSvgMouseDown}
        onWheel={handleWheel}
        style={{ cursor: dragging ? "grabbing" : "grab",touchAction:"none" }}
      >
        <defs>
          {/* Background grid: faint institutional hairline, visible on the light base */}
          <pattern id="graph-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#c9d2dc" strokeWidth="1" />
          </pattern>
          <marker id="neo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-border-strong)" />
          </marker>
        </defs>

        {/* Background */}
        <rect width="100%" height="100%" fill="var(--color-base-bg)" />
        <rect width="100%" height="100%" fill="url(#graph-grid)" />

        <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
          {/* Edges */}
          {visibleEdges.map((edge) => {
            const s = getPos(edge.source);
            const t = getPos(edge.target);
            const { cx, cy } = getBezier(s.x, s.y, t.x, t.y);
            const isHovered = hoveredEdge === edge.id;
            const isConnected = selectedNode && (edge.source === selectedNode || edge.target === selectedNode);
            const opacity = selectedNode ? (isConnected ? 0.95 : 0.08) : isHovered ? 0.9 : 0.4;
            const color = isConnected || isHovered ? PALETTE.accent : PALETTE.borderStrong;

            return (
              <g key={edge.id}>
                {/* Hit area */}
                <path
                  d={`M${s.x},${s.y} Q${cx},${cy} ${t.x},${t.y}`}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    setHoveredEdge(edge.id);
                    const svgRect = svgRef.current?.getBoundingClientRect();
                    if (svgRect) setTooltip({ x: e.clientX - svgRect.left, y: e.clientY - svgRect.top, content: `${edge.label} · ${Math.round((edge.confidence ?? .85) * 100)}% · ${(edge.evidenceIds || []).join(", ") || "source pending"}` });
                  }}
                  onMouseLeave={() => {
                    setHoveredEdge(null);
                    setTooltip(null);
                  }}
                />
                {/* Visual edge */}
                <path
                  d={`M${s.x},${s.y} Q${cx},${cy} ${t.x},${t.y}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={isHovered || isConnected ? 2.2 : 1.3}
                  strokeOpacity={opacity}
                  markerEnd="url(#neo-arrow)"
                  style={{ transition: "stroke-opacity 0.2s" }}
                />
                {/* Edge label on hover */}
                {isHovered && (
                  <text x={cx} y={cy - 8} textAnchor="middle" fill={PALETTE.accent} fontSize="10" fontWeight="600" style={{ pointerEvents: "none" }}>
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {visibleNodes.map((node) => {
            const pos = getPos(node.id);
            const fill = entityColor(node.type);
            const r = getNodeRadius(node);
            const isHovered = hoveredNode === node.id;
            const isSelected = selectedNode === node.id;
            const isConnected =
              selectedNode &&
              edges.some(
                (e) =>
                  (e.source === selectedNode && e.target === node.id) || (e.target === selectedNode && e.source === node.id)
              );
            const isDimmed = selectedNode && !isSelected && !isConnected;

            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`${node.label} (${node.type})`}
                onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelectedNode(node.id);onNodeClick?.(node);}}}
                transform={`translate(${pos.x},${pos.y})`}
                style={{ cursor: "pointer", opacity: isDimmed ? 0.2 : 1, transition: "opacity 0.2s" }}
                onPointerDown={(e) => handleMouseDown(e, node.id)}
                onMouseEnter={(e) => {
                  setHoveredNode(node.id);
                  const svgRect = svgRef.current?.getBoundingClientRect();
                  if (svgRect) {
                    setTooltip({ x: e.clientX - svgRect.left, y: e.clientY - svgRect.top, content: `${node.label.split("\n")[0]} (${node.type})` });
                  }
                }}
                onMouseLeave={() => {
                  setHoveredNode(null);
                  setTooltip(null);
                }}
                onClick={() => {
                  setSelectedNode((s) => (s === node.id ? null : node.id));
                  onNodeClick?.(node);
                }}
              >
                {/* Priority ring for the primary node (solid saffron, not a glow) */}
                {node.highlighted && <circle r={r + 6} fill="none" stroke={PALETTE.saffron} strokeWidth="2.5" />}
                {/* Selection / hover ring */}
                {(isSelected || isHovered) && !node.highlighted && (
                  <circle r={r + 4} fill="none" stroke={PALETTE.primary} strokeWidth="2" />
                )}
                {/* Node body with a surface ring to separate it from crossing edges */}
                <circle r={r} fill={fill} stroke="var(--color-surface)" strokeWidth={2} />

                {/* Node category badge */}
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={8}
                  fontWeight="700"
                  fill="#ffffff"
                  style={{ pointerEvents: "none", userSelect: "none", letterSpacing: "0.5px" }}
                >
                  {entityBadge(node.type)}
                </text>

                {/* Node main label */}
                <text
                  y={r + 14}
                  textAnchor="middle"
                  fill={node.highlighted ? "var(--color-alert-critical)" : isSelected ? "var(--color-text-primary)" : "var(--color-text-secondary)"}
                  fontSize={node.highlighted ? 10 : 9}
                  fontWeight={node.highlighted || isSelected ? "700" : "500"}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {node.label.split("\n")[0]}
                </text>
                <text y={r + 25} textAnchor="middle" fill="var(--color-text-muted)" fontSize="7" fontFamily="var(--font-mono)" style={{ pointerEvents: "none" }}>
                  {node.id}
                </text>

                {/* "PRIMARY" badge */}
                {node.highlighted && (
                  <g transform={`translate(${r - 4}, ${-r - 2})`}>
                    <rect x="-24" y="-8" width="48" height="13" rx="2" fill="var(--color-alert-critical)" />
                    <text x="0" y="2" textAnchor="middle" fill="white" fontSize="7" fontWeight="700" style={{ pointerEvents: "none" }}>
                      PRIMARY
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

      </svg>
      {!compact&&<div className="absolute bottom-3 right-3 pointer-events-none max-w-[230px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] p-2 text-[10px]"><p className="font-semibold break-all">{caption}</p><p>{visibleNodes.length} {L("entities","इकाइयाँ")} · {visibleEdges.length} {L("relationships","संबंध")}</p><p>{L("Drag to pan · Zoom to inspect · Select a node","खींचकर चलाएँ · बड़ा करके देखें · इकाई चुनें")}</p></div>}
    </div>
  );
}
