import { useRef, useEffect } from "react";

/**
 * Canvas-drawn radar / spider chart comparing up to 2 pockets across
 * key druggability dimensions. Each axis is normalised 0-1 internally.
 */

const AXES = [
  { key: "druggability_score", label: "Druggability", max: 1 },
  { key: "volume", label: "Volume", max: 2500 },
  { key: "total_sasa", label: "SASA", max: 300 },
  { key: "hydrophobicity_score", label: "Hydrophobic", max: 50 },
  { key: "polarity_score", label: "Polarity", max: 20 },
  { key: "number_of_alpha_spheres", label: "α-Spheres", max: 120 },
];

const POCKET_FILL = ["rgba(59,130,246,0.18)", "rgba(239,68,68,0.18)"];
const POCKET_STROKE = ["#3b82f6", "#ef4444"];

function normalize(val, max) {
  if (val == null || isNaN(val)) return 0;
  return Math.min(Number(val) / max, 1);
}

export default function PocketRadar({ pockets = [] }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = 280;
    const H = 260;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    const cx = W / 2;
    const cy = H / 2 + 4;
    const R = 96;
    const n = AXES.length;
    const angleStep = (2 * Math.PI) / n;
    const startAngle = -Math.PI / 2;

    ctx.clearRect(0, 0, W, H);

    // ── Grid rings ──
    for (let ring = 1; ring <= 4; ring++) {
      const r = (R * ring) / 4;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = startAngle + i * angleStep;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = ring === 4 ? "#cbd5e1" : "#e2e8f0";
      ctx.lineWidth = ring === 4 ? 1.2 : 0.7;
      ctx.stroke();
    }

    // ── Axis spokes + labels ──
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '10px "IBM Plex Sans", sans-serif';
    ctx.fillStyle = "#64748b";
    for (let i = 0; i < n; i++) {
      const a = startAngle + i * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 0.7;
      ctx.stroke();

      const lx = cx + (R + 18) * Math.cos(a);
      const ly = cy + (R + 18) * Math.sin(a);
      ctx.fillText(AXES[i].label, lx, ly);
    }

    // ── Pocket polygons ──
    pockets.slice(0, 2).forEach((pocket, pIdx) => {
      const metrics = { ...pocket, ...(pocket.metrics || {}) };
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const axis = AXES[i % n];
        const val = normalize(metrics[axis.key], axis.max);
        const a = startAngle + (i % n) * angleStep;
        const r = Math.max(val, 0.04) * R;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = POCKET_FILL[pIdx];
      ctx.fill();
      ctx.strokeStyle = POCKET_STROKE[pIdx];
      ctx.lineWidth = 1.8;
      ctx.stroke();
    });

    // ── Legend ──
    pockets.slice(0, 2).forEach((p, i) => {
      const lx = 8 + i * 130;
      const ly = 10;
      ctx.fillStyle = POCKET_STROKE[i];
      ctx.fillRect(lx, ly, 10, 10);
      ctx.fillStyle = "#334155";
      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.textAlign = "left";
      ctx.fillText(`Pocket ${p.pocket_id}`, lx + 15, ly + 8);
    });
  }, [pockets]);

  if (pockets.length < 1) return null;

  return (
    <div
      className="mt-3 rounded-xl border p-2"
      style={{ borderColor: "var(--line)", background: "var(--field)" }}
    >
      <p
        className="mb-1 text-center text-[10px] font-bold uppercase tracking-widest"
        style={{ color: "var(--ink-soft)" }}
      >
        Pocket comparison
      </p>
      <canvas ref={canvasRef} className="mx-auto block" />
    </div>
  );
}
