# FitWork — Code Report

| Item | Details |
|---|---|
| Project | FitWork: NLP-based freelance job matching platform |
| Student(s) / Roll no. | _fill in_ |
| Supervisor | _fill in_ |
| Repository | https://github.com/zainatif90/fitwork |
| Live website | https://fitwork-zain2026.web.app |
| Live API docs | https://fitwork-api-zain2026.onrender.com/api/docs |
| Date | 19 November 2026 |

---

## 1. Introduction

FitWork collects freelance job listings from public sources and matches them to a freelancer's skill
profile using sentence embeddings. Instead of scrolling through hundreds of listings, the user sees the
**top 5 jobs** with an explainable **Match Score (0–100)**, the reason for the score, and which skills
matched or are missing.

Main features (each maps to a use case in the SRS):

| Feature | What it does |
|---|---|
| Authentication | Register, email verification, login, password reset, multi-device sessions |
| Profile wizard | 4-step profile (title, skills, experience, rate) turned into a 384-dimension embedding |
| Job ingestion | Freelancer.com public API every 30 min, Himalayas / Remotive / Jobicy job boards, a real seed CSV, and manual paste |
| Matching (UC-3) | pgvector nearest-neighbour search + Match Score with a human-readable reason |
| AI Proposal Assistant (UC-6) | Drafts a proposal with an LLM (Gemini or OpenAI), with a template fallback |
| Agency Mode (UC-4) | Agency owner invites members; each job is routed to the best-fitting team member |
| Skill Gap Radar (UC-5) | Shows which missing skill from the user's own field would unlock the most jobs |
| Team Chat (extra) | Agency channel, job threads and direct messages; calls via a Jitsi Meet link |

---

## 2. Technology stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, React Router, Recharts | Typed components, fast dev server, charts for stats |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2 | Automatic validation and OpenAPI docs; versioned DB migrations |
| Database | PostgreSQL 16 + pgvector (HNSW index) | Vector similarity search inside the database |
| Cache | Redis 7 (in-memory store in production) | Match / skill-gap caching, rate limits, scheduler lock |
| NLP model | all-MiniLM-L6-v2 via fastembed (ONNX, CPU) | 384-dim embeddings, small enough for a 512 MB free server |
| LLM | Gemini or OpenAI, chosen by `LLM_PROVIDER` | Used only for proposal drafts |
| Auth | JWT (access 24 h, refresh 7 d), bcrypt cost 12 | Standard, stateless access tokens + server-side sessions |
| Testing | pytest, Playwright (E2E), Locust (load) | Unit/integration, browser walk-through, concurrency |
| Deployment | Firebase Hosting, Render (Docker image from GitHub Actions), Neon Postgres | Runs 24/7 on free tiers |

---

## 3. System architecture

```
 Browser (React SPA, Firebase Hosting)
        |  HTTPS, JSON, Authorization: Bearer <access token>
        |  httpOnly refresh cookie (path /api/auth)
        v
 FastAPI backend (Render, 1 uvicorn worker)
   routers/   -> validate input (Pydantic), check auth/role
   services/  -> business logic (matching, scoring, routing, skill gap, proposals, chat)
   scheduler  -> fetches new jobs every 30 min (APScheduler + lock)
        |                     |                         |
        v                     v                         v
 PostgreSQL 16 + pgvector   Redis / in-memory      External APIs
 (users, profiles, jobs,    (cache, rate limits,   Freelancer.com, Himalayas,
  embeddings, agencies...)   scheduler lock)       Remotive, Jobicy, Gemini/OpenAI
```

**Request flow for "show my matches":**
1. The React dashboard calls `GET /api/matches` with the access token.
2. The router checks the token and loads the user's profile embedding.
3. If a cached result exists in Redis (10 min), it is returned immediately.
4. Otherwise pgvector returns the 50 nearest active jobs, `scoring.py` scores each one,
   and the top 5 are returned with reasons, matched skills and missing skills.

---

## 4. Repository structure

```
backend/
  app/
    main.py          FastAPI app: routers, CORS, security headers, error handler, scheduler start
    core/            config (all weights and limits), database, security (JWT, bcrypt), rate limits
    models/          SQLAlchemy tables (users, profiles, jobs, agencies, chat, ...)
    schemas/         Pydantic request/response models
    routers/         HTTP endpoints, one file per feature
    services/        business logic (see section 7)
      sources/       job sources: freelancer.py, job_boards.py, csv_source.py
    scripts/         command-line tools (load jobs, fetch jobs, benchmarks, make admin)
  alembic/versions/  10 database migrations (0001_users ... 0010_agency_audit_fixes)
  tests/             20 pytest files
frontend/
  src/pages/         14 pages (Landing, Login, Register, Onboarding, Dashboard, JobDetail,
                     SkillGap, Agency, TeamChat, Settings, VerifyEmail, ForgotPassword, ...)
  src/components/    shared UI (job cards, score rings, skill input, agency tabs, ...)
  src/lib/           API client, auth context, types, formatting helpers
data/                jobs_seed.csv (494 real Freelancer.com listings) + SOURCES.md
e2e/                 Playwright browser walk-through
loadtest/            Locust load-test scripts
docker-compose.yml   local Postgres (pgvector) + Redis
.github/workflows/   builds the backend Docker image for deployment
```

Size of the code (tracked source files, measured with `wc -l`):

| Part | Lines |
|---|---|
| Backend application (`backend/app`) | 5,653 |
| Frontend (`frontend/src`, .ts/.tsx/.css) | 6,218 |
| Backend tests (`backend/tests`) | 2,575 |

---

## 5. Database design

12 tables, created by Alembic migrations.

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Accounts | email (unique), full_name, password_hash (bcrypt), role (freelancer / agency_owner / agency_member), is_verified, is_admin |
| `auth_sessions` | One row per logged-in device | user_id, refresh_jti, previous_jti (rotation), expires_at, revoked_at |
| `profiles` | Freelancer profile | skills, experience_level, hourly_rate, bio, portfolio_urls, **embedding vector(384)**, embedding_status |
| `skills` | Skill dictionary for autocomplete (300+) | name, category |
| `jobs` | All job listings | source, external_id (unique per source), title, description, skills, budget, posted_at, is_active, **embedding vector(384)** with HNSW index |
| `match_feedback` | User feedback on a match | outcome (applied / won / lost / not_relevant), score_at_feedback — stored for a future trained model |
| `proposals` | Generated proposal drafts | user_id, job_id, tone, length, content, is_fallback, provider, model |
| `agencies` | Agency created by an owner | owner_id, name |
| `agency_members` | Membership and invites | agency_id, user_id, email, status, invite_token_hash, invite_sent_at, joined_at |
| `assignments` | Job routed to a member | job_id, member_id, status (assigned → applied → won/lost), score, assigned_by |
| `chat_messages` | Team chat | agency_id, channel, sender_id, kind (text / call), body |
| `chat_reads` | Unread counts | user_id, channel, last_read_at |

---

## 6. API endpoints

All routes are under `/api`. Interactive documentation is generated automatically at `/api/docs`.
Every route except register / login / refresh / verify / password reset / health requires a valid
access token.

| Router | Endpoints |
|---|---|
| `/auth` (9) | register, login, refresh, logout, me, verify, resend-verification, forgot-password, reset-password |
| `/profile` (2) | GET / PUT `/me` |
| `/skills` (1) | GET autocomplete |
| `/jobs` (2) | GET `/{job_id}`, POST `/manual` (paste a job) |
| `/matches` (2) | GET top 5 matches, POST `/{job_id}/feedback` |
| `/proposals` (3) | POST `/generate`, GET history, GET `/quota` |
| `/skill-gap` (1) | GET analysis |
| `/agency` (18) | start, me, invite, accept invite, remove member, leave, close, routing, assign, take back, reassign, assignments, member stats, queue, decline, status |
| `/agency/chat` (5) | channels, unread, list messages, send message, start call |
| `/admin` (2) | run ingestion, job stats (admin only) |
| `/health` | Health check with a database check |

---

## 7. Core algorithms

### 7.1 Embeddings — `services/embeddings.py`
The profile text (title + skills + experience) and each job text (title + description + skills) are
turned into a 384-number vector by **all-MiniLM-L6-v2**, run through fastembed (ONNX, CPU only, no
PyTorch). Every vector is **L2-normalized**, so cosine similarity equals the dot product. The model is
loaded once and reused.

### 7.2 Match Score — `services/scoring.py`, `services/matching.py`

```
score    = 100 * (W_SEM * semantic + fit_gate * (W_BUDGET * budget_fit + W_RECENCY * recency))
fit_gate = min(1, semantic / 0.6)
weights  : W_SEM = 0.70, W_BUDGET = 0.15, W_RECENCY = 0.15   (app/core/config.py)
```

- **semantic**: raw MiniLM cosine is usually 0.15–0.65, so it is clipped to [0.15, 0.65] and scaled to
  0–1. The bounds come from measuring the real cosine distribution on our job data
  (`python -m app.scripts.cosine_distribution`).
- **budget_fit**: hourly jobs score 1.0 when the user's rate is inside the budget range and fall to 0
  at 50 % outside it. Fixed-price jobs estimate hours = budget / rate and score 1.0 for 5–200 hours.
  Unknown budget or rate gives a neutral 0.5.
- **recency**: live jobs score 1.0 when fresh and fall linearly to 0 at expiry (72 h for Freelancer.com,
  21 days for job boards). Seed-CSV jobs get 0 so they never beat a live job; manual jobs get 0.5.
- **fit_gate**: budget and recency only count fully when the job actually fits the profile. Without it,
  a brand-new job from another field scored 54–58 only because of budget and recency.
- Each result includes a short reason, the matched skills and the missing skills.

This is a **Match Score, not a win probability**: there is no labelled won/lost data to train on.
User feedback (applied / won / lost / not relevant) is stored for a future trained model.

### 7.3 Agency routing — `services/routing.py`
1. Candidate jobs = union of each active member's top 20 nearest jobs (the owner is included when they
   have a profile).
2. Every member is scored on every candidate job with the same scoring code as solo matching.
3. The job is recommended to the member with the highest score. If the best score is below 50, the
   job is flagged **Low Team Fit** with the skills nobody in the team has.
4. Jobs already assigned are skipped; a member who declined a job is never recommended it again, so a
   decline re-routes the job to the next best member.

Status flow: `assigned → applied → won / lost` (Applied cannot be skipped).

### 7.4 Skill Gap Radar — `services/skill_gap.py`
1. **Your field** = the 200 active jobs most similar to the profile that also share at least one of
   the user's skills (reposts counted once).
2. **Candidates** = the 15 skills those jobs ask for most that the user does not have.
3. **Impact**: for each candidate the profile is re-embedded *with* that skill and every job is
   re-scored. A job counts as "unlocked" only if it asks for the skill, is in the user's field, and
   now reaches a score of 60 or more but did not before.
4. The top 5 gaps are returned with sample jobs; results are cached for 1 hour.

### 7.5 Proposal generation — `services/proposals.py`, `services/llm.py`
A prompt is built from the job and the user's **real** profile, with rules: no invented experience,
only real skills, end with a question to the client. If the LLM fails or takes longer than 30 s, a
filled-in template is returned and clearly marked as a fallback. Limit: 20 AI drafts per day.

### 7.6 Job ingestion — `services/ingestion.py`, `services/sources/`, `services/scheduler.py`
Each source converts its data into one common job format (budgets converted to USD). Jobs are
de-duplicated by `(source, external_id)` and embedded in small batches to stay within 512 MB of memory.
The scheduler runs every 30 minutes and holds a lock so a fetch never runs twice at the same time.
Freshness: Freelancer.com jobs expire 72 h after posting, job-board jobs after 21 days; CSV and
manual jobs never expire.

---

## 8. Frontend

- **Routing:** React Router with protected routes; logged-in users with no profile are sent to the
  onboarding wizard.
- **Auth handling:** the access token is kept in memory only. On page load the app calls
  `/api/auth/refresh` (using the httpOnly cookie) to get a new access token; if that fails, the user
  is logged out. Unverified users see a "verify your email" banner.
- **Main pages:** Dashboard (top 5 matches with score rings), Job Detail (score breakdown, proposal
  generator, feedback), Skill Gap (3D "skill skyline" chart + gap list), Agency (Routing, Pipeline,
  Team and Performance tabs), Team Chat, Settings.
- **Responsive:** checked at 7 widths from 320 px to 1920 px; chart pages are lazy-loaded to keep the
  main bundle small.

---

## 9. Security

| Area | Implementation |
|---|---|
| Passwords | bcrypt cost 12; 72-byte limit checked; dummy hash check so login timing does not reveal registered emails |
| Tokens | Access JWT in memory only; refresh token in an httpOnly, Secure, SameSite cookie scoped to `/api/auth` |
| Sessions | Server-side sessions; logout ends that device; password reset ends all; refresh tokens rotate with reuse detection |
| Input validation | Pydantic on every route; SQLAlchemy bound parameters (no SQL injection) |
| Authorization | Auth on every protected route; role checks for agency owner / member / admin |
| Rate limits | Failed logins 5/min per IP+email and 10/15 min per email, reset emails 3/hour, sign-ups 10/hour/IP, AI proposals 20/day, invites 10/day, chat 30/min |
| Client IP | From CF-Connecting-IP or the **last** X-Forwarded-For entry (the first can be faked) |
| Headers | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS in production |
| Errors | Stack traces are logged on the server only; users get a generic message |
| Secrets | Only in `.env` (not tracked by git); `.env.example` documents every variable |

---

## 10. Testing

Full details and all measured numbers: `TEST_RESULTS.md`.

### 10.1 SRS test cases (`backend/tests/test_srs_cases.py`)

| ID | Test case | Result |
|---|---|---|
| TC-1 | Registration (201, bcrypt cost-12 hash) | PASS |
| TC-2 | Duplicate email (409, no second user) | PASS |
| TC-3 | Ranked matches (5 sorted results with reasons) | PASS |
| TC-4 | Skill gap (owned skills never suggested) | PASS |
| TC-5 | Proposal generation (LLM mocked) | PASS |
| TC-6 | Agency routing (Python job → Python member) | PASS |
| TC-7 | Performance: `/matches` on 500+ jobs, p95 < 1000 ms | PASS (p50 15.6 ms, p95 23.0 ms) |
| TC-8 | SQL injection on login | PASS (401 for every payload) |

### 10.2 Other testing

| Type | Result |
|---|---|
| Automated test suite (pytest, separate `fitwork_test` database) | **245 passed, 0 failed** (re-run on 18 Nov 2026, 5 min 17 s) |
| Security tests | All protected endpoints return 401 without a token; no stack traces leak |
| `/matches` on 1,486 real jobs | p50 64 ms uncached, 4.7 ms cached |
| Load test (Locust, 50 concurrent users, 60 s) | 0 failures; p95 23 ms (cached), 91 ms (uncached) |
| End-to-end browser walk-through (Playwright) | 11 / 11 steps, 0 JavaScript errors (local and live site) |
| Bugs found and fixed | Listed with cause and fix in TEST_RESULTS.md sections 7, 7b |

---

## 11. Deployment

| Part | Service |
|---|---|
| Website | Firebase Hosting — https://fitwork-zain2026.web.app |
| API | Render free web service, running a Docker image built by GitHub Actions |
| Database | Neon PostgreSQL 16 with pgvector |
| Cache | In-memory store (`REDIS_URL=memory`) |
| Email | Verification, reset and invite emails sent through a mailer (console output in development) |

A keep-alive ping stops the free server from sleeping. Full steps are in `DEPLOYMENT.md`.

---

## 12. How to run locally

Requirements: Node.js 20+, Python 3.11, Docker Desktop, Git.

```powershell
Copy-Item .env.example .env          # then set JWT_SECRET to a long random string
docker compose up -d                 # Postgres (pgvector) + Redis

cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m app.scripts.load_jobs ..\data\jobs_seed.csv
.\.venv\Scripts\uvicorn.exe app.main:app --port 8000

# second terminal
cd frontend; npm install; npm run dev     # open http://localhost:5173

# tests
cd backend; .\.venv\Scripts\python.exe -m pytest -v
```

---

## 13. Data honesty

- Jobs are real: live Freelancer.com listings, public job boards, and a 494-row snapshot of real
  Freelancer.com listings (`data/SOURCES.md` documents how each was collected).
- Synthetic jobs are used **only** in load/performance tests, stored as `source = synthetic`, and
  labelled as synthetic in TEST_RESULTS.md.
- LinkedIn, Fiverr and Upwork are not used: they have no public job API (or access was not approved)
  and scraping breaks their terms.

---

## 14. Limitations and future work

- Match Score weights (0.70 / 0.15 / 0.15) are heuristic, not learned. Stored won/lost feedback can
  train a real model later.
- Win-rate charts stay empty until members record real outcomes; no outcomes are invented.
- Team Chat uses polling (about 4 s delay), not WebSockets.
- The free cloud server is slower than a laptop and needs a few seconds after a restart.
- Future work: Upwork integration when API access is approved, a trained ranking model from feedback,
  push notifications.
