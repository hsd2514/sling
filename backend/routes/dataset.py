"""Dataset Builder route — store, list, and export protein analysis datasets."""

import csv
import io
import json
from datetime import datetime

import aiosqlite
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter()
DB_PATH = "data/sessions.db"

# ── Ensure dataset table exists ──
INIT_SQL = """
CREATE TABLE IF NOT EXISTS dataset_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    protein_name TEXT,
    organism TEXT,
    filename TEXT,
    chains INTEGER DEFAULT 0,
    residues INTEGER DEFAULT 0,
    atoms INTEGER DEFAULT 0,
    resolution REAL,
    pocket_count INTEGER DEFAULT 0,
    top_pocket_score REAL DEFAULT 0,
    top_pocket_volume REAL DEFAULT 0,
    drug_count INTEGER DEFAULT 0,
    drug_names TEXT,
    ligand_names TEXT,
    notes TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    pockets_json TEXT,
    drugs_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id)
)
"""


async def _ensure_table():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(INIT_SQL)
        await db.commit()


class DatasetAddRequest(BaseModel):
    session_id: str
    notes: str = ""
    tags: list[str] = Field(default_factory=list)


class DatasetUpdateRequest(BaseModel):
    entry_id: int
    notes: str | None = None
    tags: list[str] | None = None


@router.post("/dataset/add")
async def add_to_dataset(req: DatasetAddRequest):
    """Add a session's analysis to the dataset."""
    await _ensure_table()

    # Load session data
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT filename, parsed_data, pockets, drugs FROM protein_sessions WHERE id = ?",
            (req.session_id,),
        ) as cursor:
            row = await cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")

    filename = row[0]
    parsed = json.loads(row[1]) if row[1] else {}
    pockets = json.loads(row[2]) if row[2] else []
    drugs = json.loads(row[3]) if row[3] else []

    # Compute summary fields
    top_pocket = max(pockets, key=lambda p: float(p.get("druggability_score", 0)), default={})
    drug_names = ", ".join(d.get("name", "") for d in drugs if d.get("name"))
    ligand_names = ", ".join(l.get("name", "") for l in parsed.get("ligands", []))
    tags_str = ",".join(req.tags) if req.tags else ""

    async with aiosqlite.connect(DB_PATH) as db:
        try:
            await db.execute(
                """INSERT INTO dataset_entries
                (session_id, protein_name, organism, filename, chains, residues, atoms,
                 resolution, pocket_count, top_pocket_score, top_pocket_volume,
                 drug_count, drug_names, ligand_names, notes, tags, pockets_json, drugs_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    req.session_id,
                    parsed.get("name", "Unknown"),
                    parsed.get("organism", ""),
                    filename,
                    len(parsed.get("chains", [])),
                    parsed.get("total_residues", 0),
                    parsed.get("total_atoms", 0),
                    parsed.get("resolution"),
                    len(pockets),
                    float(top_pocket.get("druggability_score", 0)),
                    float(top_pocket.get("volume", 0)),
                    len(drugs),
                    drug_names,
                    ligand_names,
                    req.notes,
                    tags_str,
                    json.dumps(pockets),
                    json.dumps(drugs),
                ),
            )
            await db.commit()
        except aiosqlite.IntegrityError:
            raise HTTPException(status_code=409, detail="Session already in dataset.")

    return {"status": "added", "session_id": req.session_id}


@router.put("/dataset/update")
async def update_entry(req: DatasetUpdateRequest):
    """Update notes or tags on a dataset entry."""
    await _ensure_table()

    updates = []
    params = []
    if req.notes is not None:
        updates.append("notes = ?")
        params.append(req.notes)
    if req.tags is not None:
        updates.append("tags = ?")
        params.append(",".join(req.tags))

    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update.")

    params.append(req.entry_id)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            f"UPDATE dataset_entries SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        await db.commit()

    return {"status": "updated", "entry_id": req.entry_id}


@router.delete("/dataset/{entry_id}")
async def remove_from_dataset(entry_id: int):
    """Remove an entry from the dataset."""
    await _ensure_table()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM dataset_entries WHERE id = ?", (entry_id,))
        await db.commit()
    return {"status": "removed", "entry_id": entry_id}


@router.get("/dataset")
async def list_dataset():
    """List all dataset entries."""
    await _ensure_table()
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            """SELECT id, session_id, protein_name, organism, filename, chains, residues,
                      atoms, resolution, pocket_count, top_pocket_score, top_pocket_volume,
                      drug_count, drug_names, ligand_names, notes, tags, created_at
               FROM dataset_entries ORDER BY created_at DESC"""
        ) as cursor:
            rows = await cursor.fetchall()

    entries = []
    for r in rows:
        entries.append({
            "id": r[0],
            "session_id": r[1],
            "protein_name": r[2],
            "organism": r[3],
            "filename": r[4],
            "chains": r[5],
            "residues": r[6],
            "atoms": r[7],
            "resolution": r[8],
            "pocket_count": r[9],
            "top_pocket_score": r[10],
            "top_pocket_volume": r[11],
            "drug_count": r[12],
            "drug_names": r[13],
            "ligand_names": r[14],
            "notes": r[15],
            "tags": r[16].split(",") if r[16] else [],
            "created_at": r[17],
        })

    return {"entries": entries, "count": len(entries)}


@router.get("/dataset/export/{fmt}")
async def export_dataset(fmt: str):
    """Export the dataset as CSV or JSON."""
    await _ensure_table()

    if fmt not in ("csv", "json"):
        raise HTTPException(status_code=400, detail="Format must be 'csv' or 'json'.")

    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            """SELECT id, session_id, protein_name, organism, filename, chains, residues,
                      atoms, resolution, pocket_count, top_pocket_score, top_pocket_volume,
                      drug_count, drug_names, ligand_names, notes, tags, created_at,
                      pockets_json, drugs_json
               FROM dataset_entries ORDER BY created_at DESC"""
        ) as cursor:
            rows = await cursor.fetchall()

    columns = [
        "id", "session_id", "protein_name", "organism", "filename", "chains",
        "residues", "atoms", "resolution", "pocket_count", "top_pocket_score",
        "top_pocket_volume", "drug_count", "drug_names", "ligand_names",
        "notes", "tags", "created_at", "pockets_json", "drugs_json",
    ]

    if fmt == "json":
        entries = [dict(zip(columns, r)) for r in rows]
        content = json.dumps(entries, indent=2)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=drug_discovery_dataset.json"},
        )

    # CSV export
    output = io.StringIO()
    writer = csv.writer(output)
    # Simplified columns (no raw JSON in CSV)
    csv_columns = columns[:18]
    writer.writerow(csv_columns)
    for r in rows:
        writer.writerow(r[:18])

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=drug_discovery_dataset.csv"},
    )
