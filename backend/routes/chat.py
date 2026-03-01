import json

import aiosqlite
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.llm_agent import chat_with_protein

router = APIRouter()
DB_PATH = "data/sessions.db"


class ChatRequest(BaseModel):
    session_id: str
    message: str
    history: list[dict] = Field(default_factory=list)


@router.post("/chat")
async def chat(req: ChatRequest):
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT parsed_data, pockets, drugs FROM protein_sessions WHERE id = ?",
            (req.session_id,),
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")

    context = {
        "parsed": json.loads(row[0]) if row[0] else {},
        "pockets": json.loads(row[1]) if row[1] else [],
        "drugs": json.loads(row[2]) if row[2] else [],
    }

    reply = await chat_with_protein(req.message, req.history, context)
    return {"reply": reply}
