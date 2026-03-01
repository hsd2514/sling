import { useEffect, useState } from "react";
import { uploadProtein, listSessions, getSession } from "../api/protein";

const THEME_OPTIONS = [
  { id: "clinical", label: "Clinical" },
  { id: "heatmap", label: "Heatmap" },
  { id: "publication", label: "Publication" },
];

export default function UploadPage({ onUploaded, onOpenSession, onNavigate }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("ui_theme") || "clinical",
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ui_theme", theme);
  }, [theme]);

  useEffect(() => {
    const load = async () => {
      setLoadingSessions(true);
      try {
        const { data } = await listSessions();
        setSessions(data.sessions || []);
      } catch {
        setSessions([]);
      } finally {
        setLoadingSessions(false);
      }
    };
    load();
  }, []);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.endsWith(".pdb")) {
      setError("Only .pdb files are accepted.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { data } = await uploadProtein(file);
      const text = await file.text();
      onUploaded({ ...data, pdbText: text });
    } catch (e) {
      setError(e.response?.data?.detail || "Upload failed.");
    } finally {
      setLoading(false);
    }
  };

  const openSession = async (sessionId) => {
    try {
      const { data } = await getSession(sessionId);
      onOpenSession(data);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to open session.");
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden px-6 py-12 md:px-12 md:py-16">
      <section className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="fade-up space-y-8">
          <div className="flex items-center justify-between gap-3">
            <p
              className="text-xs font-bold uppercase tracking-[0.24em]"
              style={{ color: "var(--ink-soft)" }}
            >
              Drug Discovery Workspace
            </p>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="rounded-lg border px-2 py-1 text-xs font-semibold"
              style={{
                borderColor: "var(--line)",
                background: "white",
                color: "var(--ink)",
              }}
            >
              {THEME_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-4">
            <h1 className="display-face text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
              Structure upload, pocket analysis, drug rationale, and report
              generation.
            </h1>
            <p
              className="max-w-xl text-base sm:text-lg"
              style={{ color: "var(--ink-soft)" }}
            >
              Start a new run or reopen a prior session with all parsed chains,
              pockets, and drug candidates.
            </p>
          </div>

          {/* ── Navigation cards ── */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => onNavigate?.("compare")}
              className="rounded-2xl border p-5 text-left transition-colors panel"
              style={{ borderColor: "var(--line)" }}
            >
              <p
                className="text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ color: "#0d9488" }}
              >
                Compare
              </p>
              <p className="mt-1 text-sm font-semibold">Protein Comparison</p>
              <p
                className="mt-0.5 text-xs"
                style={{ color: "var(--ink-soft)" }}
              >
                Upload two proteins and compare structure, sequence, binding
                pockets, and drugs.
              </p>
            </button>
            <button
              onClick={() => onNavigate?.("dataset")}
              className="rounded-2xl border p-5 text-left transition-colors panel"
              style={{ borderColor: "var(--line)" }}
            >
              <p
                className="text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ color: "var(--accent)" }}
              >
                Dataset
              </p>
              <p className="mt-1 text-sm font-semibold">Dataset Builder</p>
              <p
                className="mt-0.5 text-xs"
                style={{ color: "var(--ink-soft)" }}
              >
                Build structured protein-drug datasets for research. Export CSV
                or JSON.
              </p>
            </button>
          </div>

          <div className="rounded-2xl border p-5 panel">
            <div className="mb-4 flex items-center justify-between">
              <h2
                className="text-sm font-bold uppercase tracking-[0.12em]"
                style={{ color: "var(--ink-soft)" }}
              >
                Session History
              </h2>
              {loadingSessions && (
                <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  Loading...
                </span>
              )}
            </div>
            <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
              {!sessions.length && !loadingSessions && (
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  No previous sessions yet.
                </p>
              )}
              {sessions.map((s) => (
                <button
                  key={s.session_id}
                  onClick={() => openSession(s.session_id)}
                  className="w-full rounded-xl border px-4 py-3 text-left text-sm"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--field)",
                  }}
                >
                  <p className="truncate font-semibold">{s.filename}</p>
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {s.pocket_count} pockets • {s.drug_count} drugs •{" "}
                    {s.created_at}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </article>

        <article
          className="fade-up relative rounded-3xl p-5 sm:p-7 panel"
          style={{ animationDelay: "120ms" }}
        >
          <div className="space-y-1">
            <p
              className="text-xs font-bold uppercase tracking-[0.18em]"
              style={{ color: "var(--ink-soft)" }}
            >
              New Session
            </p>
            <h2 className="display-face text-3xl">Upload PDB</h2>
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              Accepts a single `.pdb` file, max 50 MB.
            </p>
          </div>

          <label
            className="mt-6 block cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors"
            style={{
              borderColor: dragging ? "var(--accent)" : "var(--line)",
              background: dragging
                ? "color-mix(in oklch, var(--accent-soft) 80%, white)"
                : "var(--field)",
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files[0]);
            }}
          >
            <input
              type="file"
              accept=".pdb"
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />
            {loading ? (
              <p
                className="text-base font-semibold"
                style={{ color: "var(--accent)" }}
              >
                Parsing structure...
              </p>
            ) : (
              <>
                <p className="text-xl font-bold">Drag and drop `.pdb`</p>
                <p
                  className="mt-2 text-sm"
                  style={{ color: "var(--ink-soft)" }}
                >
                  or click to browse
                </p>
              </>
            )}
          </label>

          {error && (
            <p
              className="mt-4 rounded-xl border px-4 py-3 text-sm font-medium"
              style={{
                borderColor:
                  "color-mix(in oklch, var(--danger) 40%, var(--line))",
                color: "var(--danger)",
                background: "color-mix(in oklch, var(--danger) 12%, white)",
              }}
            >
              {error}
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
