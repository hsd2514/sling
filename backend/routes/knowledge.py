"""Knowledge Graph route — builds protein→drug→disease relationship graph."""

import json

import aiosqlite
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.knowledge_graph import build_knowledge_graph

router = APIRouter()
DB_PATH = "data/sessions.db"


class KnowledgeGraphRequest(BaseModel):
    session_id: str


@router.post("/knowledge-graph")
async def get_knowledge_graph(req: KnowledgeGraphRequest):
    """Build a knowledge graph for the protein in the given session."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT parsed_data, pockets, drugs FROM protein_sessions WHERE id = ?",
            (req.session_id,),
        ) as cursor:
            row = await cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")

    parsed = json.loads(row[0]) if row[0] else {}
    pockets = json.loads(row[1]) if row[1] else []
    drugs = json.loads(row[2]) if row[2] else []

    graph = await build_knowledge_graph(parsed, pockets, drugs, req.session_id)
    return {"session_id": req.session_id, **graph}
