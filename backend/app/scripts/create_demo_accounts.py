"""
Create (or refresh) the demo accounts used in the viva / live demo, and write DEMO.md.

Usage (from /backend; point DATABASE_URL at the database you want, e.g. production):
    .venv\\Scripts\\python.exe -m app.scripts.create_demo_accounts
    $env:DEMO_PASSWORD="..."; .venv\\Scripts\\python.exe -m app.scripts.create_demo_accounts   # choose the password

Safe to run again: existing demo users get their profile/password refreshed, nothing is duplicated.
The accounts are demo personas (not real people). Profiles are complete and emails are pre-verified.
"""
import os
import secrets
import string
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.agency import Agency, AgencyMember
from app.models.user import User
from app.schemas.profile import ProfileIn
from app.services.profiles import save_profile

AGENCY_NAME = "Indus Digital Studio"

ACCOUNTS = [
    {
        "key": "freelancer", "email": "freelancer.demo@example.com", "full_name": "Ayesha Malik", "role": "freelancer",
        "profile": {"skills": ["React", "TypeScript", "Node.js", "Tailwind CSS", "Next.js"], "experience_level": "expert",
                    "hourly_rate": 25, "platforms": ["Upwork", "Freelancer.com"],
                    "bio": "Full-stack JavaScript developer. I build fast, accessible dashboards and web apps with React, Next.js and Node.js."},
    },
    {
        "key": "owner", "email": "owner.demo@example.com", "full_name": "Omar Siddiqui", "role": "agency_owner",
        "profile": {"skills": ["Project Management", "WordPress", "SEO Optimization"], "experience_level": "expert",
                    "hourly_rate": 35, "platforms": ["Freelancer.com"],
                    "bio": "I run a small digital agency and manage client projects end to end."},
    },
    {
        "key": "member", "email": "member.demo@example.com", "full_name": "Bilal Ahmed", "role": "agency_member",
        "profile": {"skills": ["Python", "Django", "Web Scraping", "Pandas", "PostgreSQL"], "experience_level": "expert",
                    "hourly_rate": 22, "platforms": ["Freelancer.com"],
                    "bio": "Python developer: web scraping, data pipelines, Django REST APIs and automation scripts."},
    },
    {
        "key": "member2", "email": "designer.demo@example.com", "full_name": "Hira Khan", "role": "agency_member",
        "profile": {"skills": ["Logo Design", "Adobe Illustrator", "Brand Identity", "Figma", "Graphic Design"],
                    "experience_level": "intermediate", "hourly_rate": 18, "platforms": ["Fiverr"],
                    "bio": "Brand designer creating logos, brand kits and social media graphics."},
    },
]


def make_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "Demo-" + "".join(secrets.choice(alphabet) for _ in range(10)) + "7"


def main() -> None:
    password = os.getenv("DEMO_PASSWORD") or make_password()
    db = SessionLocal()
    users: dict[str, User] = {}
    try:
        for acc in ACCOUNTS:
            user = db.scalar(select(User).where(User.email == acc["email"]))
            if user is None:
                user = User(email=acc["email"], full_name=acc["full_name"], role=acc["role"])
                db.add(user)
            user.full_name = acc["full_name"]
            user.role = acc["role"]
            user.password_hash = hash_password(password)
            user.is_verified = True
            db.commit()
            db.refresh(user)
            save_profile(db, user.id, ProfileIn(**acc["profile"]))
            users[acc["key"]] = user

        owner = users["owner"]
        agency = db.scalar(select(Agency).where(Agency.owner_id == owner.id))
        if agency is None:
            agency = Agency(owner_id=owner.id, name=AGENCY_NAME)
            db.add(agency)
            db.commit()
            db.refresh(agency)
        for key in ("member", "member2"):
            u = users[key]
            row = db.scalar(select(AgencyMember).where(AgencyMember.user_id == u.id))
            if row is None:
                db.add(AgencyMember(agency_id=agency.id, user_id=u.id, email=u.email, status="active",
                                    joined_at=datetime.now(timezone.utc)))
        owner.is_admin = True  # the demo owner can trigger an ingestion run
        db.commit()
    finally:
        db.close()

    write_demo_md(password)
    print("Demo accounts ready. Password:", password)


def write_demo_md(password: str) -> None:
    labels = {"freelancer": "Solo freelancer", "owner": "Agency owner (admin)",
              "member": "Agency member", "member2": "Agency member"}
    rows = "\n".join(
        f"| {labels[a['key']]} | {a['full_name']} | `{a['email']}` | {', '.join(a['profile']['skills'][:4])} |"
        for a in ACCOUNTS
    )
    text = f"""# FitWork demo accounts

All accounts use the same password: **`{password}`**
(Demo personas only — not real people. Emails are pre-verified and every profile is complete.)

| Role | Name | Email | Main skills |
|---|---|---|---|
{rows}

The agency owner's agency is **{AGENCY_NAME}**; both members already belong to it.

## Suggested demo flow (about 6 minutes)
1. **Solo freelancer** → Matches: top 5 jobs, colour-coded Match Score, reason, matched skills.
2. Open a job → score breakdown (semantic / budget / recency) → *Generate proposal* → change tone → copy.
3. *Paste a job* → paste any listing text → it is scored immediately.
4. **Skill Gap** → radar + "Add X → unlocks N more jobs".
5. Log in as **agency owner** → Agency: team table, routing (Python job → Bilal, design job → Hira) → *Approve* / *Override*.
6. Log in as **Bilal (member)** → My Job Queue → *Decline* → back as owner: the job is re-routed to the next best member.
7. Settings (owner) → invite a member → copy the one-time invite link.

Recreate or reset these accounts: `python -m app.scripts.create_demo_accounts` (from /backend, with DATABASE_URL set).
"""
    Path(__file__).resolve().parents[3].joinpath("DEMO.md").write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
