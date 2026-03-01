<p align="center">
  <img src="https://img.shields.io/badge/🧬-Drug_Discovery_Copilot-blue?style=for-the-badge&labelColor=0f172a" alt="Drug Discovery Copilot" />
</p>

<h1 align="center">Agentic Drug Discovery Copilot</h1>

<p align="center">
  <em>Upload a protein. Detect pockets. Discover drugs. All in one tab.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-7.3-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/FastAPI-0.133-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/BioPython-1.86-green?style=flat-square" alt="BioPython" />
  <img src="https://img.shields.io/badge/fpocket-4.x-orange?style=flat-square" alt="fpocket" />
  <img src="https://img.shields.io/badge/3Dmol.js-WebGL-red?style=flat-square" alt="3Dmol.js" />
  <img src="https://img.shields.io/badge/Google_Gemini-LLM-4285F4?style=flat-square&logo=google&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/ReportLab-PDF-yellow?style=flat-square" alt="ReportLab" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/AMD_Compatible-No_CUDA-ED1C24?style=flat-square&logo=amd&logoColor=white" alt="AMD Compatible" />
  <img src="https://img.shields.io/badge/Features-27-blueviolet?style=flat-square" alt="27 Features" />
  <img src="https://img.shields.io/badge/API_Endpoints-16-informational?style=flat-square" alt="16 Endpoints" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT" />
</p>

---

## What It Does

A browser-based AI-powered drug discovery platform. A researcher uploads a `.pdb` protein structure file and the system handles the full early-stage pipeline automatically:

```
Upload .pdb → Parse Protein → Detect Pockets → Suggest Drugs → Knowledge Graph → AI Chat → PDF Report
```

No installations. No switching between tools. One browser tab, full pipeline.

---

## Quick Start

### Prerequisites

- **Python 3.12+** with [uv](https://docs.astral.sh/uv/)
- **Node.js 18+**
- **fpocket** (optional — mock fallback available)
- **Gemini API key** from [Google AI Studio](https://aistudio.google.com/)

### Backend

```bash
cd backend
cp .env.example .env          # add GEMINI_API_KEY
uv sync                       # install deps
uv run uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

---

## Features — 27 Total

### 🧬 Core Pipeline

| #   | Feature                                                                                          | Tech                   |
| --- | ------------------------------------------------------------------------------------------------ | ---------------------- |
| 1   | **PDB Upload & Parsing** — extracts name, organism, resolution, chains, residues, atoms, ligands | BioPython              |
| 2   | **Binding Pocket Detection** — 6 configurable parameters (alpha-sphere radius, clustering, etc.) | fpocket CLI            |
| 3   | **Pocket Data Import** — load pre-computed results from `.json` / `.txt` / `.info`               | Custom parser          |
| 4   | **AI Drug Suggestion** — real compounds from PubChem, LLM reasons about binding affinity         | PubChem + Gemini       |
| 5   | **AI Chat Copilot** — conversational assistant with full session context                         | Gemini                 |
| 6   | **Knowledge Graph** — interactive force-directed protein → drug → disease graph                  | UniProt + Open Targets |
| 7   | **PDF Report Export** — one-click downloadable report with all analysis results                  | ReportLab              |

### 🔬 3D Protein Viewer

| #   | Feature                                                         |
| --- | --------------------------------------------------------------- |
| 8   | Interactive WebGL viewer — rotation, zoom, pan                  |
| 9   | Representation toggles — Cartoon, Sticks, Surface, Ligands      |
| 10  | Three visual themes — Clinical, Heatmap, Publication            |
| 11  | Per-pocket visibility toggle                                    |
| 12  | Per-pocket color customization                                  |
| 13  | Per-pocket opacity slider                                       |
| 14  | Pocket sorting (score/volume/id) & filtering (min druggability) |
| 15  | Pocket comparison — select 2 to compare                         |
| 16  | Session management — SQLite-backed history                      |
| 17  | Crystal ligand display with chain/residue info                  |

### ✨ Novel Features

| #   | Feature                                                            |
| --- | ------------------------------------------------------------------ |
| 18  | **Screenshot Export** — save 3D viewer as PNG                      |
| 19  | **Atom Distance Measurement** — click two atoms, get distance in Å |
| 20  | **Pocket Tour** — automated camera fly-through of all pockets      |
| 21  | **Pocket Radar Chart** — spider chart comparing pocket properties  |
| 22  | **Slab Clipping** — near/far clipping planes to slice the protein  |

### 🏗️ Platform

| #   | Feature                                                                   |
| --- | ------------------------------------------------------------------------- |
| 23  | **Protein Comparison Engine** — side-by-side structural comparison        |
| 24  | **Dataset Builder & Export** — save sessions, export CSV/JSON             |
| 25  | **Adaptive Dual Layout** — wide/narrow panels based on content            |
| 26  | **WASM Pocket Runner** — browser-based pocket detection, no server needed |
| 27  | **Design System** — 3 OKLCH themes via CSS custom properties              |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Browser)                    │
│  React 19  ·  Vite 7.3  ·  Tailwind CSS v4             │
│  3Dmol.js (WebGL)  ·  Axios  ·  Canvas graphs          │
│  Pages: Upload │ Viewer │ Compare │ Dataset             │
└────────────────────────┬────────────────────────────────┘
                         │ REST API (JSON)
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  BACKEND (FastAPI)                       │
│  Python 3.12  ·  Uvicorn  ·  uv                        │
│                                                         │
│  Services:                                              │
│    protein_parser (BioPython)  ·  pocket_engine (fpocket)│
│    drug_engine (PubChem+LLM)  ·  llm_agent (Gemini)    │
│    knowledge_graph  ·  comparison_engine  ·  report_gen │
│                                                         │
│  Storage: SQLite (sessions.db)  ·  uploads/ (.pdb)      │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / GraphQL
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │ PubChem  │   │ UniProt  │   │  Open    │
   │ REST API │   │ REST API │   │ Targets  │
   └──────────┘   └──────────┘   └──────────┘
```

---

## API Endpoints

| Method   | Path                           | Description                                 |
| -------- | ------------------------------ | ------------------------------------------- |
| `POST`   | `/api/upload`                  | Upload `.pdb` file, parse protein structure |
| `POST`   | `/api/analyze`                 | Run fpocket pocket detection                |
| `POST`   | `/api/pockets/import`          | Import pockets from external files          |
| `GET`    | `/api/pockets/{sid}/{pid}/pdb` | Download pocket PDB                         |
| `POST`   | `/api/drugs`                   | Get AI drug suggestions for a pocket        |
| `POST`   | `/api/chat`                    | AI chat with session context                |
| `POST`   | `/api/report`                  | Generate PDF report                         |
| `POST`   | `/api/knowledge-graph`         | Build protein-drug-disease graph            |
| `POST`   | `/api/compare`                 | Compare two protein structures              |
| `GET`    | `/api/sessions`                | List all sessions                           |
| `GET`    | `/api/sessions/{id}`           | Load a session                              |
| `POST`   | `/api/dataset/add`             | Save to dataset                             |
| `GET`    | `/api/dataset`                 | List dataset entries                        |
| `PUT`    | `/api/dataset/update`          | Update dataset entry                        |
| `DELETE` | `/api/dataset/{id}`            | Delete dataset entry                        |
| `GET`    | `/api/dataset/export/{format}` | Export as CSV or JSON                       |

---

## Tech Stack

| Layer       | Technology         | Purpose                               |
| ----------- | ------------------ | ------------------------------------- |
| ⚛️ UI       | React 19           | Component-based UI with hooks         |
| ⚡ Build    | Vite 7.3           | Fast dev server, HMR                  |
| 🎨 Styling  | Tailwind CSS v4    | Utility CSS, OKLCH themes             |
| 🔬 3D       | 3Dmol.js           | WebGL molecular visualization         |
| 📡 HTTP     | Axios              | REST API client                       |
| 🚀 Server   | FastAPI            | Async Python web framework            |
| 🐍 Runtime  | Python 3.12        | Backend language                      |
| 📦 Packages | uv                 | Fast Python dependency management     |
| 🧬 Parsing  | BioPython          | `.pdb` file parsing and analysis      |
| 🕳️ Pockets  | fpocket            | Voronoi-based binding site prediction |
| 📄 PDF      | ReportLab          | Programmatic PDF generation           |
| 🗄️ Database | SQLite + aiosqlite | Async session and dataset storage     |
| 🤖 AI       | Google Gemini      | LLM reasoning and chat                |

---

## Environment Variables

Create `backend/.env`:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
FPOCKET_USE_DOCKER_FALLBACK=true
FPOCKET_DOCKER_IMAGE=fpocket/fpocket
FPOCKET_TIMEOUT_SECONDS=120
```

---

## Project Structure

```
├── backend/
│   ├── main.py                 # FastAPI app + DB init
│   ├── routes/
│   │   ├── upload.py           # /upload, /sessions
│   │   ├── drug.py             # /analyze, /drugs, /pockets
│   │   ├── chat.py             # /chat
│   │   └── report.py           # /report
│   ├── services/
│   │   ├── protein_parser.py   # BioPython PDB parser
│   │   ├── pocket_engine.py    # fpocket runner + parser
│   │   ├── drug_engine.py      # PubChem + LLM drug ranking
│   │   ├── llm_agent.py        # Gemini integration
│   │   ├── knowledge_graph.py  # UniProt + Open Targets
│   │   ├── comparison_engine.py# Protein comparison
│   │   └── report_generator.py # ReportLab PDF
│   ├── data/sessions.db        # SQLite database
│   ├── uploads/                # Uploaded .pdb files
│   └── pyproject.toml
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── UploadPage.jsx
│   │   │   ├── ViewerPage.jsx
│   │   │   ├── ComparePage.jsx
│   │   │   └── DatasetPage.jsx
│   │   ├── components/
│   │   │   ├── ChatPanel.jsx
│   │   │   ├── KnowledgeGraph.jsx
│   │   │   ├── PocketList.jsx
│   │   │   ├── PocketRadar.jsx
│   │   │   ├── DrugPanel.jsx
│   │   │   └── WasmPocketRunner.jsx
│   │   ├── viewer/
│   │   │   └── ProteinViewer.jsx
│   │   ├── api/
│   │   │   ├── protein.js
│   │   │   ├── chat.js
│   │   │   └── report.js
│   │   ├── App.jsx
│   │   └── index.css
│   ├── index.html
│   └── package.json
│
└── PROJECT.md
```

---

## How It Works

```
📤 Upload .pdb          →  BioPython parses structure
🕳️ Detect Pockets       →  fpocket finds binding sites (6 tunable params)
💊 Suggest Drugs         →  PubChem for real compounds + Gemini ranks them
🕸️ Knowledge Graph       →  UniProt + Open Targets build relationship map
🤖 AI Chat               →  Gemini with full session context
📄 Export                 →  PDF report or CSV/JSON dataset
```

---

## AMD Compatibility

| Aspect    | Details                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| 🖥️ CPU    | All backend compute (BioPython parsing, fpocket Voronoi tessellation, API orchestration) runs on AMD processors |
| 🎮 GPU    | 3Dmol.js renders via WebGL — works natively on AMD Radeon GPUs                                                  |
| 🚫 CUDA   | Zero NVIDIA/CUDA dependency — fully AMD-compatible                                                              |
| 🔮 Future | Architecture supports local LLM via AMD ROCm                                                                    |

---

## Future Scope

- 🧠 **AlphaFold** — protein structure prediction from sequence
- ⚗️ **Molecular Docking** — computational binding affinity scoring
- 🏠 **Local LLM (ROCm)** — on-device AI, no cloud dependency
- 🧪 **De Novo Generation** — AI-designed novel compounds
- 💊 **ADMET Prediction** — pharmacokinetic viability filtering
- 👥 **Multi-User** — shared sessions for research teams
- 📚 **PubMed Search** — AI-summarized literature per target

---

<p align="center">
  Built for the AMD Hackathon 2025
</p>
# sling
