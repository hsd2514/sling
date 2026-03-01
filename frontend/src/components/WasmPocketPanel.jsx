export default function WasmPocketPanel({ filename, pdbText }) {
  const downloadPdb = () => {
    if (!pdbText) return
    const blob = new Blob([pdbText], { type: "chemical/x-pdb" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename || "protein.pdb"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="panel fade-up rounded-3xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">In-App WASM Pocket Workspace</h2>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            Embedded FPocketWeb runs in your browser. Export and import pockets back into this session.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={downloadPdb}
            className="rounded-xl border px-3 py-2 text-xs font-semibold"
            style={{ borderColor: "var(--line)", background: "white" }}
          >
            Download This PDB
          </button>
          <a
            href="https://durrantlab.com/fpocketweb/"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border px-3 py-2 text-xs font-semibold"
            style={{ borderColor: "var(--line)", background: "var(--field)", color: "var(--ink)" }}
          >
            Open Fullscreen
          </a>
        </div>
      </div>

      <div className="mb-3 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--line)", background: "var(--field)" }}>
        1. Download this session PDB. 2. Run FPocketWeb in the frame. 3. Export results. 4. Use Import pockets in header.
      </div>

      <iframe
        title="FPocketWeb"
        src="https://durrantlab.com/fpocketweb/"
        className="h-[68vh] w-full rounded-2xl border"
        style={{ borderColor: "var(--line)", background: "white" }}
      />
    </section>
  )
}
