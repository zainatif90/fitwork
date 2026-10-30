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

## 3. Remote job boards with open APIs (contract / freelance roles only)
| Board | Endpoint | Refresh | Their terms we follow |
|---|---|---|---|
| **Himalayas** | `https://himalayas.app/jobs/api/search?employment_type=Contractor` | every 2 h (100 newest) | credit Himalayas, link to the original posting |
| **Remotive** | `https://remotive.com/api/remote-jobs` (only `freelance`/`contract`) | every 6 h | credit Remotive, link back; few requests per day |
| **Jobicy** | `https://jobicy.com/api/v2/remote-jobs` (only `Contract`) | every 6 h | credit Jobicy, all "apply" links go to the original job URL |

Every job shows the board's name as its badge and "Open on platform" goes to the original posting.
Pay is converted to USD per hour only when the board states the period (hourly / yearly ÷ 2080 h / monthly);
non-USD or unclear salaries are left empty (neutral budget fit). These roles expire 21 days after posting.
Code: `backend/app/services/sources/job_boards.py`, checked 30 Oct 2026 (Himalayas listed 18,502 contractor jobs).

## 4. Manual paste
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

## Not used (checked 30 Oct 2026)
- **Upwork:** the public RSS feed is closed (HTTP 403) and the API needs an approved key (HTTP 401 without one);
  can be added when Upwork approves an API application.
- **Fiverr:** buyers browse sellers' gigs; buyer requests are only visible inside Fiverr and there is no public
  job API (scraping is against its terms).
- **LinkedIn, PeoplePerHour, Guru:** no public job-listing API; scraping is against their terms → Future Work.
  Users can still score any of these jobs with **Paste a job**.
- **Synthetic jobs:** only ever used for load testing, stored with `source = synthetic`, and labelled as such in
  TEST_RESULTS.md.
