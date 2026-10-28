# FitWork demo accounts

All accounts use the same password: **`Demo-JQhJBMoH4Z7`**
(Demo personas only — not real people. Emails are pre-verified and every profile is complete.)

| Role | Name | Email | Main skills |
|---|---|---|---|
| Solo freelancer | Ayesha Malik | `freelancer.demo@example.com` | React, TypeScript, Node.js, Tailwind CSS |
| Agency owner (admin) | Omar Siddiqui | `owner.demo@example.com` | Project Management, WordPress, SEO Optimization |
| Agency member | Bilal Ahmed | `member.demo@example.com` | Python, Django, Web Scraping, Pandas |
| Agency member | Hira Khan | `designer.demo@example.com` | Logo Design, Adobe Illustrator, Brand Identity, Figma |

The agency owner's agency is **Indus Digital Studio**; both members already belong to it.

## Suggested demo flow (about 6 minutes)
1. **Solo freelancer** → Matches: top 5 jobs, colour-coded Match Score, reason, matched skills.
2. Open a job → score breakdown (semantic / budget / recency) → *Generate proposal* → change tone → copy.
3. *Paste a job* → paste any listing text → it is scored immediately.
4. **Skill Gap** → radar + "Add X → unlocks N more jobs".
5. Log in as **agency owner** → Agency: team table, routing (Python job → Bilal, design job → Hira) → *Approve* / *Override*.
6. Log in as **Bilal (member)** → My Job Queue → *Decline* → back as owner: the job is re-routed to the next best member.
7. Settings (owner) → invite a member → copy the one-time invite link.

Recreate or reset these accounts: `python -m app.scripts.create_demo_accounts` (from /backend, with DATABASE_URL set).
