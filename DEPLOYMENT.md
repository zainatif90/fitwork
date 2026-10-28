# Deploying FitWork (free tiers)

| Part | Service | Notes |
|---|---|---|
| Database | **Neon** (Postgres 16 + pgvector) | free, never expires; migrations run automatically on API start |
| Cache | **Render Key Value** (Redis-compatible) | created by the same blueprint, internal-only |
| API | **Render** free web service (Docker) | `render.yaml` blueprint; measured RAM 226–286 MiB < 512 MiB |
| Web app | **Vercel** | serves the React build, proxies `/api/*` to Render (same origin → login cookie works) |
| LLM | Google **Gemini** API key | optional — without it proposals use the labelled template |

Fixed addresses (already written into the config files):
- Web app: **https://fitwork-zain2026.vercel.app**
- API: **https://fitwork-api-zain2026.onrender.com** (health: `/api/health`, docs: `/api/docs`)

On its **first start** the API sets itself up: runs the database migrations, loads the 494 real seed jobs,
creates the demo accounts (DEMO.md), and the scheduler starts fetching live Freelancer.com jobs every 30 minutes.
(Tested locally against an empty database: 494 jobs + 4 demo accounts, restart-safe.)

---
## Your steps (about 10 minutes, all "Sign in with GitHub")

### 1. GitHub login for the push
Claude shows an 8-character code → open https://github.com/login/device → enter the code → **Authorize**.
Claude then creates the **private** repo `fitwork` and pushes the code.

### 2. Neon (database)
1. https://console.neon.tech/signup → **Continue with GitHub**.
2. Create project: name `fitwork`, Postgres **16**, region **AWS Europe Central 1 (Frankfurt)** → **Create**.
3. **Connect** → copy the connection string (starts with `postgresql://`, keep it for step 3).

### 3. Render (API + Redis)
1. https://dashboard.render.com/register → **GitHub**.
2. **New +** → **Blueprint** → connect GitHub → select the `fitwork` repo → **Connect**.
3. Render shows two resources (`fitwork-redis`, `fitwork-api-zain2026`) and asks for 2 values:
   - `DATABASE_URL` → paste the Neon string exactly as copied
   - `LLM_API_KEY` → your Gemini key from https://aistudio.google.com/apikey (or type `none`)
4. **Apply**. The first build takes ~5–10 minutes. Done when the service shows **Live**.

### 4. Vercel (web app)
1. https://vercel.com/signup → **Continue with GitHub**.
2. **Add New… → Project** → **Import** `fitwork`.
3. **Project Name:** `fitwork-zain2026` (this gives the fixed address above).
4. **Root Directory:** click *Edit* → choose `frontend`. Framework is detected as **Vite**.
5. **Deploy** (~1 minute).

Tell Claude "done" — Claude runs the full end-to-end test against the live site.

---
## If something differs
- **Render gave a different URL** (name taken): tell Claude the URL; it updates `frontend/vercel.json` and pushes.
- **Vercel gave a different URL:** in Render → `fitwork-api-zain2026` → Environment, set `FRONTEND_URL` and
  `CORS_ORIGINS` to it (only used in the email-verification link; invite links use the browser's own address).
- **Gemini key added later:** Render → Environment → `LLM_API_KEY` → Save (redeploys automatically).

## Free-tier notes (say these honestly in the viva)
- Render free **sleeps after 15 minutes without traffic**; the next request takes ~1 minute (cold start) and the
  30-minute job fetch pauses while asleep. Optional: a free monitor at https://cron-job.org calling
  `https://fitwork-api-zain2026.onrender.com/api/health` every 10 minutes keeps it awake.
- Render free has a fraction of one CPU, so live response times are slower than the laptop numbers in TEST_RESULTS.md.
  The first-start embedding of the 494 seed jobs takes a few minutes there.
- Neon free pauses the database when idle; the first query after a pause adds 1–2 seconds.

## Updating later
`git push` → Render and Vercel redeploy automatically; migrations run on every API start.

## Local production test (what was verified)
```powershell
docker build -f backend/Dockerfile -t fitwork-api:local .
docker run -p 8001:8000 -e ENV=production -e JWT_SECRET=<random> -e DATABASE_URL=postgresql://... -e BOOTSTRAP_DATA=true -e DEMO_PASSWORD=<pw> fitwork-api:local
```
