# Data sources

FitWork never presents invented data as real. This file records where every dataset came from.

## 1. `jobs_seed.csv` — snapshot of real Freelancer.com listings
- **What:** 495 real, publicly listed active projects from Freelancer.com (494 unique after de-duplication).
- **How:** fetched on **28 October 2026** with the official public Projects API
  (`GET https://www.freelancer.com/api/projects/0.1/projects/active/`) by
  `backend/app/scripts/export_freelancer_snapshot.py`, offsets 1200–1700 (older listings, so the seed
  does not overlap with what the live fetch pulls in).
- **Processing:** budgets converted to USD using the `exchange_rate` that Freelancer.com returns for each
  currency; skill tags taken from the project's `jobs` list. Nothing else was changed.
- **Why a snapshot:** live jobs are hidden after 72 hours. The seed gives the demo a stable dataset that
  never expires (`csv` jobs are exempt from expiry, see CLAUDE.md).
- **Use:** academic, non-commercial final-year project. Each row keeps the `url` of the original listing.

Reload or rebuild it:
```powershell
cd backend
.\.venv\Scripts\python.exe -m app.scripts.export_freelancer_snapshot ..\data\jobs_seed.csv --count 500 --offset 1200
.\.venv\Scripts\python.exe -m app.scripts.load_jobs ..\data\jobs_seed.csv
```

## 2. Live Freelancer.com jobs
Fetched every 30 minutes by the scheduler (`app/services/scheduler.py`), or on demand with
`python -m app.scripts.fetch_jobs --pages N` / `POST /api/admin/ingest/run`. Stored with `source = freelancer`
and marked inactive 72 hours after posting.

## 3. Manual paste
Users can paste any job they found themselves (`POST /api/jobs/manual`). These are private to that user.

## CSV column format (for adding your own dataset)
| Column | Required | Example |
|---|---|---|
| external_id | yes (unique in file) | `fl-40791566` |
| title | yes | `Build a React dashboard` |
| description | yes | full job text |
| skills | no | `React;Tailwind CSS;Node.js` (semicolon separated) |
| budget_min / budget_max | no | `250` / `750` (USD) |
| budget_type | yes | `fixed` or `hourly` |
| currency | no | `USD` |
| client_country | no | `United Kingdom` |
| proposals_count | no | `14` |
| posted_at | yes | `2026-10-28T09:15:00Z` (ISO 8601) |
| url | no | link to the original listing |

If you add a public dataset (e.g. from Kaggle), convert it to these columns, keep its licence, and add a
section here naming the dataset, its URL, its licence and the date you downloaded it.

## Not used
- **LinkedIn, Fiverr:** no public job-listing API; scraping is against their terms of service → Future Work.
- **Upwork:** requires approved API access; only added if approval arrives.
- **Synthetic jobs:** only ever used for load testing, stored with `source = synthetic`, and labelled as such in
  TEST_RESULTS.md.
