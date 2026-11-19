r"""
Smoothness probe for the website (Playwright). Measures, per page: time until the content is visible, "long tasks"
(main thread busy > 50 ms = the page cannot react to clicks), frames per second while idle and while scrolling,
and how many CSS/JS animations run at the same time. Runs at normal CPU speed and with the CPU slowed 4x
(Chrome DevTools throttling), which is close to a mid-range laptop or phone.

It registers a temporary account and deletes it again at the end (Settings -> Danger zone).
Run:  e2e\.venv\Scripts\python e2e\perf_probe.py [base_url]      (default: the live site)
"""
import json
import sys
import time
import urllib.request
import uuid

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://fitwork-zain2026.web.app").rstrip("/")
PASSWORD = "Probe" + uuid.uuid4().hex[:6] + "7"
EMAIL = f"perf-{uuid.uuid4().hex[:8]}@example.com"
API = "https://fitwork-api-zain2026.onrender.com/api" if "web.app" in BASE else f"{BASE}/api"


def delete_account() -> None:
    """Always remove the temporary account, even when a step above failed (login + DELETE /api/auth/me)."""
    def call(method: str, path: str, body: dict, token: str | None = None) -> dict:
        req = urllib.request.Request(f"{API}{path}", method=method, data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 FitWork-probe",
                                              **({"Authorization": f"Bearer {token}"} if token else {})})
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    try:
        token = call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})["access_token"]
        call("DELETE", "/auth/me", {"password": PASSWORD}, token)
        print("temporary account deleted:", EMAIL)
    except Exception as exc:  # e.g. never registered, or already deleted through the UI
        print("clean-up:", EMAIL, "->", exc)

INIT = """
window.__lt = [];
new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({type: 'longtask', buffered: true});
window.__fps = (ms) => new Promise(r => { let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else r(Math.round(n * 1000 / (performance.now() - t0))); };
  requestAnimationFrame(f); });
window.__scrollFps = async () => { const p = window.__fps(2000); const el = document.scrollingElement;
  for (let i = 0; i < 40; i++) { el.scrollBy(0, i < 20 ? 60 : -60); await new Promise(r => setTimeout(r, 50)); } return p; };
"""


def measure(page, name: str, ready_selector: str, action=None) -> dict:
    page.evaluate("window.__lt = []")
    t0 = time.perf_counter()
    if action:
        action()
    page.locator(ready_selector).first.wait_for(timeout=90000)
    ready = time.perf_counter() - t0
    page.mouse.move(2, 2)                                        # no hover effects while measuring
    page.wait_for_timeout(1500)                                  # let entrance animations finish
    idle_fps = page.evaluate("window.__fps(2000)")
    scroll_fps = page.evaluate("window.__scrollFps()")
    lt = page.evaluate("window.__lt")
    anims = page.evaluate("document.getAnimations().filter(a => a.playState === 'running').length")
    row = {"page": name, "ready_s": round(ready, 2), "long_tasks": len(lt), "blocked_ms": round(sum(lt)),
           "worst_task_ms": round(max(lt) if lt else 0), "idle_fps": idle_fps, "scroll_fps": scroll_fps, "animations": anims}
    print(json.dumps(row))
    return row


def run(cpu_slowdown: int, browser) -> list[dict]:
    ctx = browser.new_context(viewport={"width": 1366, "height": 768})
    ctx.add_init_script(INIT)
    page = ctx.new_page()
    cdp = ctx.new_cdp_session(page)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": cpu_slowdown})
    print(f"\n--- CPU x{cpu_slowdown} ---")
    rows = []
    page.goto(f"{BASE}/login")
    page.fill("#email", EMAIL)
    page.fill("#password", PASSWORD)
    rows.append(measure(page, "login -> dashboard", "text=Your top matches",
                        lambda: page.get_by_role("button", name="Log in").click()))
    page.get_by_text("View details", exact=True).first.wait_for(timeout=90000)
    rows.append(measure(page, "job detail", "text=Match Score",
                        lambda: page.locator('a[href^="/app/jobs/"]').first.click()))
    rows.append(measure(page, "skill gap", "text=Skills that unlock the most jobs",
                        lambda: page.get_by_role("link", name="Skill Gap", exact=True).click()))
    rows.append(measure(page, "agency", "h1", lambda: page.get_by_role("link", name="Agency", exact=True).first.click()))
    rows.append(measure(page, "settings", "text=Freelancer profile",
                        lambda: page.get_by_role("link", name="Settings", exact=True).click()))
    rows.append(measure(page, "skill gap again (revisit)", "text=Skills that unlock the most jobs",
                        lambda: page.get_by_role("link", name="Skill Gap", exact=True).click()))
    rows.append(measure(page, "settings again (revisit)", "text=Freelancer profile",
                        lambda: page.get_by_role("link", name="Settings", exact=True).click()))
    rows.append(measure(page, "back to dashboard", "text=Your top matches",
                        lambda: page.get_by_role("link", name="Matches", exact=True).first.click()))
    ctx.close()
    return rows


print('temporary account:', EMAIL)
try:
  with sync_playwright() as p:
      browser = p.chromium.launch()
      # one-time setup: register + profile through the real UI
      ctx = browser.new_context(viewport={"width": 1366, "height": 768})
      page = ctx.new_page()
      page.goto(f"{BASE}/register")
      page.fill("#full_name", "Perf Probe")
      page.fill("#email", EMAIL)
      page.fill("#password", PASSWORD)
      page.get_by_role("button", name="Create account").click()
      page.wait_for_url("**/onboarding", timeout=60000)
      box = page.get_by_label("Add a skill")
      for s in ["React", "TypeScript", "Tailwind CSS", "Node.js", "Next.js"]:
          box.fill(s)
          page.get_by_role("option").first.wait_for()
          box.press("Enter")
      # new: Import skills from GitHub (public test account)
      page.get_by_label("GitHub username").fill("octocat")
      page.get_by_role("button", name="Find my skills").click()
      done = page.get_by_text("public repositories of").or_(page.get_by_role("alert"))
      done.first.wait_for(timeout=30000)
      print("github import:", done.first.inner_text()[:100])
      if page.get_by_role("button", name="Add all").count():
          page.get_by_role("button", name="Add all").click()
      page.get_by_role("button", name="Continue").click()
      page.get_by_role("radio", name="Expert").click()
      page.fill("#rate", "25")
      page.get_by_role("button", name="Continue").click()
      page.fill("#bio", "Full-stack JavaScript developer building dashboards and web apps with React, Next.js and Node.js.")
      page.get_by_role("button", name="Continue").click()
      page.get_by_role("button", name="Finish setup").click()
      saved = time.perf_counter()
      page.wait_for_url("**/app", timeout=60000)
      page.get_by_text("Your top matches").wait_for(timeout=90000)
      page.wait_for_timeout(20000)        # a user reading their matches for 20 s while Skill Gap pre-calculates
      t0 = time.perf_counter()
      page.get_by_role("link", name="Skill Gap", exact=True).click()
      page.get_by_text("Skills that unlock the most jobs").wait_for(timeout=120000)
      print(f"skill gap first open: {time.perf_counter() - t0:.1f}s (opened {t0 - saved:.0f}s after saving the profile)")
      page.get_by_role("button", name="Log out").first.click() if page.get_by_role("button", name="Log out").count() else None
      ctx.close()

      results = {1: run(1, browser), 4: run(4, browser)}

      # clean up: delete the temporary account through the UI
      ctx = browser.new_context(viewport={"width": 1366, "height": 768})
      page = ctx.new_page()
      page.goto(f"{BASE}/login")
      page.fill("#email", EMAIL)
      page.fill("#password", PASSWORD)
      page.get_by_role("button", name="Log in").click()
      page.wait_for_url("**/app**", timeout=60000)
      page.goto(f"{BASE}/app/settings")
      page.get_by_role("button", name="Delete my account").click()
      page.fill("#delete-password", PASSWORD)
      page.get_by_role("button", name="Delete permanently").click()
      page.wait_for_url(f"{BASE}/", timeout=30000)
      print("\ntemporary account deleted:", EMAIL)
      browser.close()
finally:
    delete_account()
