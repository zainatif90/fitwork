# FitWork — Unit, Integration and TDD Testing

All numbers below come from real runs on **19 November 2026** (Windows 11 laptop, Python 3.11.9, pytest 9.2,
PostgreSQL 16 + pgvector and Redis 7 in Docker; frontend: Node 24, Vitest 3.2.4).
Performance, load and end-to-end results are in [TEST_RESULTS.md](TEST_RESULTS.md).

## Summary

| Level | What it tests | Tool | Tests | Result | Time |
|---|---|---|---|---|---|
| **Unit** (backend) | One function at a time, plain inputs, **no database, Redis or network** | pytest (`-m unit`) | 97 | **97 passed** | 1.8 s |
| **Integration** (backend) | Real HTTP requests through FastAPI → services → PostgreSQL + pgvector → Redis | pytest (`-m integration`) | 177 | **177 passed** | 3 min 31 s |
| **Unit** (frontend) | Display helpers in `src/lib/format.ts` | Vitest | 10 | **10 passed** | 0.7 s |
| **TDD** | Two real bugs fixed test-first (red → green → refactor) | pytest + Vitest | 11 + 2 | both cycles completed | — |
| **Total** | | | **284** | **284 passed, 0 failed** | |

**Code coverage (backend, `pytest --cov=app`, all 274 backend tests):** 89% of all statements; **93.3%** of the
application code when the six command-line scripts in `app/scripts/` (benchmarks, data loaders) are left out.
Core modules: scoring 96%, matching 93%, routing 96%, skill gap 98%, agency service 96%, security 96%,
LLM client 100%, email 100%.

## How to run

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -m unit           # unit tests only — works with Docker stopped
.\.venv\Scripts\python.exe -m pytest -m integration    # needs: docker compose up -d
.\.venv\Scripts\python.exe -m pytest --cov=app         # everything + coverage report

cd ..\frontend
npm test                                               # Vitest unit tests
```

## 1. Unit vs integration: how tests are classified

The split is automatic, in `backend/tests/conftest.py` (`pytest_collection_modifyitems`):

- A test that uses the **`client`** fixture (real HTTP calls to the API) or the **`db`** fixture (real PostgreSQL
  session), directly or through another fixture, is marked **integration**.
- Every other test is marked **unit**.
- Two tests build their own `TestClient` (to inspect HTTP 500 responses), so they are marked
  `@pytest.mark.integration` by hand. They were found by the check below.
- The database is rebuilt from the Alembic migrations, and emptied after each test, **only for integration tests**.

**Proof that unit tests are real unit tests:** the PostgreSQL and Redis containers were stopped
(`docker compose stop`, `docker ps` showed nothing) and `pytest -m unit` was run: **79 passed in 1.88 s**
(before the 18 LLM/email tests were added). The first attempt hung on one test; that is how the two hand-marked
tests above were found.

### Tests per file

| File | Unit | Integration | Covers |
|---|---|---|---|
| test_scoring.py | 12 | 0 | Match Score formula: semantic calibration, budget fit, recency, fit gate, reasons |
| test_tdd_humanize_age.py | 11 | 0 | TDD cycle 1 ("posted … ago" text) |
| test_embeddings.py | 5 | 0 | 384 dimensions, unit length, similar texts closer than unrelated ones |
| test_llm_email_unit.py | 18 | 0 | LLM client (Gemini/OpenAI success, errors, timeouts, empty answers) and email (dev console, webhook, SMTP 587/465, failures) with fake network |
| test_job_boards.py | 18 | 2 | Himalayas/Remotive/Jobicy parsing, pay conversion, paging |
| test_ingestion.py | 8 | 7 | Freelancer.com parsing, USD conversion, dedupe, expiry, CSV, retries |
| test_skill_gap.py | 9 | 5 | Demand counting, "your field", unlock calculation, endpoint |
| test_review_fixes.py | 5 | 5 | Regression tests for the 34 bugs from the 1 Nov review |
| test_cloud_run.py | 4 | 3 | In-memory Redis replacement, production settings |
| test_password_reset.py | 3 | 7 | Reset tokens, limits, sessions ended |
| test_proposals.py | 2 | 6 | Prompt rules, fallback, daily limit, privacy |
| test_auth_sessions.py | 1 | 11 | Sessions, refresh rotation, client IP, sign-up limits |
| test_security.py | 1 | 43 | Every protected endpoint returns 401 without a token, headers, no stack traces |
| test_auth.py | 0 | 16 | Register, login, refresh cookie, verify, SQL injection, rate limit |
| test_profile.py | 0 | 14 | Profile save/validation, embedding stored |
| test_agency.py | 0 | 18 | Invites, routing, decline re-route, roles, stats |
| test_agency_audit.py | 0 | 16 | Agency SQA audit fixes (H1–L9) |
| test_matching.py | 0 | 8 | Top-5 ranking, cache, privacy, feedback |
| test_chat.py | 0 | 8 | Team chat channels, unread, calls, access rules |
| test_srs_cases.py | 0 | 8 | SRS test cases TC-1 … TC-8 |
| **Total** | **97** | **177** | |

Frontend unit tests (`frontend/src/lib/format.test.ts`, 10 tests): budget formatting (ranges, single values,
thousands, unknown budget), "time ago" text with a fake clock, platform/source names, score colour bands.

### Example of each level

**Unit** (`test_scoring.py`): calls `budget_fit("hourly", 20, 40, 30)` and checks the result is `1.0`.
No server, no database; it runs in microseconds.

**Integration** (`test_srs_cases.py::TC-3`): registers a user through `POST /api/auth/register`, saves a React
profile (which is embedded by MiniLM), inserts real job rows into PostgreSQL, calls `GET /api/matches` and checks
that 5 matches come back sorted by score with the React job first. This goes through routing, validation, auth,
the pgvector query, scoring and the Redis cache.

## 2. Test-Driven Development (TDD)

TDD means: **write a failing test first (RED), write the smallest code that makes it pass (GREEN), then clean the
code while the tests stay green (REFACTOR).** Two real bugs were fixed this way on 19 November 2026.

### TDD cycle 1 — backend: "1 minutes ago"

Bug found while reviewing `app/services/scoring.py`: the Match Score reason for a job posted less than a minute ago
said **"1 minutes ago"**. The code changed the number from 0 to 1 but checked the plural against the original 0.

**RED.** Tests written first (`backend/tests/test_tdd_humanize_age.py`, 11 tests: 0 s, 30 s, 1, 2, 59 minutes,
1, 5, 47 hours, 2 and 10 days, and a timestamp in the future). Output before any code change:
```
E       AssertionError: assert '1 minutes ago' == '1 minute ago'
E       AssertionError: assert '1 minutes ago' == '1 minute ago'
E       AssertionError: assert '1 minutes ago' == '1 minute ago'
FAILED test_humanize_age_uses_correct_singular_and_plural[age0-1 minute ago]
FAILED test_humanize_age_uses_correct_singular_and_plural[age1-1 minute ago]
FAILED test_humanize_age_future_timestamp_is_treated_as_just_posted
3 failed, 8 passed in 0.34s
```

**GREEN.** Smallest fix: apply `max(minutes, 1)` before choosing singular/plural.
```
11 passed in 0.04s
```

**REFACTOR.** The singular/plural rule was written three times (minutes, hours, days), which is how the bug
appeared. It now lives in one helper, `_plural(n, unit)`, used by all three. Tests re-run:
```
23 passed in 0.06s        (11 new + 12 existing scoring tests)
```

### TDD cycle 2 — frontend: "$1000" and "$1.0k"

Bug found while reviewing `frontend/src/lib/format.ts`: `money()` decided between "$" and "k" before rounding, so a
budget of 999.60 showed as **"$1000"** and 1000.40 as **"$1.0k"**.

**RED.** Tests written first (`frontend/src/lib/format.test.ts`). Output before the fix:
```
× formatBudget > rounds a budget just under 1,000 to $1k, not $1000
  → expected '$1000 fixed' to be '$1k fixed'
× formatBudget > does not show a useless .0 in thousands
  → expected '$1.0k fixed' to be '$1k fixed'
Tests  2 failed | 8 passed (10)
```

**GREEN.** `money()` now rounds to whole dollars first, then picks the unit, with at most one decimal and no ".0".
```
Tests  10 passed (10)          TypeScript type-check: passed
```

**REFACTOR.** The fix was written as a small named, commented function, so no further change was needed; the tests
and the type-check were re-run and stayed green.

## 3. Coverage-driven unit tests

The first coverage run showed two important modules below 70%: `services/llm.py` (65%) and `services/email.py`
(65%). Both talk to outside services, so the missing paths were the error cases. `tests/test_llm_email_unit.py`
(18 unit tests) replaces the network with small fakes and checks: Gemini and OpenAI success; the API key goes in a
header, never the URL; missing key, unknown provider, HTTP 429, unexpected response shape, timeout, network error
and empty answer all become `LLMError` (so the template fallback is used); development emails are printed; the
webhook sends the secret and message; SMTP uses STARTTLS on 587 and SSL on 465; mail failures are logged and never
break the API request. Result: **llm.py 65% → 100%, email.py 65% → 100%**.

One honest note: two of these tests first passed alone but failed in the full run, because the FastAPI app (started
by earlier integration tests) changes the logging setup so pytest's `caplog` no longer sees the messages. They now
check the module's logger directly and pass in any order.

## 4. What is not covered (and why)

| Module | Coverage | Reason |
|---|---|---|
| `app/scripts/*` | 0% | Command-line tools (benchmarks, data loaders) run by hand; their results are in TEST_RESULTS.md |
| `services/scheduler.py` | 35% | Runs the 30-minute background fetch; tests switch the scheduler off. The fetch itself is covered through `ingestion.py` (95%) |
| `services/bootstrap.py` | 44% | One-time loading of the seed data on a fresh production server |
| Frontend pages/components | — | Checked by the Playwright end-to-end walk-through (11/11 steps, TEST_RESULTS.md 5b), not by unit tests |
