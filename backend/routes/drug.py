import json

import aiosqlite
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from services.drug_engine import fetch_drug_suggestions, fetch_drug_suggestions_for_pocket
from services.pocket_engine import detect_pockets, parse_imported_pockets, get_pocket_pdb_path

router = APIRouter()
DB_PATH = "data/sessions.db"


class AnalyzeRequest(BaseModel):
    session_id: str
    params: dict | None = None


class DrugRequest(BaseModel):
    session_id: str
    pocket_id: int | None = None


@router.post("/analyze")
async def analyze_protein(req: AnalyzeRequest):
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT parsed_data FROM protein_sessions WHERE id = ?", (req.session_id,)
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")

    pdb_path = f"uploads/{req.session_id}.pdb"
    try:
        pockets = detect_pockets(pdb_path, req.params)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE protein_sessions SET pockets = ? WHERE id = ?",
            (json.dumps(pockets), req.session_id),
        )
        await db.commit()

    return {"session_id": req.session_id, "pockets": pockets}


@router.get("/pockets/{session_id}/{pocket_id}/pdb")
async def download_pocket_pdb(session_id: str, pocket_id: int):
    """Download the raw PDB file for a specific pocket's atoms."""
    pocket_path = get_pocket_pdb_path(session_id, pocket_id)
    if not pocket_path:
        raise HTTPException(status_code=404, detail="Pocket PDB file not found.")
    return FileResponse(
        pocket_path,
        media_type="chemical/x-pdb",
        filename=f"pocket{pocket_id}_atm.pdb",
    )


@router.post("/drugs")
async def suggest_drugs(req: DrugRequest):
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT parsed_data, pockets FROM protein_sessions WHERE id = ?",
            (req.session_id,),
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")

    parsed = json.loads(row[0]) if row[0] else {}
    pockets = json.loads(row[1]) if row[1] else []

    if req.pocket_id is not None:
        try:
            drugs = await fetch_drug_suggestions_for_pocket(parsed, pockets, req.pocket_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    else:
        drugs = await fetch_drug_suggestions(parsed, pockets)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE protein_sessions SET drugs = ? WHERE id = ?",
            (json.dumps(drugs), req.session_id),
        )
        await db.commit()

    return {"session_id": req.session_id, "drugs": drugs}


@router.post("/pockets/import")
async def import_pockets(session_id: str = Form(...), file: UploadFile = File(...)):
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT id FROM protein_sessions WHERE id = ?", (session_id,)
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        pockets = parse_imported_pockets(file.filename or "pockets.txt", content)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE protein_sessions SET pockets = ? WHERE id = ?",
            (json.dumps(pockets), session_id),
        )
        await db.commit()

    return {"session_id": session_id, "pockets": pockets}
