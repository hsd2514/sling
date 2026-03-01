import subprocess
import json
import os
import re
from glob import glob

FPOCKET_IMAGE = os.getenv("FPOCKET_DOCKER_IMAGE", "fpocket/fpocket")
FPOCKET_TIMEOUT = int(os.getenv("FPOCKET_TIMEOUT_SECONDS", "120"))
USE_DOCKER_FALLBACK = os.getenv("FPOCKET_USE_DOCKER_FALLBACK", "true").lower() == "true"

# All 18 fpocket metrics in order they appear in the info file
FPOCKET_METRIC_KEYS = [
    "score", "druggability_score", "alpha_spheres", "total_sasa",
    "polar_sasa", "apolar_sasa", "volume", "mean_local_hydrophobic_density",
    "mean_alpha_sphere_radius", "mean_alpha_sphere_solvent_access",
    "apolar_alpha_sphere_proportion", "hydrophobicity_score",
    "volume_score", "polarity_score", "charge_score",
    "proportion_polar_atoms", "alpha_sphere_density",
    "center_of_mass_alpha_sphere_max_dist", "flexibility",
]


def detect_pockets(pdb_path: str, params: dict | None = None) -> list[dict]:
    """
    Run fpocket on a PDB file and return ranked binding pockets.
    Raises RuntimeError if fpocket is unavailable or output cannot be parsed.
    """
    try:
        _run_local_fpocket(pdb_path, params)
    except RuntimeError as local_error:
        if not USE_DOCKER_FALLBACK:
            raise local_error
        _run_docker_fpocket(pdb_path, local_error, params)

    return _parse_fpocket_output(pdb_path)


def _build_fpocket_args(pdb_path: str, params: dict | None = None) -> list[str]:
    """Build fpocket command line from optional advanced parameters."""
    cmd = ["fpocket", "-f", pdb_path]
    if not params:
        return cmd
    param_map = {
        "min_alpha_sphere_radius": "-m",
        "max_alpha_sphere_radius": "-M",
        "min_alpha_spheres": "-i",
        "clustering_distance": "-D",
        "clustering_method": "-C",
        "min_ratio_apolar_spheres": "-r",
    }
    for key, flag in param_map.items():
        if key in params and params[key] is not None:
            cmd.extend([flag, str(params[key])])
    return cmd


def _run_local_fpocket(pdb_path: str, params: dict | None = None) -> None:
    cmd = _build_fpocket_args(pdb_path, params)
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=FPOCKET_TIMEOUT,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("fpocket is not installed or not on PATH.") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("fpocket timed out while analyzing the structure.") from exc

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        raise RuntimeError(f"fpocket failed (exit {result.returncode}). {stderr}")


def _run_docker_fpocket(pdb_path: str, local_error: RuntimeError, params: dict | None = None) -> None:
    host_dir = os.path.abspath(os.path.dirname(pdb_path))
    basename = os.path.basename(pdb_path)
    mount_arg = f"{host_dir}:/workdir"
    fpocket_args = _build_fpocket_args(f"/workdir/{basename}", params)
    cmd = [
        "docker",
        "run",
        "--rm",
        "-v",
        mount_arg,
        "-w",
        "/workdir",
        FPOCKET_IMAGE,
    ] + fpocket_args

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=FPOCKET_TIMEOUT,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"{local_error} Docker fallback unavailable: docker is not installed or not on PATH."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Docker fpocket timed out while analyzing the structure.") from exc

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        raise RuntimeError(
            f"{local_error} Docker fallback failed (image: {FPOCKET_IMAGE}). {stderr}"
        )


def _parse_fpocket_output(pdb_path: str) -> list[dict]:
    """Parse fpocket's info file for all pocket metrics, atom PDB data, and centers."""
    base = pdb_path.replace(".pdb", "_out")
    stem = os.path.splitext(os.path.basename(pdb_path))[0]
    candidate_files = [
        os.path.join(base, f"{stem}_info.txt"),
        os.path.join(base, f"{os.path.basename(base)}_info.txt"),
    ]
    glob_matches = sorted(glob(os.path.join(base, "*_info.txt")))
    if glob_matches:
        candidate_files.extend(glob_matches)

    info_file = next((p for p in candidate_files if os.path.exists(p)), None)
    pockets = []
    if not info_file:
        raise RuntimeError(
            f"fpocket output info file not found under: {base}"
        )

    with open(info_file) as f:
        content = f.read()

    for block in content.split("Pocket")[1:]:
        idx_match = re.search(r"(\d+)", block)
        idx = int(idx_match.group(1)) if idx_match else len(pockets) + 1

        # Extract all metrics from the block
        metrics = _parse_all_metrics(block)

        pocket_data = {
            "pocket_id": idx,
            "druggability_score": metrics.get("druggability_score", 0.0),
            "volume": metrics.get("volume", 0.0),
            "center": _read_pocket_center(base, idx),
            "metrics": metrics,
            "pdb_data": _read_pocket_pdb(base, idx),
        }
        pockets.append(pocket_data)

    if not pockets:
        raise RuntimeError("fpocket completed but no pockets were parsed from output.")

    return sorted(pockets, key=lambda x: x["druggability_score"], reverse=True)


def _parse_all_metrics(block: str) -> dict:
    """Extract all 18 fpocket metrics from an info file block."""
    metrics = {}
    # Each line is "Label : value"
    lines = block.strip().split("\n")
    metric_patterns = {
        "score": r"Score\s*:\s*([-+]?\d*\.?\d+)",
        "druggability_score": r"Druggability Score\s*:\s*([-+]?\d*\.?\d+)",
        "alpha_spheres": r"Number of Alpha Spheres\s*:\s*(\d+)",
        "total_sasa": r"Total SASA\s*:\s*([-+]?\d*\.?\d+)",
        "polar_sasa": r"Polar SASA\s*:\s*([-+]?\d*\.?\d+)",
        "apolar_sasa": r"Apolar SASA\s*:\s*([-+]?\d*\.?\d+)",
        "volume": r"Volume\s*:\s*([-+]?\d*\.?\d+)",
        "mean_local_hydrophobic_density": r"Mean local hydrophobic density\s*:\s*([-+]?\d*\.?\d+)",
        "mean_alpha_sphere_radius": r"Mean alpha sphere radius\s*:\s*([-+]?\d*\.?\d+)",
        "mean_alpha_sphere_solvent_access": r"Mean alp\w* sph\w* solvent\s*access\s*:\s*([-+]?\d*\.?\d+)",
        "apolar_alpha_sphere_proportion": r"Apolar alpha sphere proportion\s*:\s*([-+]?\d*\.?\d+)",
        "hydrophobicity_score": r"Hydrophobicity score\s*:\s*([-+]?\d*\.?\d+)",
        "volume_score": r"Volume score\s*:\s*([-+]?\d*\.?\d+)",
        "polarity_score": r"Polarity score\s*:\s*([-+]?\d*\.?\d+)",
        "charge_score": r"Charge score\s*:\s*([-+]?\d*\.?\d+)",
        "proportion_polar_atoms": r"Proportion of polar atoms\s*:\s*([-+]?\d*\.?\d+)",
        "alpha_sphere_density": r"Alpha sphere density\s*:\s*([-+]?\d*\.?\d+)",
        "center_of_mass_alpha_sphere_max_dist": r"[Cc]ent\w*.*alpha sphere max dist\w*\s*:\s*([-+]?\d*\.?\d+)",
        "flexibility": r"Flexibility\s*:\s*([-+]?\d*\.?\d+)",
    }
    full_text = "\n".join(lines)
    for key, pattern in metric_patterns.items():
        m = re.search(pattern, full_text, re.IGNORECASE)
        if m:
            val = m.group(1)
            metrics[key] = int(val) if key == "alpha_spheres" else float(val)
    return metrics


def _read_pocket_pdb(output_dir: str, pocket_id: int) -> str | None:
    """Read the raw PDB content for a pocket's atoms."""
    pocket_file = os.path.join(output_dir, "pockets", f"pocket{pocket_id}_atm.pdb")
    if not os.path.exists(pocket_file):
        return None
    with open(pocket_file, encoding="utf-8", errors="ignore") as fh:
        return fh.read()


def get_pocket_pdb_path(session_id: str, pocket_id: int) -> str | None:
    """Return the filesystem path to a pocket's atom PDB file, or None."""
    pdb_path = f"uploads/{session_id}.pdb"
    base = pdb_path.replace(".pdb", "_out")
    pocket_file = os.path.join(base, "pockets", f"pocket{pocket_id}_atm.pdb")
    if os.path.exists(pocket_file):
        return pocket_file
    return None


def parse_imported_pockets(filename: str, content: bytes) -> list[dict]:
    """
    Parse pockets imported from FPocketWeb/fpocket exports.
    Supports JSON and fpocket-style text/info files.
    """
    text = content.decode("utf-8", errors="ignore")
    lower = filename.lower()
    if lower.endswith(".json"):
        return _parse_pockets_json(text)
    return _parse_pockets_text(text)


def _parse_pockets_json(text: str) -> list[dict]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Imported JSON is invalid.") from exc

    if isinstance(data, dict):
        candidates = data.get("pockets", [])
    elif isinstance(data, list):
        candidates = data
    else:
        raise RuntimeError("Unsupported JSON structure for pocket import.")

    pockets = []
    for idx, item in enumerate(candidates, start=1):
        if not isinstance(item, dict):
            continue
        pocket_id = int(item.get("pocket_id", item.get("id", idx)))
        score_val = item.get("druggability_score", item.get("score", 0))
        volume_val = item.get("volume", item.get("pocket_volume", 0))
        pockets.append(
            {
                "pocket_id": pocket_id,
                "druggability_score": float(score_val),
                "volume": float(volume_val),
                "center": item.get("center"),
            }
        )

    if not pockets:
        raise RuntimeError("No pocket entries found in imported JSON.")

    return sorted(pockets, key=lambda x: x["druggability_score"], reverse=True)


def _parse_pockets_text(text: str) -> list[dict]:
    pockets = []
    for block in text.split("Pocket")[1:]:
        idx_match = re.search(r"(\d+)", block)
        score_match = re.search(r"Druggability Score\s*:\s*([-+]?\d*\.?\d+)", block)
        volume_match = re.search(r"Volume\s*:\s*([-+]?\d*\.?\d+)", block)
        if not idx_match:
            continue
        pockets.append(
            {
                "pocket_id": int(idx_match.group(1)),
                "druggability_score": float(score_match.group(1)) if score_match else 0.0,
                "volume": float(volume_match.group(1)) if volume_match else 0.0,
                "center": None,
            }
        )

    if not pockets:
        raise RuntimeError(
            "Could not parse pockets from the uploaded file. Use FPocketWeb JSON export or fpocket info text."
        )

    return sorted(pockets, key=lambda x: x["druggability_score"], reverse=True)


def _read_pocket_center(output_dir: str, pocket_id: int) -> dict | None:
    pocket_file = os.path.join(output_dir, "pockets", f"pocket{pocket_id}_atm.pdb")
    if not os.path.exists(pocket_file):
        return None
    xs: list[float] = []
    ys: list[float] = []
    zs: list[float] = []
    with open(pocket_file, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            if not (line.startswith("ATOM") or line.startswith("HETATM")):
                continue
            try:
                xs.append(float(line[30:38].strip()))
                ys.append(float(line[38:46].strip()))
                zs.append(float(line[46:54].strip()))
            except ValueError:
                continue
    if not xs:
        return None
    return {
        "x": sum(xs) / len(xs),
        "y": sum(ys) / len(ys),
        "z": sum(zs) / len(zs),
    }
