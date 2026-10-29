# Deploying FitWork (100% free, no card)

| Part | Service | Notes |
|---|---|---|
| Website + API | **Hugging Face Docker Space** (free CPU: 2 vCPU, 16 GB RAM) | one container (`backend/Dockerfile`) serves the React app and FastAPI from the same address |
| Database | **Neon** Postgres 16 + pgvector, Frankfurt (free) | migrations run automatically on every start |
| Cache / rate limits | built-in in-memory store (`REDIS_URL=memory`) | the Space runs exactly one instance |
| Emails | **Gmail SMTP** with an App Password (free, ~500/day) | verification, password reset, agency invites |
| AI proposals | **Gemini** API key (free tier, no card) | without it, proposals use the labelled template |

Live address: **https://zain369-fitwork.hf.space** (Space page: https://huggingface.co/spaces/Zain369/fitwork)

## How to deploy / redeploy
```powershell
$env:HF_TOKEN="hf_..."            # Hugging Face -> Settings -> Access Tokens (Write)
$env:NEON_URL="postgresql://..."  # Neon -> project -> Connect
# optional: $env:LLM_API_KEY="..."; $env:SMTP_USER="you@gmail.com"; $env:SMTP_PASSWORD="<16-char App Password>"
backend\.venv\Scripts\python.exe deploy\huggingface_deploy.py
```
The script uploads only the files the build needs (from the last git commit, so no `.env` or local secrets),
stores passwords/keys in the Space's encrypted secret store, sets the other settings, and waits until the Space
is RUNNING (first build ~10–15 minutes).

## What happens on start
1. `alembic upgrade head` (database schema)
2. NLP model loads (baked into the image, no download)
3. If the seed jobs are missing, `data/jobs_seed.csv` is loaded (`BOOTSTRAP_DATA=true`)
4. The scheduler fetches live Freelancer.com jobs every 30 minutes and hides live jobs older than 72 hours

## Free-tier notes (say these honestly in the viva)
- A free Space **sleeps after 48 hours without visitors**; the next visit wakes it (about 1–2 minutes).
  While asleep the 30-minute job fetch pauses; it resumes on wake-up.
- The Space's source files are public (the code has no secrets; all secrets are in the encrypted store).
- Neon free pauses the database when idle; the first query after a pause adds 1–2 seconds.

## Adding real emails later (Gmail)
1. Turn on 2-Step Verification on the Gmail account → https://myaccount.google.com/apppasswords → create an App Password named FitWork.
2. Redeploy with `SMTP_USER` and `SMTP_PASSWORD` set (see above). No code change needed.

## Adding real AI proposals later (Gemini)
https://aistudio.google.com/apikey → Create API key → redeploy with `LLM_API_KEY` set.

## Local production test
```powershell
docker build -f backend/Dockerfile -t fitwork:local .
docker run -p 8001:8000 -e ENV=production -e JWT_SECRET=<random> -e DATABASE_URL=postgresql://... -e REDIS_URL=memory fitwork:local
# open http://localhost:8001
```
