import { useState } from "react";
import { downloadPocketPdb } from "../api/protein";

/* ── Metric display helpers ── */
const METRIC_LABELS = {
  score: "Score",
  druggability_score: "Druggability",
  number_of_alpha_spheres: "Alpha Spheres",
  total_sasa: "Total SASA",
  polar_sasa: "Polar SASA",
  apolar_sasa: "Apolar SASA",
  volume: "Volume",
  mean_local_hd_index: "Mean Local HD",
  mean_alpha_sphere_radius: "Mean α-Sphere Radius",
  mean_alpha_sphere_solvent_access: "Mean α-Sphere Solvent",
  apolar_alpha_sphere_proportion: "Apolar α-Sphere %",
  hydrophobicity_score: "Hydrophobicity",
  volume_score: "Volume Score",
  polarity_score: "Polarity Score",
  charge_score: "Charge Score",
  proportion_polar_atoms: "Polar Atoms %",
  alpha_sphere_density: "α-Sphere Density",
  centroid_alpha_sphere_max_dist: "Max Centroid Dist",
  flexibility: "Flexibility",
};

const DEFAULT_COLORS = [
  "#e6194b",
  "#3cb44b",
  "#4363d8",
  "#f58231",
  "#911eb4",
  "#42d4f4",
  "#f032e6",
  "#bfef45",
  "#fabed4",
  "#469990",
  "#dcbeff",
  "#9A6324",
  "#800000",
  "#aaffc3",
  "#808000",
  "#ffd8b1",
  "#000075",
  "#a9a9a9",
];

export default function PocketList({
  pockets,
  selectedPocketId,
  onSelectPocket,
  comparePocketIds = [],
  onToggleCompare,
  /* ── New props ── */
  visiblePocketIds, // Set<number>
  onToggleVisibility, // (pocketId) => void
  pocketColors = {}, // { [id]: '#hex' }
  onColorChange, // (pocketId, color) => void
  pocketOpacities = {}, // { [id]: 0-1 }
  onOpacityChange, // (pocketId, value) => void
  sessionId, // for download
}) {
  const [expandedId, setExpandedId] = useState(null);

  if (!pockets?.length) return null;

  const handleDownload = async (pocketId) => {
    try {
      const { data } = await downloadPocketPdb(sessionId, pocketId);
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pocket_${pocketId}.pdb`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
  };

  return (
    <div className="space-y-2">
      {pockets.map((p, idx) => {
        const scoreValue = Number(p.druggability_score || 0);
        const scorePct = scoreValue * 100;
        const scorePctLabel =
          scorePct < 0.1 && scorePct > 0 ? "<0.1" : scorePct.toFixed(1);
        const barWidth =
          scorePct > 0 && scorePct < 2 ? 2 : Math.min(scorePct, 100);
        const selected = Number(selectedPocketId) === Number(p.pocket_id);
        const compared = comparePocketIds.includes(p.pocket_id);
        const isVisible =
          !visiblePocketIds || visiblePocketIds.has(p.pocket_id);
        const isExpanded = expandedId === p.pocket_id;
        const color =
          pocketColors[p.pocket_id] ||
          DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
        const opacity = pocketOpacities[p.pocket_id] ?? 0.75;
        const metrics = p.metrics || {};

        return (
          <article
            key={p.pocket_id}
            className="rounded-2xl border transition-all duration-150"
            style={{
              borderColor: selected ? "var(--accent)" : "var(--line)",
              background: selected ? "var(--accent-soft)" : "white",
              opacity: isVisible ? 1 : 0.45,
            }}
          >
            {/* ── Header row ── */}
            <div className="flex items-center gap-2 px-3 pt-3">
              {/* Visibility checkbox */}
              <input
                type="checkbox"
                checked={isVisible}
                onChange={() => onToggleVisibility?.(p.pocket_id)}
                className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded accent-[var(--accent)]"
                title={isVisible ? "Hide in viewer" : "Show in viewer"}
              />
              {/* Color swatch / picker */}
              <label
                className="relative h-4 w-4 shrink-0 cursor-pointer rounded-full border"
                style={{ background: color, borderColor: "var(--line)" }}
                title="Change pocket color"
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => onColorChange?.(p.pocket_id, e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <button
                className="flex-1 text-left text-sm font-semibold"
                onClick={() => onSelectPocket?.(p)}
              >
                Pocket {p.pocket_id}
              </button>
              <p
                className="text-[11px] tabular-nums"
                style={{ color: "var(--ink-soft)" }}
              >
                {p.volume?.toFixed(0)}&thinsp;Å³
              </p>
            </div>

            {/* ── Druggability bar ── */}
            <div className="px-3 pt-2">
              <div
                className="h-1.5 overflow-hidden rounded-full"
                style={{ background: "var(--field-strong)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${barWidth}%`, background: color }}
                />
              </div>
              <p
                className="mt-1 text-[11px] tabular-nums"
                style={{ color: "var(--ink-soft)" }}
              >
                Druggability {scorePctLabel}%
              </p>
            </div>

            {/* ── Opacity slider ── */}
            <div className="flex items-center gap-2 px-3 pt-1">
              <span
                className="text-[10px] uppercase tracking-wide"
                style={{ color: "var(--ink-soft)" }}
              >
                Opacity
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={opacity}
                onChange={(e) =>
                  onOpacityChange?.(p.pocket_id, parseFloat(e.target.value))
                }
                className="h-1 flex-1 cursor-pointer accent-[var(--accent)]"
              />
              <span
                className="w-7 text-right text-[10px] tabular-nums"
                style={{ color: "var(--ink-soft)" }}
              >
                {Math.round(opacity * 100)}%
              </span>
            </div>

            {/* ── Action buttons ── */}
            <div className="flex items-center gap-1.5 px-3 pb-2 pt-2">
              <button
                onClick={() => onToggleCompare?.(p.pocket_id)}
                className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                style={{
                  borderColor: "var(--line)",
                  color: compared ? "white" : "var(--ink-soft)",
                  background: compared ? "var(--accent)" : "var(--field)",
                }}
              >
                {compared ? "Compared" : "Compare"}
              </button>
              <button
                onClick={() => setExpandedId(isExpanded ? null : p.pocket_id)}
                className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                style={{
                  borderColor: "var(--line)",
                  color: isExpanded ? "var(--accent)" : "var(--ink-soft)",
                  background: isExpanded
                    ? "var(--accent-soft)"
                    : "var(--field)",
                }}
              >
                {isExpanded ? "Hide metrics" : "Metrics"}
              </button>
              {sessionId && (
                <button
                  onClick={() => handleDownload(p.pocket_id)}
                  className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                  style={{
                    borderColor: "var(--line)",
                    color: "var(--ink-soft)",
                    background: "var(--field)",
                  }}
                  title="Download pocket PDB"
                >
                  ↓ PDB
                </button>
              )}
            </div>

            {/* ── Expanded metrics table ── */}
            {isExpanded && (
              <div
                className="border-t px-3 pb-3 pt-2"
                style={{ borderColor: "var(--line)" }}
              >
                <table className="w-full text-[11px]">
                  <tbody>
                    {Object.entries(METRIC_LABELS).map(([key, label]) => {
                      const raw = metrics[key] ?? p[key];
                      if (raw === undefined || raw === null) return null;
                      const val =
                        typeof raw === "number" ? raw.toFixed(4) : raw;
                      return (
                        <tr
                          key={key}
                          className="border-b last:border-0"
                          style={{
                            borderColor:
                              "color-mix(in oklch, var(--line) 50%, transparent)",
                          }}
                        >
                          <td
                            className="py-0.5 pr-2"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {label}
                          </td>
                          <td className="py-0.5 text-right font-medium tabular-nums">
                            {val}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
