# FitWork Progress

Deadline: 19 November 2026

## Target timeline
| Dates | Work |
|---|---|
| 28 Oct - 6 Nov | Prompts 1-4: auth, profile, jobs ingestion, matching + dashboard |
| 7 Nov - 12 Nov | Prompts 5-7: proposals, agency mode, skill gap |
| 13 Nov - 16 Nov | Prompts 8-9: testing/security, deployment |
| 17 Nov - 19 Nov | SRS update (Prompt 10), viva prep, buffer |

## Done
- [x] Prompt 0: CLAUDE.md created with audited decisions (fastembed, cookie/proxy auth, freshness rules, score calibration)

## Environment setup (28 Oct)
- [x] Installed: Node.js v24.22.1 (npm 11.19.1), Git 2.56.0, Python 3.11.9 (3.14 kept), Docker 29.9.2, WSL 3.0.3
- [x] Git identity: Muhammad Zain <zainatif90@gmail.com>
- [x] PC restarted, Docker engine running

## Next
- [x] Prompt 1: project skeleton + authentication (15 tests passing; proxy + cookie flow smoke-tested)
- [x] Prompt 2: profile wizard (fastembed embeddings, 300+ seeded skills, 34 tests passing)
- [x] Prompt 3: job ingestion (Freelancer.com API + 494 real seed jobs + manual paste; 1,486 active jobs embedded; 49 tests)
- [x] Prompt 4: matching engine + dashboard (69 tests; /matches p50 64 ms uncached / 4.7 ms cached on 1,486 real jobs; cosine calibration evidence via app.scripts.cosine_distribution)
- [x] Prompt 5: AI proposals (Gemini/OpenAI via env, template fallback, 20/day limit; 75 tests). NEEDS USER: LLM_API_KEY in .env
- [x] Prompt 6: agency mode (invites, routing via matching service, decline re-route, role checks, win-rate chart; 84 tests)
- [x] Prompt 7: skill gap radar (re-embed per candidate skill, vectorised re-scoring; ~220 ms on 1,486 jobs; 90 tests)
- [x] Prompt 8: testing, security, real results (131 tests, Locust 50 users 0 failures, E2E 11/11, TEST_RESULTS.md)
- [x] Prompt 9: deployment - LIVE 24/7 for $0: website https://fitwork-zain2026.web.app (Firebase Hosting), API https://fitwork-api-zain2026.onrender.com (Render free, keep-awake ping, private GHCR image built by GitHub Actions), Neon DB. Live E2E 11/11. Real emails live via Google Apps Script mailer (SMTP blocked on Render free). Real AI proposals live (Gemini 3.5 Flash). Job sources: Freelancer.com + Himalayas + Remotive + Jobicy (1,786 active jobs on 30 Oct). NEXT: Prompt 10 (SRS update, needs the SRS text) and viva practice.
- [x] 1 Nov: Skill Gap now only suggests skills from the user's own field (200 most similar jobs that share one of
  their skills; reposts counted once; QA spellings merged). Before/after on live data in TEST_RESULTS.md 5d; 177 tests.
- [x] 1 Nov: fixed all 34 bugs from the full review (security limits, sessions, agency, matching, UI); 208 tests, E2E 11/11.
- [x] 1 Nov: UI/UX redesign: landing page, gradient design system, score rings, dashboard banner, new auth panel; E2E 11/11.
- [x] 1 Nov: tasteful animations on every page (page/section stagger, score rings, count-up, skeletons, drawer/dialog motion); E2E 11/11.
- [x] 1 Nov: bold motion v2: drifting aurora glows, rotating headline word, animated gradient text, button shine, rainbow border on best match, scroll reveals, 3D tilt, source marquee.
- [x] 1 Nov: vivid theme + 3D: dark animated sidebar, gradient canvas, glass cards, banner headers on every page, 3D gyroscope orbs, 3D card deck, 3D press buttons, tilt glare.
- [x] 1 Nov: smoother motion (frame-based tilt, no glass blur, lighter glows) and a 3D Skill Gap radar (pillars on a turning holographic floor).
- [x] 1 Nov: Skill Gap 3D chart redesigned as a 'skill skyline': 3D towers in two zones (have / missing), numbered with a key, turns with the mouse.
- [x] 1 Nov: profile editing made visible: sidebar 'My Profile & Skills', buttons on Settings, Matches and Skill Gap.
- [x] 1 Nov: skill spelling variants merged automatically (E-commerce = eCommerce); example job per Skill Gap skill; phone layout fixes (3D chart fits, dashboard tiles, agency team cards, text truncation).
- [x] 1 Nov: fully responsive: audited 13 page states x 7 widths (320-1920 px), 0 issues after fixing grids, score row and button wrapping.
- 2 Nov 2026: Agency page lets a freelancer start their own agency (POST /api/agency/start); 2 tests.
- 2 Nov 2026: Agency Mode redesign: owner hero stats, setup checklist, tabs (Routing with teammate comparison, Pipeline board, Team with inline invites/resend/remove, Performance), member queue with progress steps and confirmations.
- 2 Nov 2026: Team Chat (extra feature): agency channel, job threads, direct messages, unread badge, Jitsi 'Meet now' calls; migration 0009; 8 tests.
- 2 Nov 2026: Agency SQA audit: 17 findings reproduced and fixed (H1-H2, M1-M6, L1-L9); migration 0010; 16 tests in test_agency_audit.py; 245 tests pass; results table in TEST_RESULTS.md section 7b.
- 18 Nov 2026: Code report for submission: CODE_REPORT.md (+ FitWork_Code_Report.docx / .pdf, 8 pages). Test suite re-run: 245 passed.
- 18 Nov 2026: Final SRS v2.0 (IEEE 830 structure): SRS.md + FitWork_SRS.docx / .pdf (14 pages): 10 use cases, 66 FRs, NFRs with measured results, TC-1..TC-8, traceability matrix. Repo made public for evaluators.
- 18 Nov 2026: A1 project poster: poster/poster.html -> FitWork_Poster.png (4490x6358) + FitWork_Poster.pdf (A1); QR code to the live site.
- 19 Nov 2026: Unit / integration / TDD testing (TESTING.md): tests auto-marked unit (97, run without Docker in 1.8 s) or integration (177); 2 TDD cycles fixed real bugs ('1 minutes ago' in scoring.py, '$1000'/'$1.0k' in format.ts); 18 LLM/email unit tests (65% -> 100%); Vitest added (10 frontend tests); 274 backend + 10 frontend pass, 89% coverage.
- 19 Nov 2026: FIXED Skill Gap crashing the live server (out of memory on 512 MB): lean loader in skill_gap.py (columns only, float32 embeddings, batches of 100). 8,000 jobs: peak 569 MB -> 315 MB. Regression test added; 275 tests pass. TEST_RESULTS.md bug #18.
- 19 Nov 2026: Review fixes: daily purge of old jobs, one Skill Gap at a time + 12,000-job cap, no duplicate matches, delete account (API + Settings), common-password block, site-wide AI limit, Skill Gap progress/retry, profile strength hint, cache sweep, /api/health/deep + 3-hourly GitHub check, CI runs all tests before building. 299 backend + 14 frontend tests pass (also in CI).
- 19 Nov 2026: Website smoothness: 'calm motion' (no non-stop animations, no blur filters, Skill Gap chart loop stops when settled). Live, measured with e2e/perf_probe.py: dashboard 25 -> 58 fps idle, Skill Gap 29 -> 60, Agency/Settings ~40 -> 60. TEST_RESULTS.md 5e.
- 19 Nov 2026: Frankfurter API (ECB exchange rates, no key): EUR/GBP/INR job-board salaries converted to USD (cached 12 h; API down = budget left empty, never guessed). Also fixed 'per month' salaries read as yearly. 8 new tests.
