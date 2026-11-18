# FitWork

**Live:** https://fitwork-zain2026.web.app  (API: https://fitwork-api-zain2026.onrender.com/api/docs)

**Final Year Project.** Team: Muhammad Zain (261934604), Basharat Ahmad, Qasim Younas.
FYP advisor: Mam Samia Asloob Qureshi. Code report: [CODE_REPORT.md](CODE_REPORT.md) (also as
[Word](FitWork_Code_Report.docx) / [PDF](FitWork_Code_Report.pdf)). Test results: [TEST_RESULTS.md](TEST_RESULTS.md).

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

## Load job data (first time)
```powershell
cd backend
.\.venv\Scripts\python.exe -m app.scripts.load_jobs ..\data\jobs_seed.csv   # 494 real Freelancer.com listings
.\.venv\Scripts\python.exe -m app.scripts.fetch_jobs --pages 3             # newest live jobs
.\.venv\Scripts\python.exe -m app.scripts.make_admin you@example.com      # optional: admin can trigger ingestion
```
While the API runs, the scheduler fetches new Freelancer.com jobs every 30 minutes (`SCHEDULER_ENABLED=false` turns it off).

## Tests
```powershell
cd backend; .\.venv\Scripts\python.exe -m pytest -v
```
Tests use the separate `fitwork_test` database and Redis DB 15, so your dev data is never touched.
Results and measured numbers are in [TEST_RESULTS.md](TEST_RESULTS.md).

## Useful scripts (run from /backend)
| Command | Purpose |
|---|---|
| `python -m app.scripts.benchmark_matches --runs 30` | `/matches` response time (server must be running) |
| `python -m app.scripts.cosine_distribution` | Real cosine distribution behind the Match Score calibration |
| `python -m app.scripts.export_freelancer_snapshot ..\data\jobs_seed.csv` | Rebuild the seed CSV from real listings |

## Load test (Locust)
```powershell
cd backend; .\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt; cd ..
$env:LOAD_MODE="cached"   # or "uncached"
backend\.venv\Scripts\locust.exe -f loadtest\locustfile.py --host http://localhost:8000 --headless -u 50 -r 10 -t 60s
backend\.venv\Scripts\python.exe loadtest\cleanup.py   # remove load-test users
```

## Features
- **Auth:** JWT access token (24 h, in memory) + refresh token (7 d, httpOnly cookie), bcrypt cost 12, email verification link (printed in dev), login rate limit.
- **Profile wizard:** 4 steps, skill autocomplete (300+ skills), embedding with all-MiniLM-L6-v2.
- **Jobs:** Freelancer.com public API (every 30 min), real seed CSV, manual paste (private).
- **Matching:** pgvector cosine top-50 → Match Score = 70 % semantic + 15 % budget fit + 15 % recency, with reasons.
- **Proposals:** Gemini or OpenAI (env vars), honest template fallback, 20/day.
- **Agency Mode:** invites, routing to the best member, approve/override, decline → re-route, win-rate chart.
- **Skill Gap Radar:** measures how many extra jobs each missing skill would unlock.

## Project layout
```
backend/   FastAPI app (app/core, app/models, app/schemas, app/routers, app/services) + tests + Alembic
frontend/  React app (src/pages, src/components, src/lib)
data/      CSV seed datasets + SOURCES.md
docker/    database init script
```
