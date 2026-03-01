import { useState, useEffect, useCallback } from "react";
import {
  listDataset,
  addToDataset,
  removeFromDataset,
  updateDatasetEntry,
  exportDataset,
  listSessions,
} from "../api/protein";

/*
 * DatasetPage – structured protein-drug dataset builder
 * Add sessions → annotate with notes/tags → export CSV/JSON
 */

export default function DatasetPage({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addTags, setAddTags] = useState("");
  const [error, setError] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editNotes, setEditNotes] = useState("");
  const [editTags, setEditTags] = useState("");
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [dsRes, sessRes] = await Promise.all([
        listDataset(),
        listSessions(),
      ]);
      setEntries(dsRes.data.entries || []);
      setSessions(sessRes.data.sessions || []);
    } catch {
      setError("Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const existingSessionIds = new Set(entries.map((e) => e.session_id));
  const availableSessions = sessions.filter(
    (s) => !existingSessionIds.has(s.session_id),
  );

  const handleAdd = async () => {
    if (!addingId) return;
    setError(null);
    try {
      await addToDataset(
        addingId,
        addNotes,
        addTags
          ? addTags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
      );
      setAddingId("");
      setAddNotes("");
      setAddTags("");
      await refresh();
    } catch (e) {
      setError(e.response?.data?.detail || "Add failed.");
    }
  };

  const handleRemove = async (entryId) => {
    try {
      await removeFromDataset(entryId);
      await refresh();
    } catch (e) {
      setError(e.response?.data?.detail || "Remove failed.");
    }
  };

  const handleUpdate = async () => {
    if (editId == null) return;
    try {
      await updateDatasetEntry(
        editId,
        editNotes,
        editTags
          ? editTags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
      );
      setEditId(null);
      await refresh();
    } catch (e) {
      setError(e.response?.data?.detail || "Update failed.");
    }
  };

  const handleExport = async (fmt) => {
    setExporting(true);
    try {
      const { data } = await exportDataset(fmt);
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `drug_discovery_dataset.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="min-h-screen px-5 py-8 sm:px-10">
      <section className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <header className="panel fade-up flex flex-col gap-3 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--ink-soft)" }}
            >
              Dataset Builder
            </p>
            <h1 className="display-face text-2xl sm:text-3xl">Export System</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport("csv")}
              disabled={exporting || entries.length === 0}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{
                borderColor:
                  "color-mix(in oklch, var(--success) 42%, var(--line))",
                background: "color-mix(in oklch, var(--success) 16%, white)",
                color: "color-mix(in oklch, var(--success) 80%, black)",
                opacity: entries.length === 0 ? 0.5 : 1,
              }}
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExport("json")}
              disabled={exporting || entries.length === 0}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{
                borderColor:
                  "color-mix(in oklch, var(--accent) 42%, var(--line))",
                background: "var(--accent-soft)",
                color: "var(--accent)",
                opacity: entries.length === 0 ? 0.5 : 1,
              }}
            >
              Export JSON
            </button>
            <button
              onClick={onBack}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}
            >
              Back
            </button>
          </div>
        </header>

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

        {/* Add to dataset */}
        <div
          className="panel fade-up rounded-2xl p-5"
          style={{ animationDelay: "60ms" }}
        >
          <h3
            className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ color: "var(--ink-soft)" }}
          >
            Add Session to Dataset
          </h3>
          {availableSessions.length === 0 && !loading ? (
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {sessions.length === 0
                ? "No sessions available. Upload proteins first."
                : "All sessions already in dataset."}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <select
                value={addingId}
                onChange={(e) => setAddingId(e.target.value)}
                className="rounded-lg border px-3 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "white" }}
              >
                <option value="">Select session…</option>
                {availableSessions.map((s) => (
                  <option key={s.session_id} value={s.session_id}>
                    {s.filename} ({s.pocket_count}p, {s.drug_count}d)
                  </option>
                ))}
              </select>
              <input
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="rounded-lg border px-3 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "white" }}
              />
              <input
                value={addTags}
                onChange={(e) => setAddTags(e.target.value)}
                placeholder="Tags, comma-separated"
                className="rounded-lg border px-3 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "white" }}
              />
              <button
                onClick={handleAdd}
                disabled={!addingId}
                className="rounded-lg border px-5 py-2.5 text-sm font-semibold"
                style={{
                  borderColor: "var(--accent)",
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                  opacity: addingId ? 1 : 0.5,
                }}
              >
                Add
              </button>
            </div>
          )}
        </div>

        {/* Dataset summary */}
        <div
          className="fade-up grid gap-4 sm:grid-cols-4"
          style={{ animationDelay: "100ms" }}
        >
          <SummaryCard label="Total entries" value={entries.length} />
          <SummaryCard
            label="Avg. pockets"
            value={
              entries.length
                ? (
                    entries.reduce((s, e) => s + (e.pocket_count || 0), 0) /
                    entries.length
                  ).toFixed(1)
                : "—"
            }
          />
          <SummaryCard
            label="Avg. druggability"
            value={
              entries.length
                ? (
                    entries.reduce((s, e) => s + (e.top_pocket_score || 0), 0) /
                    entries.length
                  ).toFixed(3)
                : "—"
            }
          />
          <SummaryCard
            label="Total drugs"
            value={entries.reduce((s, e) => s + (e.drug_count || 0), 0)}
          />
        </div>

        {/* Dataset table */}
        {loading ? (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Loading dataset…
          </p>
        ) : entries.length === 0 ? (
          <div
            className="panel fade-up rounded-2xl p-6 text-center"
            style={{ animationDelay: "140ms" }}
          >
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              Your dataset is empty. Add protein sessions above to start
              building a structured dataset for research or export.
            </p>
          </div>
        ) : (
          <div
            className="panel fade-up overflow-hidden rounded-2xl"
            style={{ animationDelay: "140ms" }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      background: "var(--field)",
                      color: "var(--ink-soft)",
                    }}
                  >
                    {[
                      "Protein",
                      "Organism",
                      "Chains",
                      "Residues",
                      "Pockets",
                      "Top Score",
                      "Drugs",
                      "Tags",
                      "Notes",
                      "",
                    ].map((col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide"
                        style={{ borderBottom: "1px solid var(--line)" }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid var(--line)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--field)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <td className="px-4 py-3 font-semibold">
                        {entry.protein_name}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {entry.organism || "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{entry.chains}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {entry.residues}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {entry.pocket_count}
                      </td>
                      <td className="px-4 py-3 tabular-nums font-medium">
                        {Number(entry.top_pocket_score || 0).toFixed(3)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {entry.drug_count}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(entry.tags || []).map((t) => (
                            <span
                              key={t}
                              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                              style={{
                                background: "var(--accent-soft)",
                                color: "var(--accent)",
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td
                        className="max-w-[140px] truncate px-4 py-3"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {editId === entry.id ? (
                          <div className="flex gap-1.5">
                            <input
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              className="w-24 rounded border px-2 py-1 text-xs"
                              style={{ borderColor: "var(--line)" }}
                            />
                            <input
                              value={editTags}
                              onChange={(e) => setEditTags(e.target.value)}
                              className="w-24 rounded border px-2 py-1 text-xs"
                              placeholder="tags"
                              style={{ borderColor: "var(--line)" }}
                            />
                            <button
                              onClick={handleUpdate}
                              className="text-xs font-semibold"
                              style={{ color: "var(--accent)" }}
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          entry.notes || "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditId(entry.id);
                              setEditNotes(entry.notes || "");
                              setEditTags((entry.tags || []).join(", "));
                            }}
                            className="text-xs font-semibold"
                            style={{ color: "var(--accent)" }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemove(entry.id)}
                            className="text-xs font-semibold"
                            style={{ color: "var(--danger)" }}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="panel rounded-xl px-5 py-4">
      <p
        className="text-[11px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "var(--ink-soft)" }}
      >
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
