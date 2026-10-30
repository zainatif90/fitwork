# FitWork - Final Year Project

## What it is
FitWork is a web platform that collects freelance job listings and matches them to a freelancer's skill profile using NLP embeddings. It shows the top 5 matched jobs with an explainable Match Score, generates AI proposal drafts, has an Agency Mode that routes jobs to the best team member, and a Skill Gap Radar that shows which skills would unlock more jobs.

## Deadline and priorities
- Final submission: 19 November 2026. A working demo matters more than extra features.
- Build order: auth -> profile -> jobs data -> matching -> proposals -> agency mode -> skill gap -> testing -> deploy.
- If behind schedule, cut polish (charts, extra UI) before cutting tests.
- Keep everything simple, readable, and well commented. The team must explain every part in a viva.

## Tech stack (must match the SRS)
- Frontend: React + Vite + TypeScript + Tailwind CSS + React Router + Recharts
- Backend: Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic migrations, Pydantic v2
- Database: PostgreSQL 16 with the pgvector extension
- Cache: Redis (match/skill-gap caching, rate limiting, scheduler lock)
- NLP: all-MiniLM-L6-v2 (384-dim, L2-normalized), run through **fastembed** (ONNX, CPU only).
  Decided from day one so the free-tier deploy fits in memory and we never have to re-embed.
- LLM: provider chosen by env var (`LLM_PROVIDER` = gemini | openai), used only for proposal generation
- Auth: JWT access token (24h) + refresh token (7d), bcrypt password hashing with cost 12
- Local dev: docker-compose for Postgres (pgvector/pgvector:pg16 image) and Redis 7
- Production (free tiers): website on Firebase Hosting (fitwork-zain2026.web.app), API on Render free web service
  from the private image ghcr.io/zainatif90/fitwork (built by GitHub Actions), Neon Postgres 16 + pgvector.
  REDIS_URL=memory, KEEPALIVE_URL keeps the free server awake. See DEPLOYMENT.md.

## Auth and token storage (decided)
- All backend routes are under the `/api` prefix.
- The frontend always calls the backend through the same origin `/api`:
  Vite dev proxy locally, Vercel rewrites in production. That avoids cross-site cookie problems.
- Access token: kept in memory only (JS variable), sent as `Authorization: Bearer`.
- Refresh token: httpOnly, Secure (in prod), SameSite=Lax cookie, path `/api/auth`.
- On page load the app calls `/api/auth/refresh` to get a new access token. If refresh fails -> logout.
- Unverified users can log in but see a "verify your email" banner.
- Real emails (verification, password reset, agency invites) go through SMTP (Gmail App Password in production);
  without SMTP settings they are printed to the console (development).
- No demo accounts in production: real users register themselves.

## Scope decisions (important)
- Job sources: Freelancer.com public API + CSV seed dataset + manual job paste. Upwork only if API access is approved.
  NO LinkedIn or Fiverr (no public job API; scraping violates their terms) -> Future Work.
- We show a "Match Score" (0-100), NOT a "win probability". There is no labeled won/lost training data.
  We store user feedback (applied/won/lost/not_relevant) for a future trained model.
- Never invent data and present it as real. Data plan:
  1. Real jobs from the Freelancer.com API (scheduler accumulates them over days).
  2. A cited public dataset (e.g. Kaggle freelance job postings) converted to our CSV format.
  3. Synthetic jobs ONLY for load testing, stored with source `synthetic`, and labeled synthetic in TEST_RESULTS.md.

## Job freshness rules (decided)
- `freelancer` / `upwork` jobs: marked inactive 72h after `posted_at`.
- `csv` and `manual` jobs never auto-expire (otherwise the seed dataset disappears).
- Recency for live sources: 1.0 under 6h old, linear down to 0 at 72h.
  Recency for `csv` / `manual` / `synthetic`: neutral 0.5 (their dates are not live).
- Skill gap demand = all active jobs (not "last 7 days").

## Match Score (decided)
- score = 100 * (W_SEM*semantic + W_BUDGET*budget_fit + W_RECENCY*recency); default weights 0.70 / 0.15 / 0.15.
  Weights are heuristic and live in one config place (`app/core/config.py`); document them as tunable.
- semantic: raw cosine from MiniLM is usually ~0.15-0.65, so we calibrate:
  clip cosine to [SEM_LOW=0.15, SEM_HIGH=0.65] and min-max scale to 0-1. Bounds are in config and justified by
  printing the real cosine distribution on our dataset.
- budget_fit:
  - hourly job: 1.0 if user rate is inside [budget_min, budget_max]; decays linearly to 0 at 50% outside the range.
  - fixed job: estimated_hours = budget_max / hourly_rate; 1.0 for 5-200 hours, decays outside that; 0 below 1 hour.
  - unknown budget or no hourly rate: neutral 0.5.
- Every score comes with a short human-readable reason + matched skills + missing skills.

## User roles (decided)
- freelancer (solo), agency_owner, agency_member.
- An agency owner can also have their own profile and personal matches.
- A freelancer who accepts an invite becomes agency_member. A member belongs to one agency only.
- Agency routing candidate jobs = union of each active member's top 20 matches.

## Folder structure
- /frontend - React app
- /backend - FastAPI app (app/main.py, app/models, app/schemas, app/routers, app/services, app/core, app/scripts)
- /backend/tests - pytest (uses a separate `fitwork_test` database, never the dev database)
- /data - CSV seed datasets (+ a SOURCES.md citing where data came from)
- /loadtest - Locust scripts
- docker-compose.yml, .env.example, README.md, PROGRESS.md, TEST_RESULTS.md, DEMO.md

## Runtime rules
- Run uvicorn with a single worker. The scheduler also takes a Redis lock so a fetch never runs twice.
- Rate limits use Redis: login 5/min per IP+email, proposals 20/day per user.
- Never return stack traces to users; log them server-side.

## Dev environment (Windows)
- Shell is Windows PowerShell 5.1: `&&` does not work. Use `;` e.g. `git add .; git commit -m "msg"`.
- Python venv at backend/.venv created with Python 3.11 (`py -3.11 -m venv .venv`).

## SRS test cases
TC-1..TC-8 (paste the exact table from the SRS here before Prompt 8). Current assumption:
TC-1 registration, TC-2 duplicate email, TC-3 ranked matches, TC-4 skill gap, TC-5 proposal generation (mocked LLM),
TC-6 agency routing, TC-7 performance, TC-8 SQL injection on login.

## Coding rules
- Never hardcode secrets. Use .env and keep .env.example updated.
- Use type hints in Python and TypeScript types in React.
- Every API route validates input with Pydantic and requires auth except register/login/refresh/verify.
- Write pytest tests for backend services.
- Never fake data or test results. Report failures honestly.
- After finishing any task: explain in simple English what was built, list changed files, give exact steps to run and test it,
  update PROGRESS.md, and commit.
