import json

import aiosqlite
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from services.report_generator import generate_pdf

router = APIRouter()
DB_PATH = "data/sessions.db"


class ReportRequest(BaseModel):
    session_id: str


@router.post("/report")
async def create_report(req: ReportRequest):
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT filename, parsed_data, pockets, drugs FROM protein_sessions WHERE id = ?",
            (req.session_id,),
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")

    data = {
        "filename": row[0],
        "parsed": json.loads(row[1]) if row[1] else {},
        "pockets": json.loads(row[2]) if row[2] else [],
        "drugs": json.loads(row[3]) if row[3] else [],
    }

    pdf_path = generate_pdf(req.session_id, data)
    return FileResponse(pdf_path, media_type="application/pdf", filename=f"report_{req.session_id}.pdf")
