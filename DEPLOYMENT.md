# FitWork in production (free tiers, always on)

| Part | Service | Address / notes |
|---|---|---|
| Website | **Firebase Hosting** (Spark, free) | **https://fitwork-zain2026.web.app** |
| Backend (API, AI model, scheduler) | **Render** free web service (Docker image, Frankfurt) | https://fitwork-api-zain2026.onrender.com (API docs: `/api/docs`) |
| Database | **Neon** Postgres 16 + pgvector (free, Frankfurt) | real Freelancer.com jobs |
| Container image | **GitHub Container Registry** (private) | `ghcr.io/zainatif90/fitwork:latest`, built by GitHub Actions on every push |
| Cache / rate limits | built-in in-memory store (`REDIS_URL=memory`) | the free plan runs exactly one instance |

## How it stays online 24/7 at $0
- Render's free plan sleeps after 15 minutes without visitors. The app visits its own `/api/health`
  every 10 minutes (`KEEPALIVE_URL`), so it never sleeps. One always-on service uses ≤ 744 of the
  750 free instance hours per month.
- New Freelancer.com jobs are fetched every 30 minutes by the app's scheduler; live jobs older than 72 h are hidden.
- Memory fits the free 512 MB: embeddings run in small batches with one ONNX thread and memory is returned
  to the OS after each run (worst case measured: 329 MB peak under a 512 MB limit).
- The Render workspace has a card on file only because Render requires one to create services.
  Only free resources exist (checked with the Render API: 1 web service, plan `free`; no paid database or Redis).

## Website ↔ API on different domains
The website (Firebase) calls the API (Render) directly (`VITE_API_BASE`). The API allows exactly the Firebase
origins (CORS with credentials). The refresh cookie is `HttpOnly; Secure; SameSite=None; Partitioned` so the
browser keeps it only for the FitWork website (`COOKIE_SAMESITE=none`, `COOKIE_PARTITIONED=true`).
The website's Content-Security-Policy only allows connections to its own API (`firebase.json`).

## Deploying changes
1. `git push` → GitHub Actions builds `ghcr.io/zainatif90/fitwork:latest` (workflow `Build image`).
2. Trigger a Render deploy (dashboard → Manual Deploy, or `POST /v1/services/<id>/deploys` with the Render API key).
3. Website changes: build with the API address and deploy to Firebase:
   ```powershell
   cd frontend; $env:VITE_API_BASE="https://fitwork-api-zain2026.onrender.com/api"; npm run build; cd ..
   $env:GOOGLE_CLOUD_QUOTA_PROJECT="fitwork-zain2026"; firebase deploy --only hosting --project fitwork-zain2026
   ```
Migrations run automatically on every backend start (`alembic upgrade head`).

## Production settings (Render environment; secrets are never in git)
`ENV=production`, `DATABASE_URL` (Neon), `JWT_SECRET`, `CRON_SECRET`, `REDIS_URL=memory`, `SCHEDULER_ENABLED=true`,
`KEEPALIVE_URL`, `BOOTSTRAP_DATA=true`, `FRONTEND_URL=https://fitwork-zain2026.web.app`, `CORS_ORIGINS`,
`COOKIE_SAMESITE=none`, `COOKIE_PARTITIONED=true`, `LLM_PROVIDER=gemini`, `LLM_MODEL`, `LLM_API_KEY`
(`none` until a Gemini key is added), optional `SMTP_*` for real emails.

## Optional upgrades (free)
- **Real AI proposals:** create a key at https://aistudio.google.com/apikey and set `LLM_API_KEY` on Render.
- **Real emails:** Gmail App Password (https://myaccount.google.com/apppasswords) → set `SMTP_HOST=smtp.gmail.com`,
  `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASSWORD` on Render. Until then verification/reset links are written to the log.

## Local production test
```powershell
docker build -f backend/Dockerfile -t fitwork:prod .
docker run -m 512m -p 8001:8000 -e ENV=production -e JWT_SECRET=<random> -e DATABASE_URL=postgresql://... -e REDIS_URL=memory fitwork:prod
```
