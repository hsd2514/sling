"""Protein Comparison route — compares two protein sessions."""

import json

import aiosqlite
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.comparison_engine import compare_proteins

router = APIRouter()
DB_PATH = "data/sessions.db"


class CompareRequest(BaseModel):
    session_id_a: str
    session_id_b: str


async def _load_session(session_id: str) -> dict:
    """Load a session's full data from DB."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT filename, parsed_data, pockets, drugs FROM protein_sessions WHERE id = ?",
            (session_id,),
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")
    return {
        "filename": row[0],
        "parsed": json.loads(row[1]) if row[1] else {},
        "pockets": json.loads(row[2]) if row[2] else [],
        "drugs": json.loads(row[3]) if row[3] else [],
    }


@router.post("/compare")
async def compare(req: CompareRequest):
    """Compare two protein sessions."""
    session_a = await _load_session(req.session_id_a)
    session_b = await _load_session(req.session_id_b)

    result = await compare_proteins(session_a, session_b)
    return result
