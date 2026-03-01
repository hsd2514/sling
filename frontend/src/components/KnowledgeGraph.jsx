import { useRef, useEffect, useState, useCallback } from "react";

/*
 * KnowledgeGraph — canvas-rendered force-directed graph
 * Node types: protein (teal), pocket (amber), drug (blue), disease (rose)
 * Interactive: drag nodes, hover for details, zoom via wheel
 */

const TYPE_COLORS = {
  protein: { fill: "#0d9488", stroke: "#115e59", radius: 28 },
  pocket: { fill: "#f59e0b", stroke: "#92400e", radius: 16 },
  drug: { fill: "#3b82f6", stroke: "#1e3a5a", radius: 20 },
  disease: { fill: "#e11d48", stroke: "#881337", radius: 20 },
};

const LABEL_MAP = {
  has_binding_site: "binding site",
  associated_with: "assoc.",
  implicated_in: "implicated",
  targets: "targets",
  binds_to: "binds",
  treats: "treats",
  indicated_for: "indicated",
};

export default function KnowledgeGraph({ graph, loading }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const dragRef = useRef(null);
  const hoverRef = useRef(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const animRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  /* ── Initialize simulation ── */
  useEffect(() => {
    if (!graph?.nodes?.length) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.parentElement.clientWidth;
    const H = Math.max(canvas.parentElement.clientHeight, 480);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    const cx = W / 2;
    const cy = H / 2;

    // Place nodes in concentric rings by type
    const typeOrder = ["protein", "pocket", "drug", "disease"];
    const byType = {};
    graph.nodes.forEach((n) => {
      byType[n.type] = byType[n.type] || [];
      byType[n.type].push(n);
    });

    const simNodes = [];
    typeOrder.forEach((type, ring) => {
      const group = byType[type] || [];
      const radius = ring === 0 ? 0 : 80 + ring * 90;
      group.forEach((n, i) => {
        const angle =
          (2 * Math.PI * i) / Math.max(group.length, 1) - Math.PI / 2;
        simNodes.push({
          ...n,
          x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 20,
          y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 20,
          vx: 0,
          vy: 0,
          fx: null,
          fy: null,
        });
      });
    });

    const simEdges = graph.edges
      .map((e) => ({
        ...e,
        sourceIdx: simNodes.findIndex((n) => n.id === e.source),
        targetIdx: simNodes.findIndex((n) => n.id === e.target),
      }))
      .filter((e) => e.sourceIdx >= 0 && e.targetIdx >= 0);

    nodesRef.current = simNodes;
    edgesRef.current = simEdges;

    // Force simulation
    let running = true;
    let alpha = 1;
    const decay = 0.994;
    const repulsion = 3200;
    const attraction = 0.008;
    const idealLen = 140;
    const centerForce = 0.0025;

    function tick() {
      alpha *= decay;
      if (alpha < 0.001) alpha = 0.001;

      const N = simNodes.length;

      // Repulsion (all pairs)
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = simNodes[i];
          const b = simNodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (repulsion * alpha) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (a.fx === null) {
            a.vx -= fx;
            a.vy -= fy;
          }
          if (b.fx === null) {
            b.vx += fx;
            b.vy += fy;
          }
        }
      }

      // Attraction (edges)
      for (const e of simEdges) {
        const a = simNodes[e.sourceIdx];
        const b = simNodes[e.targetIdx];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - idealLen) * attraction * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (a.fx === null) {
          a.vx += fx;
          a.vy += fy;
        }
        if (b.fx === null) {
          b.vx -= fx;
          b.vy -= fy;
        }
      }

      // Center gravity
      for (const n of simNodes) {
        if (n.fx !== null) continue;
        n.vx += (cx - n.x) * centerForce * alpha;
        n.vy += (cy - n.y) * centerForce * alpha;
      }

      // Integrate
      for (const n of simNodes) {
        if (n.fx !== null) {
          n.x = n.fx;
          n.y = n.fy;
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        n.vx *= 0.6;
        n.vy *= 0.6;
        n.x += n.vx;
        n.y += n.vy;
        // Boundary
        n.x = Math.max(30, Math.min(W - 30, n.x));
        n.y = Math.max(30, Math.min(H - 30, n.y));
      }
    }

    function draw() {
      if (!running) return;
      tick();

      const ctx = canvas.getContext("2d");
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      const scale = scaleRef.current;
      const ox = offsetRef.current.x;
      const oy = offsetRef.current.y;
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);

      // Edges
      for (const e of simEdges) {
        const a = simNodes[e.sourceIdx];
        const b = simNodes[e.targetIdx];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = "rgba(148,163,184,0.35)";
        ctx.lineWidth = 1 + (e.weight || 0.3) * 1.5;
        ctx.stroke();

        // Edge label at midpoint
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        ctx.font = '9px "IBM Plex Sans", sans-serif';
        ctx.fillStyle = "rgba(100,116,139,0.7)";
        ctx.textAlign = "center";
        ctx.fillText(LABEL_MAP[e.label] || e.label, mx, my - 4);
      }

      // Nodes
      for (const n of simNodes) {
        const tc = TYPE_COLORS[n.type] || TYPE_COLORS.protein;
        const r = tc.radius;
        const isHover = hoverRef.current === n.id;
        const isSelected = selectedNode === n.id;

        // Glow for hovered/selected
        if (isHover || isSelected) {
          ctx.shadowColor = tc.fill;
          ctx.shadowBlur = 16;
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = tc.fill;
        ctx.fill();
        ctx.strokeStyle = isSelected ? "#ffffff" : tc.stroke;
        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.stroke();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // Icon text inside node
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${r < 18 ? 9 : 11}px "IBM Plex Sans", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const icon =
          {
            protein: "P",
            pocket: "Pk",
            drug: "Rx",
            disease: "Dx",
          }[n.type] || "?";
        ctx.fillText(icon, n.x, n.y);

        // Label below
        ctx.fillStyle = "#1e293b";
        ctx.font = `600 ${r < 18 ? 9 : 10}px "IBM Plex Sans", sans-serif`;
        const labelText =
          n.label.length > 18 ? n.label.slice(0, 16) + "…" : n.label;
        ctx.fillText(labelText, n.x, n.y + r + 12);
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);

    return () => {
      running = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [graph, selectedNode]);

  /* ── Mouse interactions ── */
  const getNodeAt = useCallback((mx, my) => {
    const scale = scaleRef.current;
    const ox = offsetRef.current.x;
    const oy = offsetRef.current.y;
    const x = (mx - ox) / scale;
    const y = (my - oy) / scale;

    for (const n of nodesRef.current) {
      const tc = TYPE_COLORS[n.type] || TYPE_COLORS.protein;
      const dx = x - n.x;
      const dy = y - n.y;
      if (dx * dx + dy * dy < tc.radius * tc.radius) return n;
    }
    return null;
  }, []);

  const handleMouseDown = useCallback(
    (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const node = getNodeAt(mx, my);
      if (node) {
        dragRef.current = node;
        node.fx = node.x;
        node.fy = node.y;
        setSelectedNode(node.id);
        setTooltip(node);
      }
    },
    [getNodeAt],
  );

  const handleMouseMove = useCallback(
    (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (dragRef.current) {
        const scale = scaleRef.current;
        const ox = offsetRef.current.x;
        const oy = offsetRef.current.y;
        dragRef.current.fx = (mx - ox) / scale;
        dragRef.current.fy = (my - oy) / scale;
        return;
      }

      const node = getNodeAt(mx, my);
      hoverRef.current = node?.id || null;
      canvasRef.current.style.cursor = node ? "grab" : "default";
    },
    [getNodeAt],
  );

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current.fx = null;
      dragRef.current.fy = null;
      dragRef.current = null;
    }
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    scaleRef.current = Math.min(3, Math.max(0.3, scaleRef.current * delta));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div
            className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{
              borderColor: "var(--accent)",
              borderTopColor: "transparent",
            }}
          />
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--ink-soft)" }}
          >
            Building knowledge graph…
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
            Querying UniProt, Open Targets, PubChem
          </p>
        </div>
      </div>
    );
  }

  if (!graph?.nodes?.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          Run pocket detection and drug suggestions first, then build the
          knowledge graph.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Legend */}
      <div className="mb-2 flex flex-wrap items-center gap-3 px-1">
        {Object.entries(TYPE_COLORS).map(([type, tc]) => (
          <span
            key={type}
            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--ink-soft)" }}
          >
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: tc.fill }}
            />
            {type}
          </span>
        ))}
        <span
          className="ml-auto text-[10px]"
          style={{ color: "var(--ink-soft)" }}
        >
          {graph.nodes.length} nodes · {graph.edges.length} edges
        </span>
      </div>

      {/* Canvas */}
      <div
        className="relative flex-1 overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--line)", background: "var(--field)" }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
      </div>

      {/* Tooltip / detail panel */}
      {tooltip && (
        <div
          className="mt-2 rounded-xl border p-3 text-xs"
          style={{ borderColor: "var(--line)", background: "var(--field)" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span
                className="mr-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase text-white"
                style={{
                  background: (TYPE_COLORS[tooltip.type] || TYPE_COLORS.protein)
                    .fill,
                }}
              >
                {tooltip.type}
              </span>
              <span className="font-semibold">{tooltip.label}</span>
            </div>
            <button
              onClick={() => {
                setTooltip(null);
                setSelectedNode(null);
              }}
              className="text-[10px] font-semibold"
              style={{ color: "var(--ink-soft)" }}
            >
              ✕
            </button>
          </div>
          {tooltip.data && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(tooltip.data).map(([k, v]) => {
                if (!v || k === "pockets_json" || k === "drugs_json")
                  return null;
                const display =
                  typeof v === "object" ? JSON.stringify(v) : String(v);
                if (display.length > 100) return null;
                return (
                  <div key={k}>
                    <span style={{ color: "var(--ink-soft)" }}>
                      {k.replace(/_/g, " ")}:{" "}
                    </span>
                    <span className="font-medium">{display}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {graph.summary && (
        <p
          className="mt-2 text-xs leading-relaxed"
          style={{ color: "var(--ink-soft)" }}
        >
          {graph.summary}
        </p>
      )}
    </div>
  );
}
