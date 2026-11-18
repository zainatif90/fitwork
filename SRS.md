# Software Requirements Specification — FitWork

**NLP-Based Freelance Job Matching Platform**

| Item | Details |
|---|---|
| Document | Software Requirements Specification (SRS), following the IEEE 830 / ISO/IEC/IEEE 29148 structure |
| Project | FitWork — Final Year Project |
| Version | 2.0 (final, matches the delivered system) |
| Date | 19 November 2026 |
| Team members | Muhammad Zain (261934604), Basharat Ahmad, Qasim Younas |
| FYP advisor | Mam Samia Asloob Qureshi |
| Repository | https://github.com/zainatif90/fitwork |
| Live system | https://fitwork-zain2026.web.app |

### Revision history

| Version | Date | Description |
|---|---|---|
| 1.0 | October 2026 | Initial SRS: scope, use cases UC-1 to UC-6, test cases TC-1 to TC-8 |
| 2.0 | 19 November 2026 | Final version aligned with the delivered system: added job-board sources, server-side sessions, password reset, Agency Mode extensions, Team Chat, measured test results and traceability |

---

## Table of contents

1. Introduction
2. Overall description
3. System features and functional requirements
4. External interface requirements
5. Non-functional requirements
6. Data requirements
7. Verification: test cases
8. Requirements traceability matrix
9. Appendix A — Match Score model
10. Appendix B — Glossary

---

## 1. Introduction

### 1.1 Purpose
This document specifies the software requirements of **FitWork**, a web platform that collects freelance job
listings and matches them to a freelancer's skill profile using natural language processing (NLP) embeddings.
It is written for the FYP advisor, the evaluation panel, and the development team. It defines what the system
must do (functional requirements), how well it must do it (non-functional requirements), and how each
requirement is verified.

### 1.2 Problem statement
Freelancers spend a large part of their working time scrolling through hundreds of job listings on several
platforms, most of which do not fit their skills, rate or experience. Keyword search misses jobs that describe
the same work in different words (for example "web scraping" and "data extraction bot"). Small freelance
agencies have the same problem multiplied by the number of team members, and must also decide manually which
member is best suited for each job.

### 1.3 Scope
FitWork will:
- Collect real job listings from public sources (Freelancer.com public API, the Himalayas, Remotive and Jobicy
  job-board APIs, a cited CSV snapshot) and from jobs pasted by the user.
- Convert each job and each freelancer profile into a semantic embedding (all-MiniLM-L6-v2, 384 dimensions).
- Show each freelancer the **top 5 matching jobs** with an explainable **Match Score (0–100)**, a reason,
  matched skills and missing skills.
- Generate an AI proposal draft for a selected job from the freelancer's real profile.
- Provide an **Agency Mode** in which an owner invites members and the system routes each job to the
  best-fitting member.
- Provide a **Skill Gap Radar** that measures which missing skill would unlock the most jobs in the user's field.
- Provide a **Team Chat** for agencies (extra feature).

FitWork will **not**: apply to jobs on the user's behalf, process payments, scrape websites that forbid it
(LinkedIn, Fiverr), or predict the probability of winning a job (no labelled won/lost data exists).

### 1.4 Definitions, acronyms and abbreviations
See Appendix B for the full glossary. Key terms: **SRS** (Software Requirements Specification), **NLP**
(Natural Language Processing), **Embedding** (a numeric vector representing the meaning of a text),
**Match Score** (0–100 fit between a profile and a job), **JWT** (JSON Web Token), **LLM** (Large Language Model).

### 1.5 References
1. IEEE Std 830-1998, *Recommended Practice for Software Requirements Specifications*.
2. ISO/IEC/IEEE 29148:2018, *Systems and software engineering — Life cycle processes — Requirements engineering*.
3. Reimers, N. and Gurevych, I. (2019). *Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks*. EMNLP.
4. Freelancer.com Developer API — Projects endpoint (`/api/projects/0.1/projects/active/`).
5. pgvector — open-source vector similarity search for PostgreSQL.
6. OWASP Top 10 (2021) and OWASP Authentication Cheat Sheet.
7. FitWork repository documents: `CODE_REPORT.md`, `TEST_RESULTS.md`, `data/SOURCES.md`, `DEPLOYMENT.md`.

### 1.6 Document overview
Section 2 describes the product context, users and constraints. Section 3 lists the functional requirements
grouped by feature, each with a use case. Section 4 covers interfaces, Section 5 non-functional requirements,
Section 6 data, Section 7 the test cases, and Section 8 traces every requirement to its use case and test.

---

## 2. Overall description

### 2.1 Product perspective
FitWork is a new, self-contained web application. It consists of:

```
 Browser (React single-page app)
        |  HTTPS / JSON  (access token in header, refresh token in httpOnly cookie)
        v
 FastAPI backend  ── scheduler (fetches jobs every 30 min)
        |                  |                         |
        v                  v                         v
 PostgreSQL + pgvector   Redis (cache,         External services:
 (users, profiles,       rate limits, locks)   job APIs, LLM (Gemini/OpenAI),
  jobs, embeddings)                            email, Jitsi Meet
```

### 2.2 Product functions (summary)

| # | Function | Use case |
|---|---|---|
| F1 | Account management: register, verify email, log in, log out, reset password | UC-1 |
| F2 | Freelancer profile creation and editing (4-step wizard) | UC-2 |
| F3 | Ranked job matching with explainable Match Score | UC-3 |
| F4 | Agency Mode: team management and job routing | UC-4 |
| F5 | Skill Gap Radar | UC-5 |
| F6 | AI Proposal Assistant | UC-6 |
| F7 | Job ingestion from public sources (automatic) | UC-7 |
| F8 | Manual job paste | UC-8 |
| F9 | Match feedback (applied / won / lost / not relevant) | UC-9 |
| F10 | Agency Team Chat and calls (extra) | UC-10 |

### 2.3 User classes and characteristics

| User class | Description | Main functions |
|---|---|---|
| **Freelancer** (solo) | Individual who looks for jobs; basic computer skills | F1, F2, F3, F5, F6, F8, F9 |
| **Agency owner** | Runs a small team; may also have their own freelancer profile | All freelancer functions + F4, F10 (manage team, route jobs) |
| **Agency member** | Freelancer who accepted an owner's invite; belongs to one agency only | Freelancer functions + receives routed jobs, F10 |
| **Administrator** | Team member who maintains the system | Trigger ingestion, view job statistics |
| **Scheduler** (system actor) | Background process | F7: fetch and expire jobs |

### 2.4 Operating environment
- **Client:** any modern browser (Chrome, Edge, Firefox, Safari), desktop or mobile, 320 px to 1920 px wide.
- **Server:** Python 3.11, FastAPI, single uvicorn worker, Linux container (Docker).
- **Database:** PostgreSQL 16 with the pgvector extension.
- **Cache:** Redis 7, or an in-memory store on the free production plan.
- **Production hosting:** Firebase Hosting (website), Render free web service (API), Neon (PostgreSQL).

### 2.5 Design and implementation constraints
- C-1: The technology stack is fixed: React + Vite + TypeScript + Tailwind CSS (frontend); Python 3.11,
  FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2 (backend); PostgreSQL 16 + pgvector; Redis.
- C-2: The NLP model must run on a CPU inside 512 MB of memory (free hosting). Therefore
  all-MiniLM-L6-v2 is run through fastembed (ONNX) instead of PyTorch.
- C-3: Only job sources with a public API or published dataset may be used. LinkedIn and Fiverr are excluded
  because they have no public job API and scraping violates their terms. Upwork requires API approval.
- C-4: The system must never present invented data as real. Synthetic jobs are allowed only for load testing
  and must be stored with `source = synthetic`.
- C-5: Secrets (database URL, JWT secret, API keys) must be provided through environment variables, never
  stored in source code.
- C-6: The total running cost must be zero (free tiers only).

### 2.6 User documentation
- `README.md`: installation, running and testing instructions.
- `CODE_REPORT.md`: architecture and code explanation.
- Interactive API documentation at `/api/docs` (OpenAPI / Swagger, generated automatically).
- In-app guidance: setup checklist for agency owners, empty-state messages, and score explanations.

### 2.7 Assumptions and dependencies
- A-1: Freelancer.com keeps its public Projects API available without authentication.
- A-2: An LLM API key (Gemini or OpenAI) is available for real proposal generation; without it the system
  uses a clearly-labelled template.
- A-3: Users enter truthful skills and rates; the Match Score is only as good as the profile.
- A-4: Job listings are in English (the embedding model is English-trained).
- A-5: Email delivery requires SMTP or a mail webhook in production; in development emails are printed to the console.

---

## 3. System features and functional requirements

Priority: **H** = must have, **M** = should have, **L** = nice to have.
Every requirement has a unique ID used in the traceability matrix (Section 8).

### 3.1 UC-1 Account management and authentication

| Field | Description |
|---|---|
| Actors | Visitor, Freelancer, Agency owner, Agency member |
| Precondition | None (registration); registered account (login) |
| Main flow | 1. Visitor opens the register page and enters full name, email, password and role (freelancer or agency owner). 2. System validates input, stores the password as a bcrypt hash and sends a verification email. 3. User is logged in and redirected to the profile wizard. 4. On later visits, the user logs in with email and password. |
| Alternative flows | A1: Email already registered → error "Email is already registered". A2: Wrong password → generic "Invalid email or password". A3: Too many failed attempts → HTTP 429. A4: Forgotten password → reset link by email. |
| Postcondition | User has an active session on this device |

| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | The system shall allow a visitor to register with full name (2–120 characters), email and password (8–72 bytes) and choose the role *freelancer* or *agency owner*. | H |
| FR-1.2 | The system shall reject a registration whose email already exists, ignoring letter case. | H |
| FR-1.3 | The system shall store passwords only as bcrypt hashes with cost factor 12. | H |
| FR-1.4 | The system shall send an email verification link. Unverified users can log in but shall see a "verify your email" banner and cannot send agency invites. | M |
| FR-1.5 | The system shall issue a JWT access token (valid 24 hours) and a refresh token (valid 7 days) on login. The access token shall be kept in browser memory only; the refresh token shall be stored in an httpOnly cookie restricted to the path `/api/auth`. | H |
| FR-1.6 | The system shall keep a server-side session per device. Logout shall end that device's session; a password reset shall end all sessions of the user. | H |
| FR-1.7 | Refresh tokens shall rotate on every use; a used refresh token shall be refused after a 30-second grace period (so two open tabs do not log each other out). | M |
| FR-1.8 | On page load the web app shall call the refresh endpoint to obtain a new access token; if refresh fails, the user shall be logged out. | H |
| FR-1.9 | The system shall allow a user to request a password reset link by email and set a new password with it. | M |
| FR-1.10 | Login errors shall not reveal whether an email is registered. | H |

### 3.2 UC-2 Freelancer profile

| Field | Description |
|---|---|
| Actors | Freelancer, Agency owner, Agency member |
| Precondition | User is logged in |
| Main flow | 1. User opens the 4-step profile wizard. 2. Step 1: skills (with autocomplete). 3. Step 2: experience level and hourly rate. 4. Step 3: bio and portfolio links. 5. Step 4: platforms used, then review and save. 6. System builds the profile text, computes its embedding and stores it. |
| Alternative flows | A1: Invalid value (e.g. no skills, rate ≤ 0) → field error, profile not saved. A2: Embedding fails → profile saved with status "pending" and embedded later. |
| Postcondition | Profile and its 384-dimension embedding are stored; cached matches are cleared |

| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | The system shall let the user enter 1–40 skills with autocomplete from a dictionary of 300+ skills. | H |
| FR-2.2 | The system shall require an experience level (beginner, intermediate, expert) and an hourly rate in USD (greater than 0, at most 1,000). | H |
| FR-2.3 | The system shall accept an optional bio (max 2,000 characters), up to 10 portfolio URLs and the platforms the user works on. | M |
| FR-2.4 | The system shall compute a 384-dimension, L2-normalised embedding of the profile with all-MiniLM-L6-v2 on every save. | H |
| FR-2.5 | Spelling variants of the same skill (e.g. "E-commerce" and "eCommerce") shall be treated as one skill. | M |
| FR-2.6 | The user shall be able to edit the profile at any time; saving shall clear cached matches and skill-gap results. | H |

### 3.3 UC-3 Ranked job matching

| Field | Description |
|---|---|
| Actors | Freelancer, Agency owner (with profile), Agency member |
| Precondition | User has a saved profile with an embedding |
| Main flow | 1. User opens the dashboard. 2. System finds the 50 active jobs nearest to the profile embedding (pgvector). 3. System computes a Match Score for each. 4. System shows the top 5 with score, reason, matched skills and missing skills. 5. User opens a job to see the full score breakdown. |
| Alternative flows | A1: No profile → user is sent to the wizard. A2: No active jobs → empty state message. |
| Postcondition | Results cached for 10 minutes |

| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | The system shall return the top 5 active jobs for the user, sorted by Match Score from highest to lowest. | H |
| FR-3.2 | The Match Score shall be an integer from 0 to 100 computed by the model in Appendix A (semantic fit, budget fit, recency and fit gate). | H |
| FR-3.3 | Each match shall include a short human-readable reason, the matched skills and the missing skills. | H |
| FR-3.4 | The system shall label the result a "Match Score" and shall not present it as a probability of winning the job. | H |
| FR-3.5 | Inactive (expired) jobs and jobs the user marked "not relevant" shall not be shown. | H |
| FR-3.6 | Manually pasted jobs shall be visible only to the user who pasted them. | H |
| FR-3.7 | The job detail page shall show the job description, budget, source, link to the original posting and the score breakdown. | H |
| FR-3.8 | Match results shall be cached per user for 10 minutes and the cache cleared when the profile changes. | M |

### 3.4 UC-4 Agency Mode and job routing

| Field | Description |
|---|---|
| Actors | Agency owner, Agency member |
| Precondition | Owner has a verified email and an agency |
| Main flow | 1. Owner creates the agency (or registers as agency owner). 2. Owner invites members by email. 3. Member opens the invite link and accepts. 4. System builds candidate jobs and recommends the best member for each. 5. Owner approves or overrides the recommendation. 6. Member sees the job in their queue and updates its status: assigned → applied → won/lost. |
| Alternative flows | A1: Member declines → job re-routed to the next best member. A2: Best score < 50 → job flagged "Low Team Fit" with missing team skills. A3: Invite expired → "Link expired"; owner resends. A4: Owner takes a job back or reassigns it before anyone applied. A5: Member leaves; owner removes a member; owner closes the agency. |
| Postcondition | Assignment stored; team statistics updated |

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | An agency owner shall be able to invite members by email. Invite links shall be single-use, bound to the invited email, and expire after 7 days. | H |
| FR-4.2 | A freelancer who accepts an invite shall become an agency member. A member shall belong to only one agency. | H |
| FR-4.3 | Candidate jobs for routing shall be the union of every active member's top 20 matches (including the owner when the owner has a profile). | H |
| FR-4.4 | For each candidate job the system shall score every member with the same Match Score model and recommend the member with the highest score. | H |
| FR-4.5 | If the best member's score is below 50, the job shall be flagged "Low Team Fit" and list the job skills no member has. | M |
| FR-4.6 | The owner shall be able to approve a recommendation or assign the job to a different member. | H |
| FR-4.7 | A member who declines a job shall never be recommended that job again; the job shall be re-routed to the next best member and listed first. | H |
| FR-4.8 | Assignment status shall follow assigned → applied → won/lost only; "applied" cannot be skipped and final results cannot change. | H |
| FR-4.9 | The owner shall be able to take a job back or reassign it before anyone applied, remove members, and close the agency (typing the agency name to confirm). Members shall be able to leave. | M |
| FR-4.10 | Jobs closed on the source platform shall show "Closed" and cannot be marked applied. | M |
| FR-4.11 | The system shall show team statistics (assigned, applied, won, lost, win rate per member) computed on the server over all assignments. | M |
| FR-4.12 | Members shall not be able to see other members' assignments or other agencies' data. | H |

### 3.5 UC-5 Skill Gap Radar

| Field | Description |
|---|---|
| Actors | Freelancer, Agency owner (with profile), Agency member |
| Precondition | User has a saved profile |
| Main flow | 1. User opens Skill Gap. 2. System determines the user's field. 3. System measures for each candidate skill how many more jobs it would unlock. 4. System shows the top 5 gaps with sample jobs and a chart of the most requested skills. |
| Alternative flows | A1: Fewer than 5 jobs share the user's skills → clear message instead of guessing. A2: User already covers their field → "strong coverage" message. |
| Postcondition | Result cached for 1 hour |

| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | The user's field shall be the 200 active jobs most similar to the profile (cosine ≥ 0.30) that share at least one of the user's skills; reposted jobs are counted once. | H |
| FR-5.2 | Candidate skills shall be the 15 skills most requested in the user's field that the user does not have. Skills the user already has shall never be suggested. | H |
| FR-5.3 | For each candidate the system shall re-embed the profile with that skill added and count jobs in the field that require the skill and newly reach a score of 60 or more ("jobs unlocked"). | H |
| FR-5.4 | The system shall show the top 5 gaps (by jobs unlocked, then demand) with up to 3 sample job titles each. | H |
| FR-5.5 | The system shall show a chart of the 8 most requested skills in the user's field, marking which the user has. | M |

### 3.6 UC-6 AI Proposal Assistant

| Field | Description |
|---|---|
| Actors | Freelancer, Agency owner, Agency member |
| Precondition | User has a profile; user opens a job |
| Main flow | 1. User chooses tone (professional, friendly, technical) and length (concise, standard, detailed). 2. System builds a prompt from the job and the user's real profile. 3. LLM returns a draft. 4. User copies, edits or regenerates it. |
| Alternative flows | A1: LLM fails, times out (30 s) or no key is configured → filled-in template draft clearly marked as a fallback. A2: Daily limit reached → message; template still available. |
| Postcondition | Draft stored in the user's proposal history |

| ID | Requirement | Priority |
|---|---|---|
| FR-6.1 | The system shall generate a proposal draft for a selected job using the configured LLM provider (Gemini or OpenAI, chosen by environment variable). | H |
| FR-6.2 | The prompt shall instruct the LLM not to invent experience, to mention only the user's real skills, and to end with a question to the client. | H |
| FR-6.3 | If the LLM is unavailable, the system shall return a template draft and mark it as a fallback. | H |
| FR-6.4 | Each user shall be limited to 20 AI drafts per day; failed AI calls and template fallbacks shall not count. | M |
| FR-6.5 | Every draft shall be stored and visible only in its owner's history. | M |
| FR-6.6 | Links in the draft that do not match the user's real portfolio links shall be corrected or removed. | M |

### 3.7 UC-7 Job ingestion

| ID | Requirement | Priority |
|---|---|---|
| FR-7.1 | The scheduler shall fetch new jobs from the Freelancer.com public API every 30 minutes. | H |
| FR-7.2 | The system shall fetch contract/freelance jobs from Himalayas (every 2 h), Remotive and Jobicy (every 6 h). | M |
| FR-7.3 | The system shall load a CSV dataset of real listings (494 Freelancer.com jobs, documented in `data/SOURCES.md`). | H |
| FR-7.4 | Every job shall be normalised to one format (title, description, skills, budget in USD, budget type, posted time, source, original URL) and embedded. | H |
| FR-7.5 | Jobs shall be de-duplicated by (source, external ID); an existing job shall be updated, not duplicated. | H |
| FR-7.6 | Freelancer.com and Upwork jobs shall become inactive 72 hours after posting; job-board jobs after 21 days. CSV and manual jobs shall never expire. | H |
| FR-7.7 | Only one fetch shall run at a time (lock), and a failed source shall not stop the others. Temporary API errors (HTTP 429/5xx) shall be retried. | M |
| FR-7.8 | An administrator shall be able to trigger ingestion manually and view job statistics. | L |

### 3.8 UC-8 Manual job paste

| ID | Requirement | Priority |
|---|---|---|
| FR-8.1 | A user shall be able to paste a job (title 3–300 characters, description 20–20,000 characters, up to 30 skills, optional budget) to get its Match Score. | M |
| FR-8.2 | Pasted jobs shall be private to that user and never expire. | M |
| FR-8.3 | Each user shall be limited to 20 pasted jobs per day and 200 in total. | M |

### 3.9 UC-9 Match feedback

| ID | Requirement | Priority |
|---|---|---|
| FR-9.1 | A user shall be able to mark a matched job as applied, won, lost or not relevant. | M |
| FR-9.2 | The system shall store the feedback with the score at that time, for training a future model. | M |
| FR-9.3 | A job marked "not relevant" shall be removed from the user's matches. | M |

### 3.10 UC-10 Team Chat (extra feature)

| ID | Requirement | Priority |
|---|---|---|
| FR-10.1 | Agency users shall have an agency channel, a thread per assigned job (owner + assignee) and direct messages. | L |
| FR-10.2 | Messages (1–2,000 characters) shall be delivered by polling and shown with unread counts. | L |
| FR-10.3 | A user shall be able to start a call, which posts a random Jitsi Meet link to the conversation. | L |
| FR-10.4 | After a member leaves or is removed, past conversations shall stay readable but closed for new messages. | L |
| FR-10.5 | Chat text shall be shown as plain text (never executed as HTML). | L |

---

## 4. External interface requirements

### 4.1 User interfaces
- UI-1: Public pages: landing page, register, login, verify email, forgot/reset password.
- UI-2: Profile wizard with 4 steps, a progress bar and skill autocomplete.
- UI-3: Dashboard with the top 5 matches shown as cards with a score ring, reason and skills.
- UI-4: Job detail page with score breakdown, proposal panel and feedback buttons.
- UI-5: Skill Gap page with a 3D skill chart and a ranked list of gaps.
- UI-6: Agency page with tabs: Routing, Pipeline, Team, Performance (owner); job queue (member).
- UI-7: Team Chat page and Settings page.
- UI-8: All pages shall work from 320 px to 1920 px width without horizontal scrolling and support keyboard navigation.

### 4.2 Software interfaces

| Interface | Purpose | Protocol |
|---|---|---|
| Freelancer.com Projects API | Live freelance jobs | HTTPS GET, JSON |
| Himalayas, Remotive, Jobicy APIs | Remote contract jobs | HTTPS GET, JSON |
| Google Gemini / OpenAI API | Proposal drafts | HTTPS POST, JSON |
| SMTP server or mail webhook | Verification, reset and invite emails | SMTP / HTTPS |
| Jitsi Meet | Video calls (link only) | HTTPS URL |
| PostgreSQL + pgvector | Data and vector search | SQL (SQLAlchemy) |
| Redis | Cache, rate limits, locks | Redis protocol |

### 4.3 Application programming interface
The backend exposes a REST API under the prefix `/api` with JSON bodies, documented automatically at
`/api/docs`. Protected routes require the header `Authorization: Bearer <access token>`. Errors use standard
HTTP codes: 400/422 invalid input, 401 not logged in, 403 not allowed, 404 not found, 409 conflict,
429 rate limit, 500 server error with a generic message.

### 4.4 Hardware and communication interfaces
No special hardware is required. All communication uses HTTPS in production.

---

## 5. Non-functional requirements

### 5.1 Performance

| ID | Requirement | Measured result |
|---|---|---|
| NFR-P1 | `GET /api/matches` shall respond within 1 second (p95) with 500+ active jobs. | p95 23 ms (525 jobs, test DB); p50 64 ms uncached on 1,486 real jobs |
| NFR-P2 | The system shall serve 50 concurrent users with no failed requests on one server worker. | 0 failures; p95 23 ms cached, 91 ms uncached (Locust, 60 s) |
| NFR-P3 | Skill Gap analysis shall complete within 5 seconds on a laptop-class server. | 219–290 ms on 1,486–3,074 jobs |
| NFR-P4 | The API with the NLP model shall run within 512 MB of memory. | Peak 329 MB |
| NFR-P5 | An AI proposal shall be returned within 30 seconds, otherwise a template is used. | 3–12 s with Gemini |

### 5.2 Security

| ID | Requirement |
|---|---|
| NFR-S1 | Every API route shall require a valid access token except register, login, refresh, verify, password reset and health. |
| NFR-S2 | Every input shall be validated with Pydantic; database access shall use bound parameters (no SQL injection). |
| NFR-S3 | Role-based access control shall restrict agency, routing and admin functions to the correct roles. |
| NFR-S4 | Rate limits: failed logins 5/min per IP+email and 10 per 15 min per email; reset emails 3/hour per address; sign-ups 10/hour per IP; invites 10/day; AI proposals 20/day; pasted jobs 20/day; chat messages 30/min; calls 10/hour. |
| NFR-S5 | The client IP for rate limits shall come from CF-Connecting-IP or the last X-Forwarded-For entry, never the first. |
| NFR-S6 | Stack traces shall never be returned to users; they shall be logged on the server. |
| NFR-S7 | Responses shall include security headers (Content-Security-Policy, X-Frame-Options DENY, nosniff, Referrer-Policy, HSTS in production). |
| NFR-S8 | Secrets shall only come from environment variables; no secret shall be stored in the repository. |
| NFR-S9 | In production the refresh cookie shall be `HttpOnly; Secure; SameSite=None; Partitioned`. |

### 5.3 Reliability and availability
- NFR-R1: The production system shall run 24/7 on free hosting; a keep-alive ping shall stop the free server from sleeping.
- NFR-R2: If a job source fails, the other sources and the rest of the system shall keep working.
- NFR-R3: If the LLM fails, the user shall still receive a usable (template) draft.
- NFR-R4: Database changes shall be applied only through versioned Alembic migrations.

### 5.4 Usability
- NFR-U1: A new user shall be able to register and see their first matches in under 5 minutes.
- NFR-U2: Every Match Score shall come with a plain-language reason.
- NFR-U3: The interface shall be responsive (320–1920 px) and keyboard accessible (WAI-ARIA tabs, focus states).
- NFR-U4: Error messages shall be plain language, never technical.

### 5.5 Maintainability and portability
- NFR-M1: Match Score weights and thresholds shall be kept in one configuration file (`app/core/config.py`).
- NFR-M2: Backend services shall have automated pytest tests run against a separate test database.
- NFR-M3: The backend shall be packaged as a Docker image; local development shall use docker-compose.
- NFR-M4: Code shall use type hints (Python) and TypeScript types, and be commented so each part can be explained.

### 5.6 Ethical and legal requirements
- NFR-E1: Only job sources with a public API or a published dataset shall be used; sources are cited in `data/SOURCES.md`.
- NFR-E2: Every job shall link to its original posting and credit its source.
- NFR-E3: No invented data shall be shown as real; synthetic data is used only in load tests and labelled.
- NFR-E4: The system shall not claim to predict the probability of winning a job.

---

## 6. Data requirements

### 6.1 Logical data model

| Entity | Key attributes | Relationships |
|---|---|---|
| User | id, email (unique), full_name, password_hash, role, is_verified, is_admin | has one Profile; has many Sessions, Proposals, Feedback |
| AuthSession | id, user_id, refresh_jti, previous_jti, expires_at, revoked_at | belongs to User |
| Profile | user_id, skills, experience_level, hourly_rate, bio, portfolio_urls, platforms, embedding (384) | belongs to User |
| Skill | name, category | dictionary for autocomplete |
| Job | source, external_id, title, description, skills, budget_min/max, budget_type, posted_at, url, is_active, embedding (384), created_by | unique (source, external_id) |
| MatchFeedback | user_id, job_id, outcome, score_at_feedback | User × Job |
| Proposal | user_id, job_id, tone, length, content, is_fallback, provider, model | User × Job |
| Agency | name, owner_id | has many AgencyMembers, Assignments |
| AgencyMember | agency_id, user_id, email, status, invite_token_hash, invite_sent_at, joined_at | User × Agency |
| Assignment | agency_id, job_id, member_id, status, score, assigned_by | Job × Member; at most one active per job |
| ChatMessage / ChatRead | agency_id, channel, sender_id, kind, body / last_read_at | belongs to Agency |

### 6.2 Data sources and retention
- Live jobs: Freelancer.com and job-board APIs; kept in the database and marked inactive after expiry.
- Seed data: `data/jobs_seed.csv`, 494 real Freelancer.com listings captured on 28 October 2026 via the public API.
- User data is stored only for the features above; passwords are never stored in plain text; invite tokens
  are stored as hashes.

---

## 7. Verification: test cases

The SRS test cases are implemented as automated tests in `backend/tests/test_srs_cases.py`. The complete
suite (245 tests) passed on 18 November 2026. Full measurements are in `TEST_RESULTS.md`.

| ID | Test case | Requirement(s) | Input / steps | Expected result | Actual result | Status |
|---|---|---|---|---|---|---|
| TC-1 | Registration | FR-1.1, FR-1.3 | Register a new user with valid data | 201, token returned, bcrypt cost-12 hash stored | 201, token returned, hash starts with `$2b$12$` | PASS |
| TC-2 | Duplicate email | FR-1.2 | Register the same email in different letter case | 409 "Email is already registered"; one user in DB | 409; exactly 1 user | PASS |
| TC-3 | Ranked matches | FR-3.1–3.3 | React profile; React and Python jobs in DB | 5 matches sorted by score, each with a reason; React job first | 5 sorted matches; "React analytics dashboard" ranked #1 | PASS |
| TC-4 | Skill gap | FR-5.1–5.4 | Profile with React; field jobs requiring Shopify | Demand counted; owned skills never suggested; ≤ 3 samples | Shopify demand 2; no owned skills suggested | PASS |
| TC-5 | Proposal generation (LLM mocked) | FR-6.1, FR-6.5 | Generate a proposal with a mocked LLM | 200, draft returned, not a fallback, saved | 200, `is_fallback = false`, saved | PASS |
| TC-6 | Agency routing | FR-4.3, FR-4.4 | Agency with a Python and a React member; Django and React jobs | Python job → Python member; React job → React member | Django → "Py Dev"; React → "React Dev" | PASS |
| TC-7 | Performance | NFR-P1 | 20 uncached `/matches` calls with 500+ jobs | p95 < 1,000 ms | 525 jobs: p50 15.6 ms, p95 23.0 ms | PASS |
| TC-8 | SQL injection on login | NFR-S2 | Login with payloads such as `' OR 1=1 --` | 401/422, no token, users table intact | 401 for all payloads; table intact | PASS |

Additional verification: security tests (every protected endpoint returns 401 without a token), Locust load
test (50 users, 0 failures), Playwright end-to-end browser walk-through (11/11 steps, 0 JavaScript errors on the
local and live system), and audits whose findings were reproduced, fixed and covered by tests.

---

## 8. Requirements traceability matrix

| Requirement | Use case | Implementation (backend) | Verification |
|---|---|---|---|
| FR-1.1 – FR-1.10 | UC-1 | `routers/auth.py`, `core/security.py`, `services/sessions.py`, `services/email.py` | TC-1, TC-2, TC-8; `test_auth.py`, `test_auth_sessions.py`, `test_password_reset.py` |
| FR-2.1 – FR-2.6 | UC-2 | `routers/profile.py`, `services/profiles.py`, `services/embeddings.py`, `services/skill_utils.py` | `test_profile.py`, `test_embeddings.py` |
| FR-3.1 – FR-3.8 | UC-3 | `routers/matches.py`, `services/matching.py`, `services/scoring.py` | TC-3, TC-7; `test_matching.py`, `test_scoring.py` |
| FR-4.1 – FR-4.12 | UC-4 | `routers/agency.py`, `services/agency.py`, `services/routing.py` | TC-6; `test_agency.py`, `test_agency_audit.py` |
| FR-5.1 – FR-5.5 | UC-5 | `routers/skill_gap.py`, `services/skill_gap.py` | TC-4; `test_skill_gap.py` |
| FR-6.1 – FR-6.6 | UC-6 | `routers/proposals.py`, `services/proposals.py`, `services/llm.py` | TC-5; `test_proposals.py` |
| FR-7.1 – FR-7.8 | UC-7 | `services/ingestion.py`, `services/scheduler.py`, `services/sources/*`, `routers/admin.py` | `test_ingestion.py`, `test_job_boards.py` |
| FR-8.1 – FR-8.3 | UC-8 | `routers/jobs.py` | `test_ingestion.py`, `test_review_fixes.py` |
| FR-9.1 – FR-9.3 | UC-9 | `routers/matches.py` | `test_matching.py` |
| FR-10.1 – FR-10.5 | UC-10 | `routers/chat.py`, `services/chat.py` | `test_chat.py`, `test_agency_audit.py` |
| NFR-P1 – NFR-P5 | — | caching, HNSW index, batching | TC-7; benchmark script; Locust; memory test |
| NFR-S1 – NFR-S9 | — | `main.py`, `core/security.py`, `core/deps.py`, `core/redis_client.py` (rate limits) | TC-8; `test_security.py`, `test_review_fixes.py` |

---

## 9. Appendix A — Match Score model

```
score    = round(100 * (W_SEM * semantic + fit_gate * (W_BUDGET * budget_fit + W_RECENCY * recency)))
fit_gate = min(1, semantic / 0.6)
W_SEM = 0.70, W_BUDGET = 0.15, W_RECENCY = 0.15
```

| Component | Definition |
|---|---|
| semantic | Cosine similarity between profile and job embeddings, clipped to [0.15, 0.65] and scaled to 0–1. The bounds were chosen from the measured cosine distribution on the real job dataset. |
| budget_fit (hourly) | 1.0 if the user's rate is inside [budget_min, budget_max]; falls linearly to 0 at 50 % outside the range. |
| budget_fit (fixed) | Estimated hours = budget_max ÷ hourly rate; 1.0 for 5–200 hours, falling outside that range; 0 below 1 hour. |
| budget_fit (unknown) | 0.5 (neutral) when the budget or the user's rate is unknown. |
| recency (live sources) | 1.0 during the first 1/12 of the job's lifetime, then linear down to 0 at expiry. |
| recency (CSV / manual) | 0 for the CSV snapshot (must never beat a live job); 0.5 for manual jobs. |
| fit_gate | Budget and recency only count fully when the job fits the profile (semantic ≥ 0.6), so a fresh, well-paid job from an unrelated field cannot score high. |

The weights are heuristic and documented as tunable. A trained model can replace them once enough feedback
(FR-9.2) has been collected.

---

## 10. Appendix B — Glossary

| Term | Meaning |
|---|---|
| Agency | A group of freelancers led by an owner, who receives jobs routed by FitWork |
| bcrypt | A slow, salted password-hashing algorithm |
| Cosine similarity | A measure of how similar two vectors are (1 = same direction) |
| Embedding | A list of 384 numbers representing the meaning of a text |
| Fit gate | Rule that reduces the effect of budget and recency for jobs that do not fit the profile |
| HNSW | Hierarchical Navigable Small World — the fast approximate nearest-neighbour index used by pgvector |
| JWT | JSON Web Token, a signed token proving the user is logged in |
| LLM | Large Language Model (e.g. Gemini), used to draft proposals |
| Match Score | 0–100 number showing how well a job fits a profile (not a win probability) |
| MiniLM | all-MiniLM-L6-v2, a small sentence-embedding model |
| pgvector | PostgreSQL extension for storing and searching vectors |
| Routing | Choosing the best agency member for a job |
| Skill gap | A skill the user does not have that many jobs in their field require |
| Synthetic data | Generated test data, used only for load testing and always labelled |
