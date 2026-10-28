# Deploying FitWork (free tiers)

| Part | Service | Why |
|---|---|---|
| Database | **Neon** (Postgres 16 + pgvector) | free, supports `CREATE EXTENSION vector` |
| Cache | **Upstash Redis** | free, works over TLS (`rediss://`) |
| API | **Render** (Docker, free web service) | builds `backend/Dockerfile`; measured RAM 286 MiB < 512 MiB limit |
| Web app | **Vercel** | serves the React build and proxies `/api/*` to Render (same origin → cookies work) |
| LLM | Google **Gemini** API key | proposals (optional: without it users get the template draft) |

Architecture: `browser → https://<app>.vercel.app` → (Vercel rewrite `/api/*`) → `https://<api>.onrender.com/api/*` → Neon + Upstash.

---
## A. Things only you can do (accounts) — about 15 minutes
Use the same email for all; "Sign up with GitHub" is fastest where offered.

### A1. GitHub
1. https://github.com/signup (skip if you have an account).
2. Nothing else — Claude creates a **private** repository and pushes the code after you approve it.

### A2. Neon (database)
1. https://neon.tech → **Sign up**.
2. **Create project** → name `fitwork`, Postgres version **16**, region closest to Render's (e.g. *AWS Europe Central (Frankfurt)*).
3. On the project dashboard click **Connect** → choose **Connection string** → copy it.
   It looks like `postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
4. Give that string to Claude (see "How to send secrets" below).

### A3. Upstash (Redis)
1. https://console.upstash.com → **Sign up**.
2. **Create Database** → name `fitwork`, type **Regional**, region **eu-central-1 (Frankfurt)**, TLS **on**.
3. In the database page, under **Connect**, copy the **`rediss://...`** URL (Redis protocol, not REST).

### A4. Gemini API key (for AI proposals)
1. https://aistudio.google.com/apikey → **Create API key** → copy it.

### How to send secrets to Claude
Create the file `deploy.env` in the project folder (it is git-ignored) with:
```
NEON_URL=postgresql://...
UPSTASH_URL=rediss://...
GEMINI_KEY=...
```
Then tell Claude "deploy.env ready". Claude reads it locally; it is never committed.

---
## B. Claude does (from your PC, no clicks needed)
1. Runs Alembic migrations on Neon (enables pgvector, creates all tables).
2. Loads the 494-job seed CSV and fetches live Freelancer.com jobs into Neon (embeddings computed locally).
3. Creates the demo accounts in Neon and rewrites `DEMO.md` with the production password.
4. Tests the Upstash connection and the Gemini key.
5. Creates the private GitHub repo and pushes (you approve a one-time GitHub login in the browser).

---
## C. Render (API) — you click, ~5 minutes
1. https://dashboard.render.com → **Sign up with GitHub** → allow access to the `fitwork` repo.
2. **New +** → **Blueprint** → pick the `fitwork` repo → Render reads `render.yaml`.
3. It asks for the secret values — paste:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon string, but starting with **`postgresql+psycopg://`** instead of `postgresql://` (Claude gives you the exact line) |
   | `REDIS_URL` | the Upstash `rediss://...` URL |
   | `FRONTEND_URL` | leave `https://example.com` for now — updated in step E |
   | `CORS_ORIGINS` | same as FRONTEND_URL |
   | `LLM_API_KEY` | the Gemini key |
4. **Apply**. The first build takes ~5–8 minutes. When it shows **Live**, copy the URL (`https://fitwork-api-xxxx.onrender.com`) and send it to Claude.

## D. Claude does
Puts the Render URL into `frontend/vercel.json`, pushes, and checks `https://…onrender.com/api/health`.

## E. Vercel (web app) — you click, ~3 minutes
1. https://vercel.com/signup → **Continue with GitHub**.
2. **Add New… → Project** → import `fitwork`.
3. **Root Directory** → `frontend`. Framework preset: **Vite** (auto). Leave build settings as they are.
4. **Deploy**. Copy the URL (`https://fitwork-xxxx.vercel.app`) and send it to Claude.
5. Back in Render → `fitwork-api` → **Environment** → set `FRONTEND_URL` and `CORS_ORIGINS` to the Vercel URL → **Save** (Render redeploys).
   (This is used for verification and invite links in emails.)

## F. Claude does
Runs the full end-to-end walk-through against the live site and reports any problem.

---
## Free-tier notes (say these honestly in the viva)
- **Render free sleeps after 15 minutes without traffic.** The first request after that takes ~1 minute (cold start),
  and the 30-minute job fetch does not run while asleep. Optional fix: a free monitor at https://cron-job.org calling
  `https://<api>.onrender.com/api/health` every 10 minutes keeps it awake (750 free hours/month covers one service).
- Free-tier hardware is slower than the laptop used for TEST_RESULTS.md; re-measure on the live site if you quote numbers.
- Neon free pauses compute when idle; first query after a pause adds a second or two.

## Updating the live site later
`git push` → Render and Vercel redeploy automatically. Migrations run on every API start (`alembic upgrade head`).
