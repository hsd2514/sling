import { useState, useEffect } from "react";
import { listSessions, getSession, compareProteins } from "../api/protein";

/*
 * ComparePage – side-by-side protein comparison
 * Pick two sessions → hit Compare → view structural, sequence, pocket, and drug comparison
 */

export default function ComparePage({ onBack }) {
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [pickA, setPickA] = useState("");
  const [pickB, setPickB] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await listSessions();
        setSessions(data.sessions || []);
      } catch {
        setSessions([]);
      } finally {
        setLoadingSessions(false);
      }
    })();
  }, []);

  const handleCompare = async () => {
    if (!pickA || !pickB || pickA === pickB) {
      setError("Select two different proteins.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { data } = await compareProteins(pickA, pickB);
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.detail || "Comparison failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen px-5 py-8 sm:px-10">
      <section className="mx-auto max-w-5xl space-y-7">
        {/* Header */}
        <header className="panel fade-up flex flex-col gap-3 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--ink-soft)" }}
            >
              Protein Comparison Engine
            </p>
            <h1 className="display-face text-2xl sm:text-3xl">
              Compare Structures
            </h1>
          </div>
          <button
            onClick={onBack}
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}
          >
            Back
          </button>
        </header>

        {/* Selector */}
        <div
          className="panel fade-up grid gap-5 rounded-3xl p-6 sm:grid-cols-[1fr_auto_1fr]"
          style={{ animationDelay: "80ms" }}
        >
          <ProteinPicker
            label="Protein A"
            sessions={sessions}
            value={pickA}
            onChange={setPickA}
            loading={loadingSessions}
            accent="#0d9488"
          />
          <div className="flex items-end justify-center pb-2">
            <span
              className="text-xl font-bold"
              style={{ color: "var(--ink-soft)" }}
            >
              vs
            </span>
          </div>
          <ProteinPicker
            label="Protein B"
            sessions={sessions}
            value={pickB}
            onChange={setPickB}
            loading={loadingSessions}
            accent="#3b82f6"
          />
        </div>

        <button
          onClick={handleCompare}
          disabled={loading || !pickA || !pickB || pickA === pickB}
          className="fade-up w-full rounded-2xl border px-5 py-3 text-sm font-bold uppercase tracking-wide transition"
          style={{
            borderColor: "color-mix(in oklch, var(--accent) 50%, var(--line))",
            background: "var(--accent-soft)",
            color: "var(--accent)",
            opacity: loading || !pickA || !pickB || pickA === pickB ? 0.5 : 1,
            animationDelay: "120ms",
          }}
        >
          {loading ? "Comparing…" : "Run Comparison"}
        </button>

        {error && (
          <div
            className="rounded-2xl border px-4 py-3 text-sm font-semibold"
            style={{
              borderColor:
                "color-mix(in oklch, var(--danger) 40%, var(--line))",
              background: "color-mix(in oklch, var(--danger) 12%, white)",
              color: "var(--danger)",
            }}
          >
            {error}
          </div>
        )}

        {/* Results */}
        {result && <ComparisonResults result={result} />}
      </section>
    </main>
  );
}

/* ── Protein session picker ── */
function ProteinPicker({ label, sessions, value, onChange, loading, accent }) {
  return (
    <div className="space-y-2">
      <p
        className="text-[10px] font-bold uppercase tracking-[0.16em]"
        style={{ color: accent }}
      >
        {label}
      </p>
      {loading ? (
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          Loading sessions…
        </p>
      ) : sessions.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          No sessions yet. Upload proteins first.
        </p>
      ) : (
        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {sessions.map((s) => (
            <button
              key={s.session_id}
              onClick={() => onChange(s.session_id)}
              className="w-full rounded-xl border px-4 py-3 text-left text-sm transition"
              style={{
                borderColor: value === s.session_id ? accent : "var(--line)",
                background:
                  value === s.session_id
                    ? `color-mix(in srgb, ${accent} 10%, white)`
                    : "var(--field)",
                boxShadow:
                  value === s.session_id ? `0 0 0 2px ${accent}33` : "none",
              }}
            >
              <p className="truncate font-semibold">{s.filename}</p>
              <p style={{ color: "var(--ink-soft)" }}>
                {s.pocket_count} pockets · {s.drug_count} drugs
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Comparison results ── */
function ComparisonResults({ result }) {
  const {
    protein_a,
    protein_b,
    structural,
    alignment,
    pocket_comparison,
    drug_comparison,
    reasoning,
  } = result;

  return (
    <div className="space-y-5">
      {/* Protein headers */}
      <div
        className="fade-up grid gap-3 sm:grid-cols-2"
        style={{ animationDelay: "40ms" }}
      >
        <ProteinCard protein={protein_a} accent="#0d9488" label="A" />
        <ProteinCard protein={protein_b} accent="#3b82f6" label="B" />
      </div>

      {/* Sequence alignment */}
      <div
        className="panel fade-up rounded-2xl p-5"
        style={{ animationDelay: "80ms" }}
      >
        <h3
          className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--ink-soft)" }}
        >
          Sequence Alignment
        </h3>
        {alignment.error ? (
          <p className="text-xs" style={{ color: "var(--danger)" }}>
            {alignment.error}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox label="Identity" value={`${alignment.identity}%`} />
            <StatBox
              label="Similarity"
              value={`${alignment.similarity || 0}%`}
            />
            <StatBox label="Score" value={alignment.score} />
            <StatBox label="Aligned length" value={alignment.aligned_length} />
          </div>
        )}
        {/* Identity bar */}
        {!alignment.error && (
          <div className="mt-3">
            <div
              className="h-2.5 w-full overflow-hidden rounded-full"
              style={{ background: "var(--field-strong)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(alignment.identity || 0, 100)}%`,
                  background:
                    alignment.identity > 70
                      ? "#10b981"
                      : alignment.identity > 30
                        ? "#f59e0b"
                        : "#ef4444",
                }}
              />
            </div>
            <p
              className="mt-1 text-[10px] font-medium"
              style={{ color: "var(--ink-soft)" }}
            >
              {alignment.identity > 70
                ? "High homology — likely same protein family"
                : alignment.identity > 30
                  ? "Moderate similarity — possible remote homologs"
                  : "Low identity — structurally divergent"}
            </p>
          </div>
        )}
      </div>

      {/* Structural comparison */}
      <div
        className="panel fade-up rounded-2xl p-5"
        style={{ animationDelay: "120ms" }}
      >
        <h3
          className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--ink-soft)" }}
        >
          Structural Metrics
        </h3>
        <div className="space-y-2">
          {Object.entries(structural).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span
                className="w-20 font-semibold capitalize"
                style={{ color: "var(--ink-soft)" }}
              >
                {key}
              </span>
              <span
                className="w-16 text-right tabular-nums font-medium"
                style={{ color: "#0d9488" }}
              >
                {val.a ?? "—"}
              </span>
              {val.delta != null && (
                <span
                  className="w-16 text-center text-[10px] font-semibold tabular-nums"
                  style={{
                    color:
                      val.delta === 0
                        ? "var(--ink-soft)"
                        : val.delta > 0
                          ? "#10b981"
                          : "#ef4444",
                  }}
                >
                  {val.delta > 0 ? "+" : ""}
                  {val.delta}
                </span>
              )}
              <span
                className="w-16 text-right tabular-nums font-medium"
                style={{ color: "#3b82f6" }}
              >
                {val.b ?? "—"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pocket comparison */}
      <div
        className="panel fade-up rounded-2xl p-5"
        style={{ animationDelay: "160ms" }}
      >
        <h3
          className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--ink-soft)" }}
        >
          Binding Pocket Comparison
        </h3>
        <div className="mb-3 grid grid-cols-3 gap-2">
          <StatBox label="Pockets A" value={pocket_comparison.count_a} />
          <StatBox label="Pockets B" value={pocket_comparison.count_b} />
          <StatBox
            label="Avg similarity"
            value={`${(pocket_comparison.average_similarity * 100).toFixed(1)}%`}
          />
        </div>
        {pocket_comparison.pairs?.length > 0 && (
          <div className="space-y-1.5">
            <p
              className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--ink-soft)" }}
            >
              Matched pocket pairs
            </p>
            {pocket_comparison.pairs.map((pair, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
                style={{
                  borderColor: "var(--line)",
                  background: "var(--field)",
                }}
              >
                <span className="font-semibold" style={{ color: "#0d9488" }}>
                  P{pair.pocket_a}
                </span>
                <span style={{ color: "var(--ink-soft)" }}>↔</span>
                <span className="font-semibold" style={{ color: "#3b82f6" }}>
                  P{pair.pocket_b}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <div
                    className="h-1.5 w-16 overflow-hidden rounded-full"
                    style={{ background: "var(--field-strong)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pair.similarity * 100}%`,
                        background:
                          pair.similarity > 0.8
                            ? "#10b981"
                            : pair.similarity > 0.5
                              ? "#f59e0b"
                              : "#ef4444",
                      }}
                    />
                  </div>
                  <span className="tabular-nums font-semibold">
                    {(pair.similarity * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drug overlap */}
      <div
        className="panel fade-up rounded-2xl p-5"
        style={{ animationDelay: "200ms" }}
      >
        <h3
          className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--ink-soft)" }}
        >
          Drug Candidate Overlap
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="Common" value={drug_comparison.common?.length || 0} />
          <StatBox
            label="Unique to A"
            value={drug_comparison.unique_a?.length || 0}
          />
          <StatBox
            label="Unique to B"
            value={drug_comparison.unique_b?.length || 0}
          />
        </div>
        {drug_comparison.common?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {drug_comparison.common.map((d) => (
              <span
                key={d}
                className="rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize"
                style={{
                  borderColor: "#10b981",
                  background: "#ecfdf5",
                  color: "#065f46",
                }}
              >
                {d}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* LLM reasoning */}
      {reasoning && (
        <div
          className="panel fade-up rounded-2xl p-5"
          style={{ animationDelay: "240ms" }}
        >
          <h3
            className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ color: "var(--ink-soft)" }}
          >
            AI Analysis
          </h3>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--ink)" }}
          >
            {reasoning}
          </p>
        </div>
      )}
    </div>
  );
}

function ProteinCard({ protein, accent, label }) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: accent + "44", background: "var(--field)" }}
    >
      <span
        className="inline-block rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
        style={{ background: accent }}
      >
        {label}
      </span>
      <p className="mt-1 truncate text-sm font-semibold">
        {protein.name || "Unknown"}
      </p>
      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
        {protein.filename} · {protein.organism || "—"}
      </p>
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{ borderColor: "var(--line)", background: "var(--field)" }}
    >
      <p
        className="text-[9px] font-bold uppercase tracking-wide"
        style={{ color: "var(--ink-soft)" }}
      >
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
