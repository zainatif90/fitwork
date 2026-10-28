"""
Measure GET /api/matches response time against a running server.

Usage (server must be running; from /backend):
    .venv\\Scripts\\python.exe -m app.scripts.benchmark_matches --base http://localhost:8000 --runs 30
Creates a temporary benchmark user, measures uncached (refresh=true) and cached calls, then deletes the user.
"""
import argparse
import statistics
import time
import uuid

import httpx
from sqlalchemy import delete, func, select

from app.core.database import SessionLocal
from app.models.job import Job
from app.models.user import User


def pct(values: list[float], p: float) -> float:
    ordered = sorted(values)
    k = max(0, min(len(ordered) - 1, round(p / 100 * (len(ordered) - 1))))
    return ordered[k]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:8000")
    parser.add_argument("--runs", type=int, default=30)
    args = parser.parse_args()

    db = SessionLocal()
    active = db.scalar(select(func.count()).select_from(Job).where(Job.is_active.is_(True)))
    email = f"bench-{uuid.uuid4().hex[:8]}@example.com"
    with httpx.Client(base_url=args.base, timeout=30) as c:
        token = c.post("/api/auth/register", json={"email": email, "password": "Bench12345", "full_name": "Benchmark"}).json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        c.put("/api/profile/me", headers=h, json={
            "skills": ["React", "TypeScript", "Node.js", "Tailwind CSS"], "experience_level": "expert",
            "hourly_rate": 30, "bio": "Full-stack JavaScript developer."})

        def timed(params: dict) -> float:
            t = time.perf_counter()
            r = c.get("/api/matches", headers=h, params=params)
            r.raise_for_status()
            return (time.perf_counter() - t) * 1000

        timed({"refresh": True})  # warm-up
        uncached = [timed({"refresh": True}) for _ in range(args.runs)]
        cached = [timed({}) for _ in range(args.runs)]

    db.execute(delete(User).where(User.email == email))
    db.commit()
    db.close()

    print(f"Active jobs in database: {active}   runs: {args.runs} each")
    for name, vals in (("uncached (pgvector + scoring)", uncached), ("cached (Redis)", cached)):
        print(f"{name:32} p50={statistics.median(vals):7.1f} ms   p95={pct(vals, 95):7.1f} ms   max={max(vals):7.1f} ms")


if __name__ == "__main__":
    main()
