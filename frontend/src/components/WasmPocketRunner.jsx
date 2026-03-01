import { useState } from "react"

function parseFpocketInfo(content) {
  const pockets = []
  for (const block of content.split("Pocket").slice(1)) {
    const idMatch = block.match(/(\d+)/)
    const scoreMatch = block.match(/Druggability Score\s*:\s*([-+]?\d*\.?\d+)/)
    const volumeMatch = block.match(/Volume\s*:\s*([-+]?\d*\.?\d+)/)
    if (!idMatch) continue
    pockets.push({
      pocket_id: Number(idMatch[1]),
      druggability_score: scoreMatch ? Number(scoreMatch[1]) : 0,
      volume: volumeMatch ? Number(volumeMatch[1]) : 0,
      source: "wasm",
    })
  }
  return pockets.sort((a, b) => b.druggability_score - a.druggability_score)
}

export default function WasmPocketRunner({ pdbText, filename, onPocketsDetected, onError }) {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState("")

  const runWasm = async () => {
    if (!pdbText) return
    setRunning(true)
    setStatus("Initializing FPocket WASM...")
    try {
      const assetReport = await preflightAssets()
      if (!assetReport.ok) {
        throw new Error(assetReport.message)
      }

      const stem = (filename || "protein").replace(/\.[^/.]+$/, "")
      const scriptId = "fpocket-wasm-script"

      // Reset previous runtime globals safely (don't delete non-configurable globals).
      window.FPOCKET_Module = undefined
      window.Module = undefined
      window.FS = undefined
      window.store = { state: { pdbFileName: filename || "protein.pdb", pdbFileNameTrimmed: stem } }

      await new Promise((resolve, reject) => {
        let settled = false
        const finishResolve = () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          clearInterval(pollId)
          resolve()
        }
        const finishReject = (err) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          clearInterval(pollId)
          reject(err)
        }

        const timeout = setTimeout(() => {
          finishReject(new Error("WASM execution timed out. Check browser console/network for fpocket assets."))
        }, 90000)
        const pollId = setInterval(() => {
          try {
            const info = tryReadFpocketInfoFromFs(stem)
            if (info) finishResolve()
          } catch {
            // Ignore until timeout.
          }
        }, 1000)

        window.FPOCKET_Module = {
          preRun: [],
          postRun: [],
          stdOut: "",
          stdErr: "",
          pdbFile: pdbText,
          arguments: ["-f", filename || "protein.pdb"],
          print: (...args) => {
            window.FPOCKET_Module.stdOut += `${args.join(" ")}\n`
          },
          printErr: (...args) => {
            window.FPOCKET_Module.stdErr += `${args.join(" ")}\n`
          },
          setStatus: (msg) => {
            if (msg) setStatus(msg)
            if (msg === "") {
              finishResolve()
            }
          },
          onError: (err) => {
            finishReject(err)
          },
          catchError: (err) => {
            finishReject(err)
          },
          locateFile: (path) => `/fpocket-runner/${path}`,
        }

        const existing = document.getElementById(scriptId)
        if (existing) existing.remove()
        const script = document.createElement("script")
        script.id = scriptId
        script.src = `/fpocket-runner/fpocket.js?ts=${Date.now()}`
        script.async = true
        script.onerror = () => {
          finishReject(new Error("Failed to load fpocket.js"))
        }
        document.body.appendChild(script)
      })

      const infoText = readFpocketInfoFromFs(stem)
      const pockets = parseFpocketInfo(infoText)
      if (!pockets.length) throw new Error("WASM run completed but no pockets were parsed.")
      onPocketsDetected?.(pockets)
      setStatus(`Done. Parsed ${pockets.length} pockets.`)
    } catch (err) {
      const logs = (window.FPOCKET_Module?.stdErr || "").trim()
      const baseMsg = err?.message || String(err)
      const msg = logs ? `${baseMsg}\nfpocket stderr:\n${logs}` : baseMsg
      setStatus(`Error: ${msg}`)
      onError?.(msg)
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="panel fade-up rounded-3xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Native WASM Pocket Detection</h2>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            Runs fpocket WebAssembly directly in this app using the loaded session PDB.
          </p>
        </div>
        <button
          onClick={runWasm}
          disabled={running}
          className="rounded-xl border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: "var(--line)", background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {running ? "Running..." : "Run WASM Detection"}
        </button>
      </div>
      <div className="mt-3 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--line)", background: "var(--field)", color: "var(--ink-soft)" }}>
        {status || "Ready"}
      </div>
    </section>
  )
}

function readFpocketInfoFromFs(stem) {
  const fs = window.FS
  const outDir = `/${stem}_out`
  let entries = []
  try {
    entries = fs.readdir(outDir)
  } catch {
    throw new Error(`WASM output folder not found: ${outDir}`)
  }
  const candidates = entries.filter((name) => name.endsWith("_info.txt"))
  if (!candidates.length) {
    throw new Error(
      `No *_info.txt found in ${outDir}. Found: ${entries.join(", ")}. ` +
      `This usually means fpocket run did not finish or required assets are missing.`
    )
  }
  const infoPath = `${outDir}/${candidates[0]}`
  return new TextDecoder("utf-8").decode(fs.readFile(infoPath))
}

function tryReadFpocketInfoFromFs(stem) {
  const fs = window.FS
  if (!fs) return null
  const outDir = `/${stem}_out`
  const entries = fs.readdir(outDir)
  const candidate = entries.find((name) => name.endsWith("_info.txt"))
  if (!candidate) return null
  const infoPath = `${outDir}/${candidate}`
  return new TextDecoder("utf-8").decode(fs.readFile(infoPath))
}

async function preflightAssets() {
  try {
    const jsResp = await fetch("/fpocket-runner/fpocket.js", { cache: "no-store" })
    const wasmResp = await fetch("/fpocket-runner/fpocket.wasm", { cache: "no-store" })
    if (!jsResp.ok) {
      return { ok: false, message: `fpocket.js not reachable (${jsResp.status}).` }
    }
    if (!wasmResp.ok) {
      return { ok: false, message: `fpocket.wasm not reachable (${wasmResp.status}).` }
    }
    const jsText = await jsResp.text()
    const wasmBuf = await wasmResp.arrayBuffer()
    if (!jsText.includes("FPOCKET_Module")) {
      return { ok: false, message: "fpocket.js loaded but does not look like fpocket runtime." }
    }
    if (wasmBuf.byteLength < 100000) {
      return { ok: false, message: `fpocket.wasm size is unexpected (${wasmBuf.byteLength} bytes).` }
    }
    return { ok: true, message: "ok" }
  } catch (err) {
    return { ok: false, message: `Asset preflight failed: ${err?.message || String(err)}` }
  }
}
