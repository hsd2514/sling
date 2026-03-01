import os

import httpx

from services.llm_agent import get_drug_reasoning


PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"

# Curated seed compounds mapped to protein families / keywords
PROTEIN_FAMILY_DRUGS: dict[str, list[str]] = {
    "kinase": ["Imatinib", "Erlotinib", "Gefitinib", "Sorafenib"],
    "protease": ["Ritonavir", "Lopinavir", "Saquinavir", "Boceprevir"],
    "receptor": ["Cetuximab", "Trastuzumab", "Gefitinib", "Lapatinib"],
    "default": ["Aspirin", "Ibuprofen", "Metformin", "Tamoxifen"],
}


async def fetch_drug_suggestions(parsed: dict, pockets: list[dict]) -> list[dict]:
    """Fetch drug candidates from PubChem and enrich with LLM reasoning."""
    protein_name = parsed.get("name", "").lower()
    seed_key = next(
        (k for k in PROTEIN_FAMILY_DRUGS if k in protein_name),
        "default",
    )
    drug_names = PROTEIN_FAMILY_DRUGS[seed_key]

    drugs = []
    async with httpx.AsyncClient(timeout=15) as client:
        for name in drug_names:
            try:
                r = await client.get(
                    f"{PUBCHEM_BASE}/compound/name/{name}/JSON"
                )
                if r.status_code != 200:
                    continue
                data = r.json()
                props = data["PC_Compounds"][0]["props"]
                cid = data["PC_Compounds"][0]["id"]["id"]["cid"]
                mol_weight = _extract_prop(props, "Molecular Weight")
                formula = _extract_prop(props, "Molecular Formula")
                iupac = _extract_prop(props, "IUPAC Name")
                drugs.append({
                    "name": name,
                    "cid": cid,
                    "molecular_weight": mol_weight,
                    "formula": formula,
                    "iupac_name": iupac,
                    "pubchem_url": f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
                })
            except Exception:
                drugs.append({"name": name, "error": "PubChem lookup failed"})

    # Enrich with LLM reasoning
    if drugs and pockets:
        reasoning = await get_drug_reasoning(parsed, pockets, drugs)
        for drug in drugs:
            drug["reasoning"] = reasoning.get(drug["name"], "")

    return drugs


async def fetch_drug_suggestions_for_pocket(
    parsed: dict,
    pockets: list[dict],
    pocket_id: int,
) -> list[dict]:
    selected = [p for p in pockets if int(p.get("pocket_id", -1)) == pocket_id]
    if not selected:
        raise ValueError(f"Pocket {pocket_id} not found in session.")
    return await fetch_drug_suggestions(parsed, selected)


def _extract_prop(props: list, label: str) -> str:
    for p in props:
        if p.get("urn", {}).get("label") == label:
            val = p.get("value", {})
            return str(val.get("sval") or val.get("fval") or val.get("ival") or "")
    return ""
