import os
from contextlib import asynccontextmanager

import aiosqlite
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import chat, compare, dataset, drug, knowledge, report, upload

load_dotenv()

DB_PATH = "data/sessions.db"


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs("uploads", exist_ok=True)
    os.makedirs("data", exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS protein_sessions (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                parsed_data TEXT,
                pockets TEXT,
                drugs TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        await db.commit()
    yield


app = FastAPI(title="Drug Discovery Copilot API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api")
app.include_router(drug.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(report.router, prefix="/api")
app.include_router(knowledge.router, prefix="/api")
app.include_router(compare.router, prefix="/api")
app.include_router(dataset.router, prefix="/api")


@app.get("/")
async def root():
    return {"status": "ok", "message": "Drug Discovery Copilot API"}
