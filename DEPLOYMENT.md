# Deploying FitWork (free tiers)

| Part | Service | Notes |
|---|---|---|
| Database | **Neon** (Postgres 16 + pgvector, Frankfurt) | free, never expires; already created and loaded (989 real jobs + demo accounts) |
| Cache | **Render Key Value** (Redis-compatible) | created by the blueprint, internal-only |
| Website + API | **Render** free web service (Docker) | ONE container serves the React app and the API from the same address |
| LLM | Google **Gemini** API key | optional — without it proposals use the labelled template |

Live address (already written into the config): **https://fitwork-api-zain2026.onrender.com**
(website at `/`, API at `/api`, API docs at `/api/docs`)

Why one container instead of Vercel + Render: the website and the API share one origin, so the login cookie
works without a proxy, there is one deploy instead of two, and nothing else to configure. Locally the Vite dev
server still serves the website (`npm run dev`); in production `backend/Dockerfile` builds the React app in a
first stage and FastAPI serves the built files (`FRONTEND_DIST`). Verified before deploying: the Playwright
walk-through passed 11/11 with 0 JavaScript errors against the production container.

On every start the API runs the database migrations; with `BOOTSTRAP_DATA=true` it also loads the seed jobs and
demo accounts if they are missing (they are already in Neon, so this is a safety net). The scheduler then fetches
live Freelancer.com jobs every 30 minutes.

---
## Status
- [x] GitHub: private repo github.com/zainatif90/fitwork (pushed)
- [x] Neon: project `fitwork` (PG 16, Frankfurt) created, migrated, 989 jobs + 4 demo accounts loaded
- [ ] Render: blueprint (you, ~2 minutes of clicks, then a 5–10 minute build)

## Render steps (you)
1. https://dashboard.render.com/register → **GitHub**.
2. **New +** → **Blueprint** → connect GitHub (allow the `fitwork` repo) → select **fitwork** → **Connect**.
3. Render shows `fitwork-redis` and `fitwork-api-zain2026` and asks for 2 values:
   - `DATABASE_URL` → paste the Neon connection string (Claude puts it on your clipboard)
   - `LLM_API_KEY` → a Gemini key from https://aistudio.google.com/apikey, or `none`
4. **Apply**. When the service shows **Live**, tell Claude "done" — Claude tests the live site end to end.

## If something differs
- **Render gave a different URL** (name taken): in Render → Environment set `FRONTEND_URL` and `CORS_ORIGINS` to it
  (only used in the email-verification link; invite links use the browser's own address).
- **Gemini key added later:** Render → Environment → `LLM_API_KEY` → Save (redeploys automatically).

## Free-tier notes (say these honestly in the viva)
- Render free **sleeps after 15 minutes without traffic**; the next request takes ~1 minute (cold start) and the
  30-minute job fetch pauses while asleep. Optional: a free monitor at https://cron-job.org calling
  `https://fitwork-api-zain2026.onrender.com/api/health` every 10 minutes keeps it awake.
- Render free has a fraction of one CPU, so live response times are slower than the laptop numbers in TEST_RESULTS.md.
  The first-start embedding of the 494 seed jobs takes a few minutes there.
- Neon free pauses the database when idle; the first query after a pause adds 1–2 seconds.

## Updating later
`git push` → Render rebuilds and redeploys automatically; migrations run on every start.

## Local production test (what was verified)
```powershell
docker build -f backend/Dockerfile -t fitwork:local .
docker run -p 8001:8000 -e ENV=production -e JWT_SECRET=<random> -e DATABASE_URL=postgresql://... -e BOOTSTRAP_DATA=true -e DEMO_PASSWORD=<pw> fitwork:local
# open http://localhost:8001  (website + API)
```
