# FitWork

FitWork collects freelance job listings and matches them to a freelancer's skill profile using NLP
embeddings. It shows the top 5 jobs with an explainable **Match Score**, drafts proposals with an LLM,
routes jobs to the best teammate in **Agency Mode**, and shows a **Skill Gap Radar**.

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS 4, React Router, Recharts |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2 |
| Database | PostgreSQL 16 + pgvector |
| Cache | Redis 7 |
| NLP | all-MiniLM-L6-v2 (384-dim) via fastembed (ONNX, CPU) |

## Prerequisites
Node.js 20+, Python 3.11, Docker Desktop (running), Git.

## First-time setup (Windows PowerShell)
```powershell
# 1. Environment file (then edit .env and set JWT_SECRET to a long random string)
Copy-Item .env.example .env
py -3.11 -c "import secrets; print(secrets.token_urlsafe(48))"   # paste the output into JWT_SECRET

# 2. Start Postgres (pgvector) and Redis
docker compose up -d

# 3. Backend
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\alembic.exe upgrade head
cd ..

# 4. Frontend
cd frontend
npm install
cd ..
```

## Run (two terminals)
```powershell
# Terminal 1 - API on http://localhost:8000  (docs at /api/docs)
cd backend; .\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000

# Terminal 2 - web app on http://localhost:5173
cd frontend; npm run dev
```
Open http://localhost:5173. In development the email verification link is printed in Terminal 1
(look for `[DEV EMAIL]`).

## Tests
```powershell
cd backend; .\.venv\Scripts\python.exe -m pytest -v
```
Tests use the separate `fitwork_test` database and Redis DB 15, so your dev data is never touched.

## Project layout
```
backend/   FastAPI app (app/core, app/models, app/schemas, app/routers, app/services) + tests + Alembic
frontend/  React app (src/pages, src/components, src/lib)
data/      CSV seed datasets + SOURCES.md
docker/    database init script
```
