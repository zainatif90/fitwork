r"""End-to-end UI walk-through with screenshots (Playwright). Needs both dev servers running.

Setup once:  py -3.11 -m venv e2e\.venv; e2e\.venv\Scripts\pip install playwright; e2e\.venv\Scripts\playwright install chromium
Run:         e2e\.venv\Scripts\python e2e\walkthrough.py     (screenshots go to e2e/shots/)
It creates test users with random emails; delete them afterwards if you like.
"""
import json
import sys
import time
import urllib.request
import uuid
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = "http://localhost:5173"
OUT = Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)
RUN = uuid.uuid4().hex[:6]
errors: list[str] = []


def api(method: str, path: str, body: dict | None = None, token: str | None = None) -> dict:
    req = urllib.request.Request(f"{BASE}/api{path}", method=method, data=json.dumps(body).encode() if body else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt else {}


def shot(page, name: str) -> None:
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
    print("saved", name)


def login_ui(page, email: str) -> None:
    page.goto(f"{BASE}/login")
    page.fill("#email", email)
    page.fill("#password", "Demo12345")
    page.get_by_role("button", name="Log in").click()
    page.wait_for_url("**/app**")


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}") if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    # 1. Register through the UI
    page.goto(f"{BASE}/register")
    shot(page, "01_register")
    email = f"e2e-{RUN}@example.com"
    page.fill("#full_name", "Ayesha Malik")
    page.fill("#email", email)
    page.fill("#password", "Demo12345")
    page.get_by_role("button", name="Create account").click()
    page.wait_for_url("**/onboarding")

    # 2. Wizard
    skill_box = page.get_by_label("Add a skill")
    for skill in ["React", "TypeScript", "Tailwind CSS", "Node.js"]:
        skill_box.fill(skill)
        page.get_by_role("option").first.wait_for()
        skill_box.press("Enter")
    shot(page, "02_wizard_skills")
    page.get_by_role("button", name="Continue").click()
    page.get_by_role("radio", name="Expert").click()
    page.fill("#rate", "25")
    shot(page, "03_wizard_rate")
    page.get_by_role("button", name="Continue").click()
    page.fill("#bio", "Full-stack JavaScript developer. I build fast dashboards and web apps with React and Node.js.")
    page.get_by_role("button", name="Continue").click()
    page.get_by_role("button", name="Upwork").click()
    page.get_by_role("button", name="Freelancer.com").click()
    page.get_by_role("button", name="Finish setup").click()

    # 3. Dashboard
    page.wait_for_url("**/app")
    expect(page.get_by_text("Your top matches")).to_be_visible(timeout=15000)
    page.get_by_text("View details →").first.wait_for()
    shot(page, "04_dashboard")

    # 4. Job detail + proposal (fallback, no LLM key)
    page.get_by_text("View details →").first.click()
    page.get_by_text("Match Score").first.wait_for()
    page.get_by_role("button", name="Generate proposal").click()
    page.get_by_label("Proposal draft").wait_for(timeout=40000)
    shot(page, "05_job_detail_proposal")

    # 5. Skill gap
    page.get_by_role("link", name="Skill Gap").click()
    page.get_by_text("Skills that unlock the most jobs").wait_for(timeout=20000)
    shot(page, "06_skill_gap")

    # 6. Settings
    page.get_by_role("link", name="Settings").click()
    page.get_by_role("heading", name="Freelancer profile").wait_for()
    shot(page, "07_settings")

    # 7. Mobile dashboard
    mob = browser.new_context(viewport={"width": 390, "height": 844}, storage_state=ctx.storage_state())
    mp = mob.new_page()
    mp.goto(f"{BASE}/app")
    mp.get_by_text("Your top matches").wait_for(timeout=15000)
    shot(mp, "08_mobile_dashboard")
    mob.close()

    # 8. Agency: owner + 2 members created via API, then the owner views the dashboard in the UI
    owner_email = f"owner-{RUN}@example.com"
    owner = api("POST", "/auth/register", {"email": owner_email, "password": "Demo12345", "full_name": "Omar Siddiqui", "role": "agency_owner"})["access_token"]
    members = [
        (f"pyra-{RUN}@example.com", "Bilal Ahmed", {"skills": ["Python", "Django", "Web Scraping", "Pandas"], "experience_level": "expert", "hourly_rate": 25, "bio": "Python developer for scraping, APIs and automation."}),
        (f"rex-{RUN}@example.com", "Sana Iqbal", {"skills": ["React", "Next.js", "TypeScript", "Tailwind CSS"], "experience_level": "expert", "hourly_rate": 25, "bio": "Frontend developer building React and Next.js apps."}),
        (f"des-{RUN}@example.com", "Hira Khan", {"skills": ["Logo Design", "Adobe Illustrator", "Brand Identity", "Figma"], "experience_level": "intermediate", "hourly_rate": 18, "bio": "Brand designer: logos, brand kits and social media graphics."}),
    ]
    member_tokens = []
    for em, name, prof in members:
        link = api("POST", "/agency/invite", {"email": em}, owner)["invite_link"]
        t = api("POST", "/auth/register", {"email": em, "password": "Demo12345", "full_name": name})["access_token"]
        api("POST", "/agency/invite/accept", {"token": link.rsplit("/", 1)[1]}, t)
        api("PUT", "/profile/me", prof, t)
        member_tokens.append((em, t))
    recs = api("GET", "/agency/routing", token=owner)
    first = recs[0]
    api("POST", "/agency/assign", {"job_id": first["job"]["id"], "member_id": first["recommended"]["member_id"]}, owner)

    oc = browser.new_context(viewport={"width": 1440, "height": 900})
    op = oc.new_page()
    op.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    login_ui(op, owner_email)
    op.get_by_role("link", name="Agency").click()
    op.get_by_role("heading", name="Routing recommendations").wait_for(timeout=20000)
    shot(op, "09_agency_owner")
    op.get_by_role("link", name="Settings").click()
    op.get_by_role("heading", name="Agency settings").wait_for()
    shot(op, "10_agency_settings")
    oc.close()

    # 9. Member queue
    assigned_email = next(em for em, t in member_tokens if api("GET", "/agency/queue", token=t))
    mc = browser.new_context(viewport={"width": 1440, "height": 900})
    mpage = mc.new_page()
    login_ui(mpage, assigned_email)
    mpage.get_by_role("link", name="Agency").click()
    mpage.get_by_role("heading", name="My Job Queue").wait_for(timeout=15000)
    shot(mpage, "11_member_queue")
    mc.close()

    browser.close()

print("RUN", RUN)
print("ERRORS:", errors if errors else "none")
sys.exit(1 if errors else 0)
