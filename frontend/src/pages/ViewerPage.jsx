import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import ProteinViewer from "../viewer/ProteinViewer";
import ChatPanel from "../components/ChatPanel";
import DrugCard from "../components/DrugCard";
import PocketList from "../components/PocketList";
import PocketRadar from "../components/PocketRadar";
import KnowledgeGraph from "../components/KnowledgeGraph";
import WasmPocketRunner from "../components/WasmPocketRunner";
import {
  analyzeProtein,
  suggestDrugs,
  generateReport,
  importPockets,
  fetchKnowledgeGraph,
  addToDataset,
} from "../api/protein";

const THEME_OPTIONS = [
  { id: "clinical", label: "Clinical" },
  { id: "heatmap", label: "Heatmap" },
  { id: "publication", label: "Publication" },
];

/* ── Default fpocket advanced params (mirrors backend defaults) ── */
const DEFAULT_FPOCKET_PARAMS = {
  min_alpha_sphere_radius: "",
  max_alpha_sphere_radius: "",
  min_alpha_spheres: "",
  clustering_distance: "",
  interface_cutoff: "",
  radius_of_protein: "",
};

export default function ViewerPage({ session, onBack }) {
  const [pockets, setPockets] = useState(session.pockets || null);
  const [drugs, setDrugs] = useState(session.drugs || null);
  const [activeTab, setActiveTab] = useState("overview");
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingDrugs, setLoadingDrugs] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPocket, setSelectedPocket] = useState(null);
  const [comparePocketIds, setComparePocketIds] = useState([]);
  const [sortBy, setSortBy] = useState("score");
  const [minScore, setMinScore] = useState(0);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("ui_theme") || "clinical",
  );

  /* ── New viewer state ── */
  const [visiblePocketIds, setVisiblePocketIds] = useState(null); // null = all visible
  const [pocketColors, setPocketColors] = useState({});
  const [pocketOpacities, setPocketOpacities] = useState({});
  const [showSurface, setShowSurface] = useState(false);
  const [showSticks, setShowSticks] = useState(false);
  const [showLigands, setShowLigands] = useState(true);
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [fpocketParams, setFpocketParams] = useState(DEFAULT_FPOCKET_PARAMS);
  const [atomHoverInfo, setAtomHoverInfo] = useState(null);

  /* ── Novel feature state ── */
  const [measureMode, setMeasureMode] = useState(false);
  const [measurements, setMeasurements] = useState([]);
  const [touring, setTouring] = useState(false);
  const [slabNear, setSlabNear] = useState(0);
  const [slabFar, setSlabFar] = useState(100);

  /* ── Knowledge graph state ── */
  const [kgData, setKgData] = useState(null);
  const [kgLoading, setKgLoading] = useState(false);

  /* ── Dataset save state ── */
  const [datasetSaved, setDatasetSaved] = useState(false);
  const [datasetSaving, setDatasetSaving] = useState(false);

  const viewerRef = useRef(null);

  const { session_id, filename, parsed, pdbText } = session;
  const ligands = parsed?.ligands || [];

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ui_theme", theme);
  }, [theme]);

  /* ── Pocket visibility helpers ── */
  const togglePocketVisibility = useCallback(
    (pocketId) => {
      setVisiblePocketIds((prev) => {
        if (prev === null) {
          // first toggle: create set with all EXCEPT this one
          const all = new Set((pockets || []).map((p) => p.pocket_id));
          all.delete(pocketId);
          return all;
        }
        const next = new Set(prev);
        if (next.has(pocketId)) next.delete(pocketId);
        else next.add(pocketId);
        return next;
      });
    },
    [pockets],
  );

  const handleColorChange = useCallback((pocketId, color) => {
    setPocketColors((prev) => ({ ...prev, [pocketId]: color }));
  }, []);

  const handleOpacityChange = useCallback((pocketId, value) => {
    setPocketOpacities((prev) => ({ ...prev, [pocketId]: value }));
  }, []);

  /* ── Screenshot export ── */
  const handleScreenshot = useCallback(() => {
    const uri = viewerRef.current?.exportPng();
    if (!uri) return;
    const a = document.createElement("a");
    a.href = uri;
    a.download = `${filename || "protein"}_snapshot.png`;
    a.click();
  }, [filename]);

  /* ── Pocket tour ── */
  const toggleTour = useCallback(() => {
    if (touring) {
      viewerRef.current?.stopPocketTour();
      setTouring(false);
    } else {
      viewerRef.current?.startPocketTour(2800);
      setTouring(true);
    }
  }, [touring]);

  /* ── Measurement callback ── */
  const handleMeasurement = useCallback((m) => {
    setMeasurements((prev) => [...prev, m]);
  }, []);

  /* ── Knowledge graph ── */
  const handleBuildKG = useCallback(async () => {
    setKgLoading(true);
    try {
      const { data } = await fetchKnowledgeGraph(session_id);
      setKgData(data);
      setActiveTab("knowledge");
    } catch (e) {
      setError(e.response?.data?.detail || "Knowledge graph failed.");
    } finally {
      setKgLoading(false);
    }
  }, [session_id]);

  /* ── Save to dataset ── */
  const handleSaveToDataset = useCallback(async () => {
    setDatasetSaving(true);
    try {
      await addToDataset(session_id);
      setDatasetSaved(true);
    } catch (e) {
      if (e.response?.status === 409)
        setDatasetSaved(true); // already saved
      else setError(e.response?.data?.detail || "Failed to save to dataset.");
    } finally {
      setDatasetSaving(false);
    }
  }, [session_id]);

  const handleAnalyze = async () => {
    setError(null);
    setLoadingAnalyze(true);
    try {
      // Build params object — only send non-empty values
      const params = {};
      for (const [k, v] of Object.entries(fpocketParams)) {
        if (v !== "" && v !== null && v !== undefined) params[k] = Number(v);
      }
      const { data } = await analyzeProtein(
        session_id,
        Object.keys(params).length ? params : null,
      );
      setPockets(data.pockets);
      setSelectedPocket(data.pockets?.[0] || null);
      setVisiblePocketIds(null); // reset visibility
      setActiveTab("pockets");
    } catch (e) {
      setError(e.response?.data?.detail || "Analysis failed.");
    } finally {
      setLoadingAnalyze(false);
    }
  };

  const handleImportPockets = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setLoadingImport(true);
    try {
      const { data } = await importPockets(session_id, file);
      setPockets(data.pockets);
      setSelectedPocket(data.pockets?.[0] || null);
      setVisiblePocketIds(null);
      setActiveTab("pockets");
    } catch (e) {
      setError(e.response?.data?.detail || "Pocket import failed.");
    } finally {
      setLoadingImport(false);
      event.target.value = "";
    }
  };

  const handleDrugs = async (pocketId = null) => {
    setError(null);
    setLoadingDrugs(true);
    try {
      const { data } = await suggestDrugs(session_id, pocketId);
      setDrugs(data.drugs);
      setActiveTab("drugs");
    } catch (e) {
      setError(e.response?.data?.detail || "Drug suggestion failed.");
    } finally {
      setLoadingDrugs(false);
    }
  };

  const handleReport = async () => {
    setLoadingReport(true);
    try {
      const { data } = await generateReport(session_id);
      const url = URL.createObjectURL(
        new Blob([data], { type: "application/pdf" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `report_${session_id}.pdf`;
      a.click();
    } catch {
      setError("Report generation failed.");
    } finally {
      setLoadingReport(false);
    }
  };

  const handleWasmPockets = async (pocketList) => {
    setPockets(pocketList);
    setSelectedPocket(pocketList?.[0] || null);
    setVisiblePocketIds(null);
    setActiveTab("pockets");
    try {
      const file = new File(
        [JSON.stringify({ pockets: pocketList })],
        `wasm_${session_id}_pockets.json`,
        {
          type: "application/json",
        },
      );
      await importPockets(session_id, file);
    } catch {
      // Keep local state even if persistence fails.
    }
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "pockets", label: `Pockets${pockets ? ` (${pockets.length})` : ""}` },
    { id: "drugs", label: `Drugs${drugs ? ` (${drugs.length})` : ""}` },
    { id: "knowledge", label: "Knowledge" },
    { id: "chat", label: "AI Chat" },
    { id: "wasm", label: "WASM Lab" },
  ];

  const filteredPockets = useMemo(() => {
    const list = [...(pockets || [])].filter(
      (p) => Number(p.druggability_score || 0) >= minScore,
    );
    if (sortBy === "volume")
      return list.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    if (sortBy === "id")
      return list.sort((a, b) => (a.pocket_id || 0) - (b.pocket_id || 0));
    return list.sort(
      (a, b) => (b.druggability_score || 0) - (a.druggability_score || 0),
    );
  }, [pockets, sortBy, minScore]);

  const comparePockets = useMemo(
    () =>
      (pockets || [])
        .filter((p) => comparePocketIds.includes(p.pocket_id))
        .slice(0, 2),
    [pockets, comparePocketIds],
  );

  const toggleCompare = (pocketId) => {
    setComparePocketIds((prev) => {
      if (prev.includes(pocketId)) return prev.filter((id) => id !== pocketId);
      if (prev.length >= 2) return [prev[1], pocketId];
      return [...prev, pocketId];
    });
  };

  const updateParam = (key, val) => {
    setFpocketParams((prev) => ({ ...prev, [key]: val }));
  };

  const isWideTab = ["knowledge", "chat"].includes(activeTab);

  /* ── Shared viewer inner content (avoids duplication across layouts) ── */
  const renderViewerInner = (compact = false) => (
    <>
      {/* ── Viewer toolbar ── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <RepToggle active={false} label="Cartoon" always onClick={() => {}} />
        <RepToggle
          active={showSticks}
          label="Sticks"
          onClick={() => setShowSticks((v) => !v)}
        />
        <RepToggle
          active={showSurface}
          label="Surface"
          onClick={() => setShowSurface((v) => !v)}
        />
        <RepToggle
          active={showLigands}
          label="Ligands"
          onClick={() => setShowLigands((v) => !v)}
          badge={ligands.length || null}
        />
        <div className="mx-1 h-4 w-px" style={{ background: "var(--line)" }} />
        <RepToggle
          active={measureMode}
          label="Measure"
          onClick={() => {
            setMeasureMode((v) => !v);
            if (measureMode) setMeasurements([]);
          }}
        />
        <RepToggle
          active={touring}
          label={touring ? "Stop tour" : "Pocket tour"}
          onClick={toggleTour}
        />
        <button
          onClick={handleScreenshot}
          className="rounded-lg border px-2 py-1 text-[11px] font-semibold"
          style={{
            borderColor: "var(--line)",
            color: "var(--ink-soft)",
            background: "var(--field)",
          }}
          title="Export viewer as PNG"
        >
          Screenshot
        </button>
        <button
          onClick={() => viewerRef.current?.resetView()}
          className="rounded-lg border px-2 py-1 text-[11px] font-semibold"
          style={{
            borderColor: "var(--line)",
            color: "var(--ink-soft)",
            background: "var(--field)",
          }}
        >
          Reset view
        </button>
        <button
          onClick={() => setShowAdvancedParams((v) => !v)}
          className="rounded-lg border px-2 py-1 text-[11px] font-semibold"
          style={{
            borderColor: showAdvancedParams ? "var(--accent)" : "var(--line)",
            color: showAdvancedParams ? "var(--accent)" : "var(--ink-soft)",
            background: showAdvancedParams
              ? "var(--accent-soft)"
              : "var(--field)",
          }}
        >
          fpocket params
        </button>
        {atomHoverInfo && (
          <span
            className="ml-auto rounded-lg px-2 py-1 text-[11px] font-medium tabular-nums"
            style={{ background: "var(--field)", color: "var(--ink-soft)" }}
          >
            {atomHoverInfo.resn}
            {atomHoverInfo.resi}:{atomHoverInfo.atom}
            {atomHoverInfo.chain ? `:${atomHoverInfo.chain}` : ""}
          </span>
        )}
      </div>

      {/* ── Advanced fpocket params (collapsible) ── */}
      {showAdvancedParams && (
        <div
          className="mb-3 grid grid-cols-2 gap-2 rounded-xl border p-3 sm:grid-cols-3"
          style={{ borderColor: "var(--line)", background: "var(--field)" }}
        >
          <ParamInput
            label="Min α-sphere radius"
            value={fpocketParams.min_alpha_sphere_radius}
            onChange={(v) => updateParam("min_alpha_sphere_radius", v)}
            placeholder="3.4"
          />
          <ParamInput
            label="Max α-sphere radius"
            value={fpocketParams.max_alpha_sphere_radius}
            onChange={(v) => updateParam("max_alpha_sphere_radius", v)}
            placeholder="6.2"
          />
          <ParamInput
            label="Min α-spheres"
            value={fpocketParams.min_alpha_spheres}
            onChange={(v) => updateParam("min_alpha_spheres", v)}
            placeholder="15"
          />
          <ParamInput
            label="Clustering dist"
            value={fpocketParams.clustering_distance}
            onChange={(v) => updateParam("clustering_distance", v)}
            placeholder="1.73"
          />
          <ParamInput
            label="Interface cutoff"
            value={fpocketParams.interface_cutoff}
            onChange={(v) => updateParam("interface_cutoff", v)}
            placeholder="4.0"
          />
          <ParamInput
            label="Protein radius"
            value={fpocketParams.radius_of_protein}
            onChange={(v) => updateParam("radius_of_protein", v)}
            placeholder="auto"
          />
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <ProteinViewer
          ref={viewerRef}
          pdbContent={pdbText}
          pockets={pockets || []}
          selectedPocketId={selectedPocket?.pocket_id}
          theme={theme}
          visiblePocketIds={visiblePocketIds}
          pocketColors={pocketColors}
          pocketOpacities={pocketOpacities}
          showSurface={showSurface}
          showSticks={showSticks}
          showLigands={showLigands}
          ligands={ligands}
          onAtomHover={setAtomHoverInfo}
          measureMode={measureMode}
          onMeasurement={handleMeasurement}
          slabNear={slabNear}
          slabFar={slabFar}
        />
      </div>

      {/* ── Extras hidden in compact mode ── */}
      {!compact && (
        <>
          {/* ── Slab / clipping controls ── */}
          {slabNear === 0 && slabFar === 100 ? (
            <button
              onClick={() => {
                setSlabNear(10);
                setSlabFar(90);
              }}
              className="mt-2 self-start rounded-lg border px-2 py-1 text-[11px] font-semibold"
              style={{
                borderColor: "var(--line)",
                color: "var(--ink-soft)",
                background: "var(--field)",
              }}
            >
              Enable slab clipping
            </button>
          ) : (
            <div
              className="mt-2 flex items-center gap-2 rounded-lg border px-3 py-1.5"
              style={{ borderColor: "var(--line)", background: "var(--field)" }}
            >
              <span
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--ink-soft)" }}
              >
                Slab
              </span>
              <span
                className="text-[10px] tabular-nums"
                style={{ color: "var(--ink-soft)" }}
              >
                {slabNear}
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={slabNear}
                onChange={(e) => setSlabNear(Number(e.target.value))}
                className="h-1 flex-1"
              />
              <input
                type="range"
                min="0"
                max="100"
                value={slabFar}
                onChange={(e) => setSlabFar(Number(e.target.value))}
                className="h-1 flex-1"
              />
              <span
                className="text-[10px] tabular-nums"
                style={{ color: "var(--ink-soft)" }}
              >
                {slabFar}
              </span>
              <button
                onClick={() => {
                  setSlabNear(0);
                  setSlabFar(100);
                }}
                className="text-[10px] font-semibold"
                style={{ color: "var(--accent)" }}
              >
                Reset
              </button>
            </div>
          )}

          {/* ── Measurements log ── */}
          {measurements.length > 0 && (
            <div className="mt-2 space-y-1">
              <p
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "var(--ink-soft)" }}
              >
                Measurements
              </p>
              {measurements.map((m, i) => (
                <p
                  key={i}
                  className="text-[11px] tabular-nums"
                  style={{ color: "var(--ink)" }}
                >
                  {m.atom1.resn}
                  {m.atom1.resi}:{m.atom1.atom} — {m.atom2.resn}
                  {m.atom2.resi}:{m.atom2.atom} ={" "}
                  <strong>{m.distance.toFixed(2)} Å</strong>
                </p>
              ))}
            </div>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Metric label="Chains" value={parsed?.chains?.length ?? "—"} />
            <Metric label="Residues" value={parsed?.total_residues ?? "—"} />
            <Metric label="Atoms" value={parsed?.total_atoms ?? "—"} />
          </div>

          {/* ── Crystal ligands info ── */}
          {ligands.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {ligands.map((lig, i) => (
                <span
                  key={i}
                  className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    borderColor: "var(--line)",
                    background: "#fef9c3",
                    color: "#854d0e",
                  }}
                >
                  {lig.name} ({lig.chain}:{lig.resi}) • {lig.atom_count} atoms
                </span>
              ))}
            </div>
          )}

          {comparePockets.length >= 1 && (
            <PocketRadar pockets={comparePockets.slice(0, 2)} />
          )}
        </>
      )}
    </>
  );

  return (
    <main className="min-h-screen px-5 py-5 sm:px-8 sm:py-7">
      <section className="mx-auto flex max-w-[1440px] flex-col gap-5">
        <header className="panel fade-up space-y-4 rounded-3xl p-5 sm:p-6">
          {/* Title row */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
                style={{
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                }}
              >
                DS
              </span>
              <div className="min-w-0">
                <p
                  className="text-xs font-bold uppercase tracking-[0.18em]"
                  style={{ color: "var(--ink-soft)" }}
                >
                  Active Session
                </p>
                <h1 className="display-face truncate text-2xl sm:text-3xl">
                  {filename}
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="rounded-xl border px-3 py-2 text-sm font-semibold"
                style={{ borderColor: "var(--line)", background: "white" }}
              >
                {THEME_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                onClick={onBack}
                className="rounded-xl border px-4 py-2 text-sm font-semibold"
                style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}
              >
                ← Back
              </button>
            </div>
          </div>
          {/* Action bar */}
          <div
            className="flex flex-wrap items-center gap-2.5 border-t pt-3"
            style={{ borderColor: "var(--line)" }}
          >
            <button
              onClick={handleAnalyze}
              disabled={loadingAnalyze}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{
                borderColor: "var(--line)",
                background: "var(--field)",
                color: "var(--ink)",
              }}
            >
              {loadingAnalyze ? "Detecting..." : "Detect pockets"}
            </button>
            <label
              className="cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{
                borderColor: "var(--line)",
                background: "white",
                color: "var(--ink)",
              }}
            >
              {loadingImport ? "Importing..." : "Import pockets"}
              <input
                type="file"
                accept=".json,.txt,.info"
                className="hidden"
                onChange={handleImportPockets}
                disabled={loadingImport}
              />
            </label>
            <span
              className="mx-0.5 hidden h-5 w-px sm:block"
              style={{ background: "var(--line)" }}
            />
            <button
              onClick={() => handleDrugs(selectedPocket?.pocket_id || null)}
              disabled={loadingDrugs}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{
                borderColor:
                  "color-mix(in oklch, var(--accent) 40%, var(--line))",
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              {loadingDrugs
                ? "Reasoning..."
                : selectedPocket
                  ? `Suggest for pocket ${selectedPocket.pocket_id}`
                  : "Suggest compounds"}
            </button>
            <span
              className="mx-0.5 hidden h-5 w-px sm:block"
              style={{ background: "var(--line)" }}
            />
            <button
              onClick={handleReport}
              disabled={loadingReport}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{
                borderColor:
                  "color-mix(in oklch, var(--success) 42%, var(--line))",
                background: "color-mix(in oklch, var(--success) 16%, white)",
                color: "color-mix(in oklch, var(--success) 80%, black)",
              }}
            >
              {loadingReport ? "Generating..." : "Export PDF"}
            </button>
            <button
              onClick={handleBuildKG}
              disabled={kgLoading}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{
                borderColor: "color-mix(in oklch, #e11d48 40%, var(--line))",
                background: "color-mix(in oklch, #e11d48 12%, white)",
                color: "#e11d48",
              }}
            >
              {kgLoading ? "Building graph…" : "Knowledge Graph"}
            </button>
            <button
              onClick={handleSaveToDataset}
              disabled={datasetSaving || datasetSaved}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{
                borderColor: "var(--line)",
                background: datasetSaved
                  ? "var(--accent-soft)"
                  : "var(--field)",
                color: datasetSaved ? "var(--accent)" : "var(--ink-soft)",
              }}
            >
              {datasetSaved
                ? "✓ Saved"
                : datasetSaving
                  ? "Saving…"
                  : "Save to Dataset"}
            </button>
          </div>
        </header>

        {error && (
          <div
            className="fade-up rounded-2xl border px-4 py-3 text-sm font-semibold"
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

        {/* ── Tab strip ── */}
        {activeTab !== "wasm" && (
          <nav
            className="panel fade-up flex gap-0.5 overflow-x-auto rounded-2xl p-1"
            style={{ animationDelay: "60ms" }}
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-[0.06em] transition"
                style={{
                  color:
                    activeTab === t.id ? "var(--accent)" : "var(--ink-soft)",
                  background:
                    activeTab === t.id ? "var(--accent-soft)" : "transparent",
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}

        {activeTab === "wasm" ? (
          <WasmPocketRunner
            filename={filename}
            pdbText={pdbText}
            onPocketsDetected={handleWasmPockets}
            onError={(msg) => setError(msg)}
          />
        ) : isWideTab ? (
          /* ── Wide layout: viewer compact on top, feature full-width below ── */
          <div
            className="fade-up grid gap-5"
            style={{ animationDelay: "90ms" }}
          >
            <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
              <div className="panel flex min-h-[380px] flex-col rounded-3xl p-4 sm:p-5">
                {renderViewerInner(true)}
              </div>

              {/* ── Compact info sidebar (wide-tab mode) ── */}
              {isWideTab && (
                <aside className="panel flex flex-col gap-3 overflow-y-auto rounded-3xl p-4">
                  <div className="grid gap-2">
                    <Metric
                      label="Chains"
                      value={parsed?.chains?.length ?? "—"}
                    />
                    <Metric
                      label="Residues"
                      value={parsed?.total_residues ?? "—"}
                    />
                    <Metric label="Atoms" value={parsed?.total_atoms ?? "—"} />
                  </div>
                  {pockets && (
                    <div
                      className="rounded-xl border px-3 py-2"
                      style={{
                        borderColor: "var(--line)",
                        background: "var(--field)",
                      }}
                    >
                      <p
                        className="text-[10px] font-bold uppercase tracking-wide"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        Pockets detected
                      </p>
                      <p className="mt-0.5 text-lg font-semibold">
                        {pockets.length}
                      </p>
                    </div>
                  )}
                  {drugs && (
                    <div
                      className="rounded-xl border px-3 py-2"
                      style={{
                        borderColor: "var(--line)",
                        background: "var(--field)",
                      }}
                    >
                      <p
                        className="text-[10px] font-bold uppercase tracking-wide"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        Drug candidates
                      </p>
                      <p className="mt-0.5 text-lg font-semibold">
                        {drugs.length}
                      </p>
                    </div>
                  )}
                </aside>
              )}
            </div>

            {/* ── Full-width feature panel (knowledge / chat) ── */}
            <div
              className="panel fade-up min-h-[520px] overflow-hidden rounded-3xl"
              style={{ animationDelay: "140ms" }}
            >
              <div className="h-full p-5">
                {activeTab === "knowledge" && (
                  <div className="h-full">
                    {kgData ? (
                      <KnowledgeGraph graph={kgData} loading={kgLoading} />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
                        <p
                          className="max-w-md text-center text-sm leading-relaxed"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          Build an interactive protein–drug–disease relationship
                          graph. The graph queries UniProt, Open Targets, and
                          PubChem for real biological associations.
                        </p>
                        <button
                          onClick={handleBuildKG}
                          disabled={kgLoading}
                          className="rounded-xl border px-6 py-2.5 text-sm font-semibold"
                          style={{
                            borderColor:
                              "color-mix(in oklch, #e11d48 40%, var(--line))",
                            background:
                              "color-mix(in oklch, #e11d48 12%, white)",
                            color: "#e11d48",
                          }}
                        >
                          {kgLoading ? "Building…" : "Build Knowledge Graph"}
                        </button>
                        <p
                          className="text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          Best results after pocket detection + drug
                          suggestions.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "chat" && (
                  <div className="h-full min-h-[480px]">
                    <ChatPanel sessionId={session_id} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── Standard layout: viewer + sidebar ── */
          <div className="grid gap-5 lg:h-[calc(100vh-15rem)] lg:grid-cols-[1fr_480px]">
            <div
              className="panel fade-up flex h-full min-h-[560px] flex-col rounded-3xl p-4 sm:p-5"
              style={{ animationDelay: "90ms" }}
            >
              {renderViewerInner()}
            </div>

            <aside
              className="panel fade-up flex h-full min-h-[560px] flex-col overflow-hidden rounded-3xl"
              style={{ animationDelay: "160ms" }}
            >
              <div className="flex-1 overflow-y-auto p-5">
                {activeTab === "overview" && parsed && (
                  <div className="space-y-5 text-sm">
                    <InfoRow label="Protein Name" value={parsed.name} />
                    <InfoRow label="Organism" value={parsed.organism} />
                    <InfoRow
                      label="Resolution"
                      value={parsed.resolution ? `${parsed.resolution} Å` : "—"}
                    />
                    {ligands.length > 0 && (
                      <InfoRow
                        label="Crystal Ligands"
                        value={ligands.map((l) => l.name).join(", ")}
                      />
                    )}
                    <div className="space-y-2">
                      {parsed.chains?.map((c) => (
                        <div
                          key={c.chain_id}
                          className="rounded-xl border p-3"
                          style={{
                            borderColor: "var(--line)",
                            background: "var(--field)",
                          }}
                        >
                          <p className="text-sm font-semibold">
                            Chain {c.chain_id} • {c.residue_count} residues
                          </p>
                          <p
                            className="mt-1 text-xs"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {c.atom_count} atoms • {c.hetatm_count} HETATM
                          </p>
                          <p
                            className="mt-2 break-all text-xs leading-relaxed"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {c.sequence?.slice(0, 80)}
                            {c.sequence?.length > 80 ? "..." : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "pockets" &&
                  (pockets ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value)}
                          className="rounded-lg border px-2 py-1 text-xs"
                          style={{
                            borderColor: "var(--line)",
                            background: "white",
                          }}
                        >
                          <option value="score">Sort: score</option>
                          <option value="volume">Sort: volume</option>
                          <option value="id">Sort: id</option>
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={minScore}
                          onChange={(e) =>
                            setMinScore(Number(e.target.value || 0))
                          }
                          className="rounded-lg border px-2 py-1 text-xs"
                          style={{
                            borderColor: "var(--line)",
                            background: "white",
                          }}
                          placeholder="Min score"
                        />
                      </div>
                      <PocketList
                        pockets={filteredPockets}
                        selectedPocketId={selectedPocket?.pocket_id}
                        onSelectPocket={setSelectedPocket}
                        comparePocketIds={comparePocketIds}
                        onToggleCompare={toggleCompare}
                        visiblePocketIds={visiblePocketIds}
                        onToggleVisibility={togglePocketVisibility}
                        pocketColors={pocketColors}
                        onColorChange={handleColorChange}
                        pocketOpacities={pocketOpacities}
                        onOpacityChange={handleOpacityChange}
                        sessionId={session_id}
                      />
                    </div>
                  ) : (
                    <EmptyState text='Run "Detect pockets" or "Import pockets" to populate candidate binding sites.' />
                  ))}

                {activeTab === "drugs" &&
                  (drugs ? (
                    <div className="space-y-3">
                      {drugs.map((d, i) => (
                        <DrugCard key={i} drug={d} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState text='Run "Suggest compounds" to generate targeted hypotheses.' />
                  ))}
              </div>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}

/* ── Small helper components ── */

function RepToggle({ active, label, onClick, badge, always }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors"
      style={{
        borderColor: active || always ? "var(--accent)" : "var(--line)",
        color: active || always ? "var(--accent)" : "var(--ink-soft)",
        background: active || always ? "var(--accent-soft)" : "var(--field)",
      }}
    >
      {label}
      {badge != null && <span className="ml-1 opacity-60">({badge})</span>}
    </button>
  );
}

function ParamInput({ label, value, onChange, placeholder }) {
  return (
    <label className="space-y-0.5">
      <span
        className="text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: "var(--ink-soft)" }}
      >
        {label}
      </span>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border px-2 py-1 text-xs tabular-nums"
        style={{ borderColor: "var(--line)", background: "white" }}
      />
    </label>
  );
}

function Metric({ label, value }) {
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ borderColor: "var(--line)", background: "var(--field)" }}
    >
      <p
        className="text-xs font-bold uppercase tracking-[0.14em]"
        style={{ color: "var(--ink-soft)" }}
      >
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <p
      className="rounded-xl border px-4 py-5 text-sm"
      style={{
        borderColor: "var(--line)",
        background: "var(--field)",
        color: "var(--ink-soft)",
      }}
    >
      {text}
    </p>
  );
}

function InfoRow({ label, value }) {
  return (
    <div
      className="flex items-start justify-between gap-5 border-b pb-2 text-sm"
      style={{ borderColor: "var(--line)" }}
    >
      <span style={{ color: "var(--ink-soft)" }}>{label}</span>
      <span className="text-right font-semibold">{value ?? "—"}</span>
    </div>
  );
}
