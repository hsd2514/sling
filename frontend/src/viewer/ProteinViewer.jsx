import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";

/* ── Default pocket colors (like fpocketweb, random-ish distinct palette) ── */
const DEFAULT_POCKET_COLORS = [
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

function backgroundForTheme(theme) {
  if (theme === "heatmap") return "#eef8fb";
  if (theme === "publication") return "#f7f8fc";
  return "#eef3f8";
}

/**
 * Advanced 3D protein viewer powered by 3Dmol.js.
 * Features: surface-based pockets, representation toggles, atom hover labels,
 * per-pocket visibility/color/opacity, crystal ligand overlay, distance
 * measurement, screenshot export, animated pocket tour, slab clipping.
 */
const ProteinViewer = forwardRef(function ProteinViewer(
  {
    pdbContent,
    pockets = [],
    selectedPocketId,
    theme = "clinical",
    visiblePocketIds = null, // Set<number> or null (all visible)
    pocketColors = {}, // { [pocket_id]: '#hex' }
    pocketOpacities = {}, // { [pocket_id]: 0.0-1.0 }
    showSurface = false,
    showSticks = false,
    showLigands = true,
    ligands = [], // from parsed.ligands
    onAtomHover, // callback({ resn, resi, atom, chain })
    measureMode = false, // distance measurement mode
    onMeasurement, // callback({ distance, atom1, atom2 })
    slabNear = 0, // slab near plane 0-100
    slabFar = 100, // slab far plane 0-100
  },
  ref,
) {
  const viewerRef = useRef(null);
  const containerRef = useRef(null);
  const proteinModelRef = useRef(null);
  const pocketModelsRef = useRef({});
  const pocketSurfacesRef = useRef({});
  const surfaceObjRef = useRef(null);
  const ligandModelsRef = useRef([]);
  const measureAtomRef = useRef(null); // first clicked atom for measurement
  const tourIntervalRef = useRef(null);

  // Expose viewer methods
  useImperativeHandle(ref, () => ({
    getViewer: () => viewerRef.current,
    zoomToPocket: (pocketId) => {
      const pocket = pockets.find((p) => p.pocket_id === pocketId);
      if (pocket?.center && viewerRef.current) {
        viewerRef.current.zoomTo({ center: pocket.center, radius: 12 });
        viewerRef.current.render();
      }
    },
    resetView: () => {
      if (viewerRef.current) {
        viewerRef.current.zoomTo();
        viewerRef.current.render();
      }
    },
    /** Export the current canvas as a PNG data URL */
    exportPng: () => {
      if (viewerRef.current) return viewerRef.current.pngURI();
      return null;
    },
    /** Animated fly-through of all visible pockets */
    startPocketTour: (delayMs = 2800) => {
      const viewer = viewerRef.current;
      if (!viewer || !pockets.length) return;
      stopTour();
      const visible = pockets.filter(
        (p) =>
          p.center &&
          (visiblePocketIds === null || visiblePocketIds.has(p.pocket_id)),
      );
      if (!visible.length) return;
      let idx = 0;
      const step = () => {
        const p = visible[idx % visible.length];
        viewer.removeAllLabels();
        viewer.addLabel(`Pocket ${p.pocket_id}`, {
          position: { x: p.center.x, y: p.center.y, z: p.center.z },
          backgroundColor: "#111827",
          fontColor: "white",
          fontSize: 13,
        });
        viewer.zoomTo(
          {
            center: { x: p.center.x, y: p.center.y, z: p.center.z },
            radius: 14,
          },
          800,
        );
        viewer.render();
        idx++;
      };
      step(); // start first immediately
      tourIntervalRef.current = setInterval(step, delayMs);
    },
    stopPocketTour: () => stopTour(),
  }));

  const stopTour = useCallback(() => {
    if (tourIntervalRef.current) {
      clearInterval(tourIntervalRef.current);
      tourIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!pdbContent || !window.$3Dmol) return;

    const viewer = window.$3Dmol.createViewer(containerRef.current, {
      backgroundColor: backgroundForTheme(theme),
    });
    viewerRef.current = viewer;

    // ── Main protein model ──
    const proteinModel = viewer.addModel(pdbContent, "pdb", { keepH: true });
    proteinModelRef.current = proteinModel;

    // Default: spectrum cartoon
    proteinModel.setStyle({}, { cartoon: { color: "spectrum" } });

    // ── Atom hover labels ──
    viewer.setHoverable(
      {},
      true,
      (atom) => {
        if (measureMode) return; // don't interfere with measurement clicks
        const lbl = `${(atom.resn || "").trim()}${atom.resi}:${(atom.atom || "").trim()}${atom.chain ? ":" + atom.chain.trim() : ""}`;
        viewer.addLabel(lbl, {
          position: atom,
          backgroundOpacity: 0.78,
          backgroundColor: "#111827",
          fontColor: "#f8fafc",
          fontSize: 11,
        });
        onAtomHover?.({
          resn: atom.resn,
          resi: atom.resi,
          atom: atom.atom,
          chain: atom.chain,
        });
      },
      () => {
        if (!measureMode) viewer.removeAllLabels();
      },
    );

    // ── Distance measurement mode ──
    if (measureMode) {
      viewer.setClickable({}, true, (atom) => {
        const first = measureAtomRef.current;
        if (!first) {
          // First click — mark atom
          measureAtomRef.current = atom;
          viewer.addSphere({
            center: { x: atom.x, y: atom.y, z: atom.z },
            radius: 0.6,
            color: "#f59e0b",
            alpha: 0.9,
          });
          viewer.render();
        } else {
          // Second click — compute distance and draw line
          const dx = atom.x - first.x;
          const dy = atom.y - first.y;
          const dz = atom.z - first.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const mid = {
            x: (atom.x + first.x) / 2,
            y: (atom.y + first.y) / 2,
            z: (atom.z + first.z) / 2,
          };
          viewer.addCylinder({
            start: { x: first.x, y: first.y, z: first.z },
            end: { x: atom.x, y: atom.y, z: atom.z },
            radius: 0.08,
            color: "#f59e0b",
            fromCap: true,
            toCap: true,
          });
          viewer.addLabel(`${dist.toFixed(2)} Å`, {
            position: mid,
            backgroundColor: "#f59e0b",
            fontColor: "#111827",
            fontSize: 12,
            backgroundOpacity: 0.92,
          });
          viewer.addSphere({
            center: { x: atom.x, y: atom.y, z: atom.z },
            radius: 0.6,
            color: "#f59e0b",
            alpha: 0.9,
          });
          viewer.render();
          onMeasurement?.({
            distance: dist,
            atom1: {
              resn: first.resn,
              resi: first.resi,
              atom: first.atom,
              chain: first.chain,
            },
            atom2: {
              resn: atom.resn,
              resi: atom.resi,
              atom: atom.atom,
              chain: atom.chain,
            },
          });
          measureAtomRef.current = null;
        }
      });
    }

    // ── Sticks overlay ──
    if (showSticks) {
      proteinModel.setStyle(
        {},
        {
          stick: { radius: 0.15 },
          cartoon: { color: "spectrum" },
        },
      );
    }

    // ── Crystal ligand overlay ──
    ligandModelsRef.current = [];
    if (showLigands && pdbContent) {
      // Ligands are HETATM records in the PDB. Show them as yellow sticks.
      proteinModel.setStyle(
        { hetflag: true },
        {
          stick: { radius: 0.3, color: "#eab308" },
        },
      );
    }

    // ── Pocket surfaces (the fpocketweb way) ──
    const newPocketModels = {};
    const newPocketSurfaces = {};
    pockets.forEach((pocket, idx) => {
      const pocketPdb = pocket.pdb_data;
      const isVisible =
        visiblePocketIds === null || visiblePocketIds.has(pocket.pocket_id);
      if (!pocketPdb || !isVisible) return;

      const model = viewer.addModel(pocketPdb, "pdb", { keepH: true });
      model.setStyle({}, {}); // clear default style

      const color =
        pocketColors[pocket.pocket_id] ||
        DEFAULT_POCKET_COLORS[idx % DEFAULT_POCKET_COLORS.length];
      const opacity = pocketOpacities[pocket.pocket_id] ?? 0.75;

      const srf = viewer.addSurface(
        window.$3Dmol.SurfaceType.MS,
        { color, opacity },
        { model },
      );

      newPocketModels[pocket.pocket_id] = model;
      newPocketSurfaces[pocket.pocket_id] = srf;
    });
    pocketModelsRef.current = newPocketModels;
    pocketSurfacesRef.current = newPocketSurfaces;

    // ── Fallback: simple spheres for pockets without PDB data ──
    pockets.forEach((pocket, idx) => {
      if (pocket.pdb_data) return; // already rendered as surface
      const isVisible =
        visiblePocketIds === null || visiblePocketIds.has(pocket.pocket_id);
      if (!isVisible || !pocket.center) return;

      const color =
        pocketColors[pocket.pocket_id] ||
        DEFAULT_POCKET_COLORS[idx % DEFAULT_POCKET_COLORS.length];
      const opacity = pocketOpacities[pocket.pocket_id] ?? 0.5;
      const isSelected = Number(selectedPocketId) === Number(pocket.pocket_id);

      viewer.addSphere({
        center: { x: pocket.center.x, y: pocket.center.y, z: pocket.center.z },
        radius: isSelected ? 2.8 : 1.8,
        color,
        alpha: isSelected ? Math.min(opacity + 0.15, 1.0) : opacity * 0.6,
      });
    });

    // ── Protein molecular surface ──
    if (showSurface) {
      const srf = viewer.addSurface(
        window.$3Dmol.SurfaceType.MS,
        { color: "white", opacity: 0.82 },
        { model: proteinModel },
      );
      surfaceObjRef.current = srf;
    }

    // ── Slab / clipping planes ──
    if (slabNear > 0 || slabFar < 100) {
      viewer.setSlab(slabNear, slabFar);
    }

    // ── Zoom ──
    const selected = pockets.find(
      (p) => Number(p.pocket_id) === Number(selectedPocketId) && p.center,
    );
    if (selected?.center) {
      const c = selected.center;
      viewer.addLabel(`Pocket ${selected.pocket_id}`, {
        position: { x: c.x, y: c.y, z: c.z },
        backgroundColor: "#111827",
        fontColor: "white",
        fontSize: 12,
      });
      viewer.zoomTo({ center: { x: c.x, y: c.y, z: c.z }, radius: 14 });
    } else {
      viewer.zoomTo();
    }

    viewer.zoom(0.85, 400);
    viewer.render();

    return () => {
      stopTour();
      viewer.clear();
      pocketModelsRef.current = {};
      pocketSurfacesRef.current = {};
      surfaceObjRef.current = null;
      ligandModelsRef.current = [];
    };
  }, [
    pdbContent,
    pockets,
    selectedPocketId,
    theme,
    visiblePocketIds,
    pocketColors,
    pocketOpacities,
    showSurface,
    showSticks,
    showLigands,
    measureMode,
    slabNear,
    slabFar,
  ]);

  return (
    <div className="relative flex h-full flex-col">
      <div
        ref={containerRef}
        className="w-full flex-1 rounded-2xl border"
        style={{
          minHeight: 0,
          borderColor: "var(--line)",
          background: backgroundForTheme(theme),
        }}
      />
      {measureMode && (
        <div
          className="absolute left-3 top-3 z-10 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: "#f59e0b", color: "#111827" }}
        >
          Click two atoms to measure distance
        </div>
      )}
    </div>
  );
});

export default ProteinViewer;
