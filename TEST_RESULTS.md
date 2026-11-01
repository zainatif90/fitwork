# FitWork — Test Results

All numbers below come from real runs on **28 October 2026**. Nothing is estimated or invented.
If a number changes in a later run, update this file from the new output.

## Test environment
| Item | Value |
|---|---|
| Machine | Windows 11 Pro laptop, Intel Core i7-11800H (8 cores / 16 threads), 15.8 GB RAM |
| Runtime | Python 3.11.9, FastAPI 0.162, uvicorn **1 worker**; Node 24 / Vite 6 |
| Database | PostgreSQL 16 + pgvector (Docker `pgvector/pgvector:pg16`), Redis 7 (Docker) |
| NLP model | all-MiniLM-L6-v2 via fastembed (ONNX, CPU), 384-dim |
| Job data | **1,486 active real jobs**: 992 live Freelancer.com + 494 Freelancer.com snapshot (seed CSV) — see `data/SOURCES.md` |

## 1. SRS test cases (TC-1 … TC-8)
Source: `backend/tests/test_srs_cases.py` (one test per case). Command: `pytest tests/test_srs_cases.py -v -s`.

| ID | Test case | Expected result | Actual result | Pass/Fail |
|---|---|---|---|---|
| TC-1 | Registration | 201, access token returned, password stored as bcrypt hash (cost 12) | 201, token returned, hash starts with `$2b$12$` | **PASS** |
| TC-2 | Duplicate email (different letter case) | 409 "Email is already registered", no second user | 409, still exactly 1 user in DB | **PASS** |
| TC-3 | Ranked matches | 5 matches, sorted by score (0–100), each with a reason; React profile → React job first | 5 sorted matches with reasons; "React analytics dashboard" ranked #1 | **PASS** |
| TC-4 | Skill gap | Demand counted per skill; owned skills never suggested; each gap unlocks ≥ 1 job, ≤ 3 samples | Shopify demand = 2, React coverage = 100, no owned skills suggested | **PASS** |
| TC-5 | Proposal generation (LLM mocked) | 200, draft returned, not a fallback | 200, `is_fallback = false`, draft saved | **PASS** |
| TC-6 | Agency routing | Python job → Python member, React job → React member | Django job → "Py Dev", React job → "React Dev" | **PASS** |
| TC-7 | Performance (`/matches`, 500+ jobs, uncached, 20 calls, in-process) | p95 < 1000 ms | 525 jobs: **p50 15.6 ms, p95 23.0 ms** | **PASS** |
| TC-8 | SQL injection on login | 401/422, no token, users table intact | 401 for all payloads, table intact (1 user) | **PASS** |

TC-7 uses 520 jobs labelled `source = synthetic` that exist **only in the test database** (the test database is wiped
after every test). The real-data performance numbers are in sections 3 and 4.

## 2. Full automated test suite
Command: `cd backend; .\.venv\Scripts\python.exe -m pytest -q` → **131 passed, 0 failed (37.2 s)**

| File | Tests | What it covers |
|---|---|---|
| test_auth.py | 15 | register, duplicate email, login, wrong password, refresh cookie, token types, verify email, login rate limit, SQL injection |
| test_profile.py | 14 | profile save/update, validation (7 invalid cases), embedding saved & normalized, "pending" fallback, skill autocomplete |
| test_embeddings.py | 5 | 384 dims, unit length, similar texts closer than unrelated |
| test_ingestion.py | 15 | Freelancer.com normalization + USD conversion, dedupe/upsert, 72 h expiry rules, CSV parsing, retries on 429, paging, manual paste, admin-only trigger |
| test_scoring.py | 12 | every part of the Match Score formula, aliases, reason text |
| test_matching.py | 8 | sorted top 5, 0–100, React > Python ranking, cache + invalidation, inactive/manual privacy, job detail, feedback |
| test_proposals.py | 6 | prompt contents and rules, LLM fallback, no-key fallback, 20/day limit, history privacy |
| test_agency.py | 9 | invites (single-use, email-bound), routing, Low Team Fit, decline re-routing, role checks, stats |
| test_skill_gap.py | 6 | demand counting, unlock calculation, endpoint, strong-coverage message |
| test_security.py | 33 | **every one of 28 protected endpoints returns 401 without a token**, no stack traces leak, CSP/no-store headers, CORS, malformed input |
| test_srs_cases.py | 8 | TC-1 … TC-8 above |

## 3. `/matches` response time on real data (single user, sequential)
Command: `python -m app.scripts.benchmark_matches --runs 30` (server running, 1,486 active jobs).

| Mode | p50 | p95 | max |
|---|---|---|---|
| Uncached (pgvector top-50 + scoring) | 64.0 ms | 69.0 ms | 88.2 ms |
| Cached (Redis) | 4.7 ms | 8.2 ms | 8.7 ms |

## 4. Load test — 50 concurrent users (Locust)
Command: `locust -f loadtest/locustfile.py --headless -u 50 -r 10 -t 60s` against one uvicorn worker, scheduler off,
1,486 active jobs. Each simulated user registers, saves a profile (6 different personas), then calls `GET /api/matches`
with 1–3 s think time.

| Scenario | Requests | Failures | Throughput | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|
| Normal use (cache allowed) | 1,396 | **0 (0 %)** | 23.5 req/s | **9 ms** | **23 ms** | 120 ms | 179 ms |
| Worst case (`?refresh=true`, every call recomputed) | 1,353 | **0 (0 %)** | 22.7 req/s | **67 ms** | **91 ms** | 120 ms | 384 ms |

Observation (honest): `POST /auth/register` took ~2.3 s per request while 10 users signed up at the same moment.
bcrypt with cost 12 is deliberately slow (~0.25 s CPU per hash), so simultaneous sign-ups queue up on one worker.
This is a security trade-off we keep; it only affects bursts of sign-ups, not normal use.

## 5. Other measured numbers
| Measurement | Result | Source |
|---|---|---|
| Live Freelancer.com fetch (10 pages) | 993 jobs fetched, 896 new, 97 updated, 2 expired, **48.3 s** (incl. embedding) | `python -m app.scripts.fetch_jobs --pages 10` |
| Seed CSV load | 495 rows → 494 new (1 duplicate merged), 15.2 s | `python -m app.scripts.load_jobs` |
| Skill Gap analysis (15 candidate skills × 1,486 jobs) | 219 ms | `compute_ms` in API response |
| Agency routing (3 members, real data) | 20 recommendations | live API check |
| Cosine calibration evidence | unrelated jobs ≈ 0.15–0.23 (median); top-50 candidates p95 = 0.62 → bounds 0.15 / 0.65 | `python -m app.scripts.cosine_distribution` |

## 5b. End-to-end UI walk-through (Playwright, real browser)
Script: `e2e/walkthrough.py` (headless Chromium against the dev servers, real data). It registers through the form,
completes the 4-step wizard by typing into the skill autocomplete, opens the dashboard, a job, generates a proposal,
opens Skill Gap and Settings, checks the mobile layout (390 px), then logs in as an agency owner (routing dashboard,
agency settings) and as a member (job queue).

| Run | Steps passed | JavaScript errors |
|---|---|---|
| 1 | 11 / 11 | 0 |
| 2 | 11 / 11 | 0 |
| 3 | 11 / 11 | 0 |
| 4 (after layout fixes) | 11 / 11 | 0 |

## 5c. Live production checks (30 October 2026)
Website https://fitwork-zain2026.web.app (Firebase Hosting) + API https://fitwork-api-zain2026.onrender.com
(Render free plan, 512 MB) + Neon database (1,610 active real jobs at the time of the test).

| Check | Result |
|---|---|
| Register from the website's origin (CORS with credentials) | 201; `access-control-allow-origin: https://fitwork-zain2026.web.app` |
| Refresh cookie attributes | `HttpOnly; Secure; SameSite=None; Partitioned; Path=/api/auth` |
| Stay logged in (`/auth/refresh` with the cookie) | 200 |
| `/api/matches` on the free server (uncached) | 5 matches, top score 91, computed in 398 ms |
| `/api/skill-gap` on the free server | 1,610 jobs analysed in 3.7 s |
| Scheduled Freelancer.com fetch on the free server | 298 fetched, no restart, 9.3 s |
| Full browser walk-through (Playwright) against the live website | **11 / 11 steps, 0 JavaScript errors** |
| Worst-case memory, reproduced locally with a 512 MB limit (494 + 298 jobs embedded) | peak 329 MB (was 511 MB → killed before the fix) |
| Real email from the live site (register → verification email via the Apps Script mailer) | server log "Email sent to …: Verify your FitWork email"; mailer refuses a wrong secret |
| Real AI proposal on the live site (Gemini `gemini-3.5-flash`, thinking minimal) | not a fallback; 171–178 words for "standard"; 3 s; portfolio link correct after the link fix |

Test accounts created by these checks were deleted afterwards.

## 6. Security checklist
| Check | Status | Evidence |
|---|---|---|
| Input validation on every route | Done | Pydantic models / typed params on all routes; 422 tests in test_profile, test_security |
| Auth on every protected route | Done | test_security: all 28 non-public endpoints → 401 without token |
| Role checks | Done | test_agency: members get 403 on assign/routing/stats/invite; solo users 403 |
| Login rate limit (5/min per IP+email) | Done | test_auth::test_login_rate_limit (6th attempt → 429) |
| Security headers | Done | nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, CSP `default-src 'none'`, Cache-Control no-store, HSTS in production |
| No secrets in repo | Done | `.env` not tracked; scan of tracked files found only the `.env.example` placeholder |
| No stack traces to users | Done | test_security: forced exception → generic 500 message, no traceback |
| SQL injection | Done | SQLAlchemy bound parameters; TC-8 |
| Password storage | Done | bcrypt cost 12; refresh token in httpOnly SameSite=Lax cookie; access token in memory only |
| Dependency audit | Done | `npm audit`: 0 vulnerabilities after upgrading react-router-dom 6 → 7.18.5 |
| API docs in production | Off by default | `ENABLE_API_DOCS=false` |

## 7. Bugs found and fixed during development
| # | Bug | How it was found | Fix |
|---|---|---|---|
| 1 | Freelancer.com fetch stopped after page 1 (API returned 98 < 100 items, treated as "last page") | Live run fetched 98 instead of ~300 jobs | Stop only on an empty page; regression test added |
| 2 | Scheduler's first run would be 5 h late (local time passed to a UTC scheduler) | Code review before first run | Use timezone-aware UTC time |
| 3 | pgvector HNSW returns at most 40 rows by default (`ef_search = 40`) → "top 50" silently became 40 | Design review of pgvector docs | `SET LOCAL hnsw.ef_search` per query |
| 4 | Proposal fallback said "my relevant skills for this work are …" even when no skill matched | Live test | Different sentence when nothing matches |
| 5 | Security test silently tested nothing (newer FastAPI nests routers in `app.routes`) | Guard test `test_route_inventory_is_not_empty` failed | Read the route list from the OpenAPI schema |
| 6 | react-router-dom 6 had 2 moderate advisories (open redirect, SSR) | `npm audit` | Upgraded to 7.18.5 |
| 7 | Windows PowerShell wrote `.env` with a UTF-8 BOM | Inspection of file bytes | Rewrote files without BOM |
| 8 | Large JS bundle (> 500 kB) | Vite build warning | Lazy-load chart pages; main bundle 261 kB (81 kB gzip) |
| 9 | After sign-up the user sometimes landed on the dashboard instead of the profile wizard (two redirects raced) | E2E walk-through failed on one run | Guest pages only redirect users who were already logged in on arrival |
| 10 | Job card: budget shown on the same line as short titles; score squeezed titles on mobile | E2E screenshots | Block-level title; card header stacks on small screens |
| 11 | Production server crashed (out of memory) while embedding new jobs on the free 512 MB plan | Render logs showed restarts; reproduced with `docker run -m 512m` (OOMKilled at 511 MB) | Batches of 4, one ONNX thread, `MALLOC_ARENA_MAX=2`, `malloc_trim` after each run → peak 329 MB |
| 12 | Registering on the live site returned 500: Python 3.11 cannot write the `Partitioned` cookie attribute | Live API check; server log `ValueError: Partitioned cookies are only supported in Python 3.14` | Cookie header written by hand; new test with the cross-site settings |
| 13 | Gemini `gemini-2.5-flash` refused new API keys; full "thinking" made drafts take > 30 s | Live key test (HTTP 404 "no longer available to new users"; timeouts) | Switched to `gemini-3.5-flash` with `thinkingLevel=minimal` (≈ 3–12 s) |
| 14 | AI miscopied the portfolio link (`https://github.zainatif90`) | Live proposal check | `fix_links()` corrects near-miss links to the real one and removes invented links; new test |
| 15 | Himalayas batch failed to save: 20 of 85 job IDs were longer than the 100-character column | Live database check (0 Himalayas jobs) + server log `StringDataRightTruncation` | `fit_to_columns()`: too-long IDs become a stable SHA-256 fingerprint (all sources); new test |
| 16 | Himalayas returned the same jobs on every page (its search ignores `offset`) | 85 fetched but only 17 new; compared pages | Paging with `page=1,2,3`; live: 92 unique Himalayas jobs |
| 17 | Skill Gap suggested skills from other fields (a QA tester was told to learn PHP, Illustrator, Photoshop, Graphic Design) | User report with screenshot; reproduced on live data | Gaps now come only from the user's field: the 200 most similar jobs that also share one of the user's skills (tags or title); "unlocked" counts only jobs in that field; reposts counted once. Before/after table in section 5d |

## 5d. Skill Gap: before and after the "your field only" fix (live data, 1 November 2026)
Read-only run on the production database (3,074 active jobs), same 5 test profiles, top 5 suggestions:

| Profile (skills) | Before (whole market) | After (own field only) |
|---|---|---|
| QA tester (Manual Testing, QA, Bug Reporting, Test Cases, Jira) | PHP, Adobe Illustrator, Excel, Photoshop, Graphic Design | Android, Mobile App Development, iOS, Mobile App Testing, CI/CD |
| Automation (Python, Web Scraping, Automation, Selenium, Zapier) | Video Production, Video Editing, Graphic Design, PHP, Adobe Illustrator | AWS, Node.js, Django, SQL, JavaScript |
| React developer (React, TypeScript, Node.js) | Video Production, Social Media Marketing, Adobe Illustrator, Video Editing, Data Entry | PHP, Python, CI/CD, PostgreSQL, React Native |
| Logo designer (Logo Design, Adobe Illustrator, Brand Identity) | PHP, Data Entry, Social Media Marketing, Video Production, Web Development | Photoshop, Illustration, Adobe InDesign, Brochure Design, Packaging Design |
| Content writer (Content Writing, Blog Writing, Copywriting, SEO) | Adobe Illustrator, Social Media Marketing, Video Production, Video Editing, Photoshop | Social Media Marketing, Digital Marketing, Content Strategy, Technical Writing, Article Writing |

What we measured on the way (why similarity alone was not enough):
- MiniLM gives any two job-like texts a similarity of about 0.3: a social-media job scored 0.39 against a React
  profile, higher than Shopify jobs (0.30–0.36). So "your field" also requires sharing at least one of your skills.
- Live QA jobs are tagged "Testing / QA" and "Software Testing" (now the same skill as "QA"); titles such as
  "QA Tester (Manual Testing, SaaS)" are also used to decide a job's field.
- One "CAD Engineer - AI Trainer" role was posted 14 times and made SolidWorks look like 14 Python jobs;
  identical reposts are now counted once.
- Without the field rule, "AWS" for a QA tester "unlocked" technical-support and DevOps jobs; now it unlocks none.
Compute time per profile on 3,074 jobs: 250–290 ms on a laptop (cached for 1 hour).
Live check after deploying (temporary QA account on the production API, deleted afterwards): field 40 of 3,016 jobs,
suggestions Android, Mobile App Development, iOS, Mobile App Testing, CI/CD, no off-field skills; first uncached
calculation 7.4 s on the free server right after a restart.

## 8. Known limitations (not hidden)
- Match Score weights (0.70 / 0.15 / 0.15) are heuristic, not learned. Won/lost feedback is stored for a future model.
- Win-rate charts stay empty until members record real won/lost outcomes; no outcomes are invented.
- Proposal generation needs an `LLM_API_KEY`; without it users get a clearly-labelled template draft.
- Load test ran on a development laptop; free-tier cloud hosting will be slower (see deployment notes).
- Skill Gap "jobs unlocked" measures how many more jobs in the user's field the model would rank ≥ 60 if the skill
  were on the profile. "Your field" depends on the job tags we receive: a field with few live jobs (e.g. QA testing:
  40 jobs on 1 Nov) gives fewer suggestions, and adjacent skills (e.g. mobile development for a mobile tester) can appear.
