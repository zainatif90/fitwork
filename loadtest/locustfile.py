"""
Load test: 50 concurrent users calling GET /api/matches.

Each simulated user registers once (unique email), saves a profile from one of six personas,
then repeatedly asks for matches. Two scenarios, chosen with the LOAD_MODE env var:
    LOAD_MODE=cached    normal behaviour (Redis cache allowed)          [default]
    LOAD_MODE=uncached  worst case: ?refresh=true on every call (pgvector + scoring each time)

Run (API must be running on :8000), from the repo root:
    $env:LOAD_MODE="uncached"
    backend\\.venv\\Scripts\\locust.exe -f loadtest\\locustfile.py --host http://localhost:8000 `
        --headless -u 50 -r 10 -t 60s --csv loadtest\\results\\uncached
Afterwards delete the load-test users:  backend\\.venv\\Scripts\\python.exe loadtest\\cleanup.py
"""
import os
import random
import uuid

from locust import HttpUser, between, task

MODE = os.getenv("LOAD_MODE", "cached")

PERSONAS = [
    (["React", "TypeScript", "Tailwind CSS"], "Frontend developer building dashboards."),
    (["Python", "Django", "PostgreSQL"], "Backend developer building APIs."),
    (["Logo Design", "Adobe Illustrator", "Brand Identity"], "Brand and logo designer."),
    (["Content Writing", "Copywriting", "SEO Writing"], "Writer for blogs and websites."),
    (["WordPress", "PHP", "WooCommerce"], "WordPress and WooCommerce developer."),
    (["Video Editing", "Adobe Premiere Pro", "Motion Graphics"], "Video editor for social media."),
]


class FreelancerUser(HttpUser):
    wait_time = between(1, 3)  # think time between requests, like a real user

    def on_start(self) -> None:
        email = f"load-{uuid.uuid4().hex[:10]}@loadtest.example.com"
        res = self.client.post("/api/auth/register", name="setup: register",
                               json={"email": email, "password": "LoadTest123", "full_name": "Load Tester"})
        self.headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
        skills, bio = random.choice(PERSONAS)
        self.client.put("/api/profile/me", name="setup: profile", headers=self.headers,
                        json={"skills": skills, "experience_level": "intermediate", "hourly_rate": 25, "bio": bio})

    @task
    def matches(self) -> None:
        params = {"refresh": "true"} if MODE == "uncached" else None
        self.client.get("/api/matches", params=params, headers=self.headers, name=f"GET /api/matches ({MODE})")
