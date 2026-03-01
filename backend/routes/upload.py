import json
import uuid
import os

import aiosqlite
from fastapi import APIRouter, File, HTTPException, UploadFile

from services.protein_parser import parse_pdb

router = APIRouter()
DB_PATH = "data/sessions.db"
UPLOAD_DIR = "uploads"
MAX_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/upload")
async def upload_protein(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdb"):
        raise HTTPException(status_code=400, detail="Only .pdb files are accepted.")

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit.")

    session_id = str(uuid.uuid4())
    dest_path = f"{UPLOAD_DIR}/{session_id}.pdb"
    with open(dest_path, "wb") as f:
        f.write(contents)

    parsed = parse_pdb(dest_path)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO protein_sessions (id, filename, parsed_data) VALUES (?, ?, ?)",
            (session_id, file.filename, json.dumps(parsed)),
        )
        await db.commit()

    return {"session_id": session_id, "filename": file.filename, "parsed": parsed}


@router.get("/sessions")
async def list_sessions():
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            """
            SELECT id, filename, created_at, parsed_data, pockets, drugs
            FROM protein_sessions
            ORDER BY created_at DESC
            LIMIT 30
            """
        ) as cursor:
            rows = await cursor.fetchall()
    sessions = []
    for row in rows:
        parsed = json.loads(row[3]) if row[3] else {}
        pockets = json.loads(row[4]) if row[4] else []
        drugs = json.loads(row[5]) if row[5] else []
        sessions.append(
            {
                "session_id": row[0],
                "filename": row[1],
                "created_at": row[2],
                "protein_name": parsed.get("name"),
                "pocket_count": len(pockets),
                "drug_count": len(drugs),
            }
        )
    return {"sessions": sessions}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            """
            SELECT id, filename, parsed_data, pockets, drugs, created_at
            FROM protein_sessions
            WHERE id = ?
            """,
            (session_id,),
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")

    pdb_path = f"{UPLOAD_DIR}/{session_id}.pdb"
    pdb_text = None
    if os.path.exists(pdb_path):
        with open(pdb_path, encoding="utf-8", errors="ignore") as fh:
            pdb_text = fh.read()

    return {
        "session_id": row[0],
        "filename": row[1],
        "parsed": json.loads(row[2]) if row[2] else {},
        "pockets": json.loads(row[3]) if row[3] else [],
        "drugs": json.loads(row[4]) if row[4] else [],
        "created_at": row[5],
        "pdbText": pdb_text,
    }
