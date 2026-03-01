"""
Knowledge Graph Service
-----------------------
Builds a protein → drug → disease relationship graph by querying:
  - UniProt REST API (protein info, cross-refs, disease associations)
  - Open Targets Platform (disease–target associations)
  - PubChem REST API (drug compounds)
  - LLM enrichment for relationship reasoning

Returns a graph structure: { nodes: [...], edges: [...] }
"""

import asyncio
import json
import os
import re
from typing import Any

import httpx

from services.llm_agent import _gemini_text

UNIPROT_BASE = "https://rest.uniprot.org/uniprotkb"
OPENTARGETS_BASE = "https://api.platform.opentargets.org/api/v4/graphql"
PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"


async def build_knowledge_graph(
    parsed: dict,
    pockets: list[dict],
    drugs: list[dict],
    session_id: str,
) -> dict:
    """
    Build a protein–drug–disease knowledge graph.
    Returns { nodes: [...], edges: [...], summary: str }
    """
    protein_name = parsed.get("name", "Unknown Protein")
    organism = parsed.get("organism", "")

    nodes: list[dict] = []
    edges: list[dict] = []
    seen_ids: set[str] = set()

    # ── 1. Central protein node ──
    protein_node_id = f"protein:{session_id[:8]}"
    nodes.append({
        "id": protein_node_id,
        "label": _clean_name(protein_name),
        "type": "protein",
        "data": {
            "organism": organism,
            "chains": len(parsed.get("chains", [])),
            "residues": parsed.get("total_residues", 0),
            "atoms": parsed.get("total_atoms", 0),
            "resolution": parsed.get("resolution"),
            "pockets": len(pockets),
        },
    })
    seen_ids.add(protein_node_id)

    # ── 2. Add pocket nodes ──
    top_pockets = sorted(
        pockets, key=lambda p: float(p.get("druggability_score", 0)), reverse=True
    )[:5]
    for p in top_pockets:
        pid = f"pocket:{p['pocket_id']}"
        if pid in seen_ids:
            continue
        seen_ids.add(pid)
        nodes.append({
            "id": pid,
            "label": f"Pocket {p['pocket_id']}",
            "type": "pocket",
            "data": {
                "druggability": round(float(p.get("druggability_score", 0)), 3),
                "volume": round(float(p.get("volume", 0)), 1),
            },
        })
        edges.append({
            "source": protein_node_id,
            "target": pid,
            "label": "has_binding_site",
            "weight": float(p.get("druggability_score", 0)),
        })

    # ── 3. Gather external data in parallel ──
    async with httpx.AsyncClient(timeout=12) as client:
        tasks = [
            _fetch_uniprot_data(client, protein_name, organism),
            _fetch_drug_nodes(client, drugs),
            _fetch_opentargets_diseases(client, protein_name),
        ]
        uniprot_data, drug_results, disease_results = await asyncio.gather(
            *tasks, return_exceptions=True
        )

    # ── 4. Process UniProt data ──
    if isinstance(uniprot_data, dict) and uniprot_data:
        uni_id = uniprot_data.get("accession", "")
        if uni_id:
            nodes[0]["data"]["uniprot_id"] = uni_id
            nodes[0]["data"]["gene"] = uniprot_data.get("gene", "")
            nodes[0]["data"]["function"] = uniprot_data.get("function", "")[:200]

        # UniProt disease associations
        for disease in uniprot_data.get("diseases", [])[:6]:
            did = f"disease:{_slug(disease['name'])}"
            if did in seen_ids:
                continue
            seen_ids.add(did)
            nodes.append({
                "id": did,
                "label": disease["name"],
                "type": "disease",
                "data": {"source": "UniProt", "description": disease.get("description", "")[:150]},
            })
            edges.append({
                "source": protein_node_id,
                "target": did,
                "label": "associated_with",
                "weight": 0.8,
            })

    # ── 5. Process drug nodes ──
    if isinstance(drug_results, list):
        for drug_node in drug_results:
            did = drug_node["id"]
            if did in seen_ids:
                continue
            seen_ids.add(did)
            nodes.append(drug_node)
            # Drug → protein edge
            edges.append({
                "source": did,
                "target": protein_node_id,
                "label": "targets",
                "weight": 0.7,
            })
            # Drug → best pocket edge
            if top_pockets:
                edges.append({
                    "source": did,
                    "target": f"pocket:{top_pockets[0]['pocket_id']}",
                    "label": "binds_to",
                    "weight": 0.5,
                })

    # ── 6. Process disease data from Open Targets ──
    if isinstance(disease_results, list):
        for disease in disease_results[:6]:
            did = f"disease:{_slug(disease['name'])}"
            if did in seen_ids:
                # Add cross-edge drug→disease if applicable
                for dn in (drug_results if isinstance(drug_results, list) else []):
                    if dn["id"] not in seen_ids:
                        continue
                    edges.append({
                        "source": dn["id"],
                        "target": did,
                        "label": "treats",
                        "weight": disease.get("score", 0.5),
                    })
                continue
            seen_ids.add(did)
            nodes.append({
                "id": did,
                "label": disease["name"],
                "type": "disease",
                "data": {
                    "source": "Open Targets",
                    "score": disease.get("score", 0),
                    "therapeutic_areas": disease.get("therapeutic_areas", []),
                },
            })
            edges.append({
                "source": protein_node_id,
                "target": did,
                "label": "implicated_in",
                "weight": disease.get("score", 0.5),
            })
            # Drug → disease edges
            for dn in (drug_results if isinstance(drug_results, list) else []):
                if dn["id"] not in seen_ids:
                    continue
                edges.append({
                    "source": dn["id"],
                    "target": did,
                    "label": "indicated_for",
                    "weight": 0.4,
                })

    # ── 7. LLM enrichment for summary ──
    summary = ""
    try:
        summary = await _llm_graph_summary(protein_name, nodes, edges)
    except Exception:
        summary = f"Knowledge graph for {protein_name} with {len(nodes)} nodes and {len(edges)} relationships."

    return {
        "nodes": nodes,
        "edges": edges,
        "summary": summary,
    }


# ═══════════════════════════════════════════════════════════════
# External API helpers
# ═══════════════════════════════════════════════════════════════

async def _fetch_uniprot_data(client: httpx.AsyncClient, protein_name: str, organism: str) -> dict:
    """Search UniProt for protein, return accession + disease associations."""
    query = protein_name.strip()
    if organism and organism.lower() != "unknown":
        query += f" AND organism_name:{organism}"

    try:
        r = await client.get(
            f"{UNIPROT_BASE}/search",
            params={
                "query": query,
                "format": "json",
                "size": 1,
                "fields": "accession,gene_names,cc_disease,cc_function,organism_name",
            },
        )
        if r.status_code != 200:
            return {}

        data = r.json()
        results = data.get("results", [])
        if not results:
            return {}

        entry = results[0]
        accession = entry.get("primaryAccession", "")
        genes = entry.get("genes", [])
        gene_name = genes[0].get("geneName", {}).get("value", "") if genes else ""

        # Extract diseases from comments
        diseases = []
        for comment in entry.get("comments", []):
            if comment.get("commentType") == "DISEASE":
                disease_info = comment.get("disease", {})
                if disease_info.get("diseaseId"):
                    diseases.append({
                        "name": disease_info.get("diseaseId", ""),
                        "description": disease_info.get("description", ""),
                        "acronym": disease_info.get("acronym", ""),
                    })

        # Extract function
        function_text = ""
        for comment in entry.get("comments", []):
            if comment.get("commentType") == "FUNCTION":
                texts = comment.get("texts", [])
                if texts:
                    function_text = texts[0].get("value", "")

        return {
            "accession": accession,
            "gene": gene_name,
            "diseases": diseases,
            "function": function_text,
        }
    except Exception:
        return {}


async def _fetch_drug_nodes(client: httpx.AsyncClient, drugs: list[dict]) -> list[dict]:
    """Convert drug list into graph nodes with PubChem data."""
    drug_nodes = []
    for drug in (drugs or [])[:6]:
        name = drug.get("name", "")
        if not name:
            continue
        cid = drug.get("cid", "")
        drug_nodes.append({
            "id": f"drug:{_slug(name)}",
            "label": name,
            "type": "drug",
            "data": {
                "cid": cid,
                "molecular_weight": drug.get("molecular_weight", ""),
                "formula": drug.get("formula", ""),
                "iupac_name": drug.get("iupac_name", ""),
                "reasoning": drug.get("reasoning", ""),
                "pubchem_url": drug.get("pubchem_url", ""),
            },
        })
    return drug_nodes


async def _fetch_opentargets_diseases(client: httpx.AsyncClient, protein_name: str) -> list[dict]:
    """Query Open Targets Platform for disease associations."""
    # First search for the target
    search_query = """
    query SearchTarget($q: String!) {
      search(queryString: $q, entityNames: ["target"], page: {size: 1, index: 0}) {
        hits {
          id
          name
          entity
        }
      }
    }
    """
    try:
        r = await client.post(
            OPENTARGETS_BASE,
            json={"query": search_query, "variables": {"q": protein_name}},
        )
        if r.status_code != 200:
            return []
        search_data = r.json()
        hits = search_data.get("data", {}).get("search", {}).get("hits", [])
        if not hits:
            return []

        target_id = hits[0]["id"]

        # Now get disease associations
        assoc_query = """
        query AssociatedDiseases($id: String!) {
          target(ensemblId: $id) {
            associatedDiseases(page: {size: 8, index: 0}) {
              rows {
                disease {
                  id
                  name
                  therapeuticAreas {
                    id
                    name
                  }
                }
                score
              }
            }
          }
        }
        """
        r2 = await client.post(
            OPENTARGETS_BASE,
            json={"query": assoc_query, "variables": {"id": target_id}},
        )
        if r2.status_code != 200:
            return []

        assoc_data = r2.json()
        rows = (
            assoc_data.get("data", {})
            .get("target", {})
            .get("associatedDiseases", {})
            .get("rows", [])
        )

        diseases = []
        for row in rows:
            d = row.get("disease", {})
            areas = [a.get("name", "") for a in d.get("therapeuticAreas", [])]
            diseases.append({
                "name": d.get("name", "Unknown"),
                "disease_id": d.get("id", ""),
                "score": row.get("score", 0),
                "therapeutic_areas": areas[:3],
            })
        return diseases
    except Exception:
        return []


async def _llm_graph_summary(protein_name: str, nodes: list, edges: list) -> str:
    """Use LLM to create a readable summary of the knowledge graph."""
    node_summary = {}
    for n in nodes:
        t = n["type"]
        node_summary.setdefault(t, []).append(n["label"])

    edge_types = {}
    for e in edges:
        edge_types.setdefault(e["label"], 0)
        edge_types[e["label"]] += 1

    prompt = f"""Summarize this protein knowledge graph in 2-3 sentences for a researcher:
Protein: {protein_name}
Nodes by type: {json.dumps(node_summary)}
Relationship counts: {json.dumps(edge_types)}
Total nodes: {len(nodes)}, Total edges: {len(edges)}

Be concise and scientific."""

    return await _gemini_text(
        system="You are a bioinformatics expert. Summarize knowledge graphs concisely.",
        prompt=prompt,
        max_output_tokens=200,
    )


# ═══════════════════════════════════════════════════════════════
# Utilities
# ═══════════════════════════════════════════════════════════════

def _clean_name(name: str) -> str:
    """Clean protein name for display."""
    if not name or name.lower() == "unknown":
        return "Protein"
    return name.strip().title()[:50]


def _slug(text: str) -> str:
    """Create a URL-safe slug."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower().strip())[:40]
