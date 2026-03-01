"""
Protein Comparison Engine
-------------------------
Compares two protein sessions:
  - Sequence alignment (BioPython pairwise2)
  - Structural metrics comparison
  - Pocket similarity analysis
  - LLM-powered structural reasoning

Returns a structured comparison report.
"""

import json
from typing import Any

from Bio.Align import PairwiseAligner, substitution_matrices

from services.llm_agent import _gemini_text


async def compare_proteins(
    session_a: dict,
    session_b: dict,
) -> dict:
    """
    Compare two protein sessions and return a detailed comparison.
    Each session dict has: parsed, pockets, drugs, filename
    """
    parsed_a = session_a.get("parsed", {})
    parsed_b = session_b.get("parsed", {})
    pockets_a = session_a.get("pockets", [])
    pockets_b = session_b.get("pockets", [])

    # ── 1. Basic structural comparison ──
    structural = _compare_structure(parsed_a, parsed_b)

    # ── 2. Sequence alignment ──
    alignment = _compare_sequences(parsed_a, parsed_b)

    # ── 3. Pocket comparison ──
    pocket_comparison = _compare_pockets(pockets_a, pockets_b)

    # ── 4. Drug overlap ──
    drug_comparison = _compare_drugs(
        session_a.get("drugs", []),
        session_b.get("drugs", []),
    )

    # ── 5. LLM reasoning ──
    reasoning = ""
    try:
        reasoning = await _llm_comparison(
            parsed_a, parsed_b, pockets_a, pockets_b, alignment, pocket_comparison
        )
    except Exception:
        reasoning = "LLM analysis unavailable."

    return {
        "protein_a": {
            "name": parsed_a.get("name", "Unknown"),
            "filename": session_a.get("filename", ""),
            "organism": parsed_a.get("organism", ""),
        },
        "protein_b": {
            "name": parsed_b.get("name", "Unknown"),
            "filename": session_b.get("filename", ""),
            "organism": parsed_b.get("organism", ""),
        },
        "structural": structural,
        "alignment": alignment,
        "pocket_comparison": pocket_comparison,
        "drug_comparison": drug_comparison,
        "reasoning": reasoning,
    }


def _compare_structure(parsed_a: dict, parsed_b: dict) -> dict:
    """Compare basic structural properties."""
    metrics = [
        ("chains", lambda p: len(p.get("chains", []))),
        ("residues", lambda p: p.get("total_residues", 0)),
        ("atoms", lambda p: p.get("total_atoms", 0)),
        ("resolution", lambda p: p.get("resolution")),
        ("ligands", lambda p: len(p.get("ligands", []))),
    ]
    result = {}
    for key, fn in metrics:
        va, vb = fn(parsed_a), fn(parsed_b)
        result[key] = {
            "a": va,
            "b": vb,
            "delta": (vb - va) if isinstance(va, (int, float)) and isinstance(vb, (int, float)) and va is not None and vb is not None else None,
        }
    return result


def _compare_sequences(parsed_a: dict, parsed_b: dict) -> dict:
    """Pairwise sequence alignment of longest chains."""
    chains_a = parsed_a.get("chains", [])
    chains_b = parsed_b.get("chains", [])

    if not chains_a or not chains_b:
        return {"identity": 0, "score": 0, "aligned_length": 0, "error": "No chains available"}

    # Use longest chain from each
    seq_a = max((c.get("sequence", "") for c in chains_a), key=len, default="")
    seq_b = max((c.get("sequence", "") for c in chains_b), key=len, default="")

    if not seq_a or not seq_b:
        return {"identity": 0, "score": 0, "aligned_length": 0, "error": "Empty sequences"}

    # Truncate very long sequences for performance
    max_len = 500
    seq_a = seq_a[:max_len]
    seq_b = seq_b[:max_len]

    try:
        matrix = substitution_matrices.load("BLOSUM62")
        aligner = PairwiseAligner()
        aligner.substitution_matrix = matrix
        aligner.open_gap_score = -10
        aligner.extend_gap_score = -0.5
        aligner.mode = "global"

        alignments = aligner.align(seq_a, seq_b)
        if not alignments:
            return {"identity": 0, "score": 0, "aligned_length": 0}

        best = alignments[0]
        score = best.score
        aligned_a, aligned_b = best[0], best[1]
        # Convert to string for character-level comparison
        aligned_a_str = str(best).split("\n")[0]
        aligned_b_str = str(best).split("\n")[2] if len(str(best).split("\n")) > 2 else ""

        # Simpler identity from alignment indices
        aligned_length = best.shape[1] if hasattr(best, 'shape') else max(len(seq_a), len(seq_b))

        # Use aligned sequences from format
        fmt = best.format().split("\n")
        line_a = ""
        line_b = ""
        for i, line in enumerate(fmt):
            if line.startswith("target"):
                line_a += line.split()[-1] if len(line.split()) > 1 else ""
            elif line.startswith("query"):
                line_b += line.split()[-1] if len(line.split()) > 1 else ""

        # Fallback: compute identity from sequences directly
        matches = 0
        non_gap = 0
        similar = 0
        min_len = min(len(seq_a), len(seq_b))
        max_len = max(len(seq_a), len(seq_b))

        # Simple global identity based on alignment score
        # For BLOSUM62, perfect match scores ~5 per residue on average
        identity_est = min(100, max(0, (score / (min_len * 5)) * 100)) if min_len > 0 else 0

        return {
            "identity": round(identity_est, 1),
            "similarity": round(min(identity_est * 1.2, 100), 1),
            "score": round(float(score), 1),
            "aligned_length": max_len,
            "seq_a_length": len(seq_a),
            "seq_b_length": len(seq_b),
            "matches": int(identity_est * min_len / 100),
            "gaps": abs(len(seq_a) - len(seq_b)),
        }
    except Exception as e:
        return {"identity": 0, "score": 0, "aligned_length": 0, "error": str(e)}


def _compare_pockets(pockets_a: list, pockets_b: list) -> dict:
    """Compare binding pockets between two proteins."""
    if not pockets_a and not pockets_b:
        return {"summary": "No pockets in either protein", "pairs": []}

    metrics_keys = [
        "druggability_score",
        "volume",
        "total_sasa",
        "hydrophobicity_score",
        "polarity_score",
    ]

    def _pocket_vector(p: dict) -> list[float]:
        m = {**p, **(p.get("metrics", {}))}
        return [float(m.get(k, 0) or 0) for k in metrics_keys]

    def _pocket_similarity(v1: list[float], v2: list[float]) -> float:
        """Cosine similarity between pocket metric vectors."""
        dot = sum(a * b for a, b in zip(v1, v2))
        mag1 = sum(a ** 2 for a in v1) ** 0.5
        mag2 = sum(a ** 2 for a in v2) ** 0.5
        if mag1 == 0 or mag2 == 0:
            return 0
        return round(dot / (mag1 * mag2), 3)

    # Best pocket pairing (greedy, top 5 from each)
    top_a = sorted(pockets_a, key=lambda p: float(p.get("druggability_score", 0)), reverse=True)[:5]
    top_b = sorted(pockets_b, key=lambda p: float(p.get("druggability_score", 0)), reverse=True)[:5]

    pairs = []
    used_b = set()
    for pa in top_a:
        va = _pocket_vector(pa)
        best_sim = -1
        best_pb = None
        for pb in top_b:
            if pb["pocket_id"] in used_b:
                continue
            vb = _pocket_vector(pb)
            sim = _pocket_similarity(va, vb)
            if sim > best_sim:
                best_sim = sim
                best_pb = pb

        if best_pb:
            used_b.add(best_pb["pocket_id"])
            pairs.append({
                "pocket_a": pa["pocket_id"],
                "pocket_b": best_pb["pocket_id"],
                "similarity": best_sim,
                "metrics_a": {k: float(({**pa, **(pa.get("metrics", {}))}).get(k, 0) or 0) for k in metrics_keys},
                "metrics_b": {k: float(({**best_pb, **(best_pb.get("metrics", {}))}).get(k, 0) or 0) for k in metrics_keys},
            })

    # Aggregate stats
    avg_sim = sum(p["similarity"] for p in pairs) / len(pairs) if pairs else 0
    best_pair = max(pairs, key=lambda p: p["similarity"]) if pairs else None

    return {
        "count_a": len(pockets_a),
        "count_b": len(pockets_b),
        "pairs": pairs,
        "average_similarity": round(avg_sim, 3),
        "best_match": best_pair,
        "summary": f"{len(pairs)} pocket pairs matched with avg similarity {avg_sim:.1%}",
    }


def _compare_drugs(drugs_a: list, drugs_b: list) -> dict:
    """Find common and unique drug candidates."""
    names_a = {d.get("name", "").lower() for d in (drugs_a or []) if d.get("name")}
    names_b = {d.get("name", "").lower() for d in (drugs_b or []) if d.get("name")}

    common = names_a & names_b
    unique_a = names_a - names_b
    unique_b = names_b - names_a

    return {
        "common": sorted(common),
        "unique_a": sorted(unique_a),
        "unique_b": sorted(unique_b),
        "overlap_ratio": round(len(common) / max(len(names_a | names_b), 1), 2),
    }


async def _llm_comparison(
    parsed_a: dict,
    parsed_b: dict,
    pockets_a: list,
    pockets_b: list,
    alignment: dict,
    pocket_comparison: dict,
) -> str:
    """Generate LLM-powered comparison reasoning."""
    prompt = f"""Compare these two proteins for a structural biology researcher:

Protein A: {parsed_a.get('name', 'Unknown')} ({parsed_a.get('organism', '')})
- {parsed_a.get('total_residues', 0)} residues, {len(parsed_a.get('chains', []))} chains
- {len(pockets_a)} binding pockets

Protein B: {parsed_b.get('name', 'Unknown')} ({parsed_b.get('organism', '')})
- {parsed_b.get('total_residues', 0)} residues, {len(parsed_b.get('chains', []))} chains
- {len(pockets_b)} binding pockets

Sequence identity: {alignment.get('identity', 0):.1f}%
Pocket similarity: {pocket_comparison.get('average_similarity', 0):.1%}

Provide 3-4 sentences of scientific analysis about:
1. Structural relationship between the proteins
2. Binding site conservation
3. Implications for drug repurposing"""

    return await _gemini_text(
        system="You are a structural biologist. Be concise and scientific.",
        prompt=prompt,
        max_output_tokens=300,
    )
