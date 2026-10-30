"""
Run one Freelancer.com ingestion from the command line.

Usage (from /backend):
    .venv\\Scripts\\python.exe -m app.scripts.fetch_jobs            # 3 pages x 100 newest jobs
    .venv\\Scripts\\python.exe -m app.scripts.fetch_jobs --pages 10
    .venv\\Scripts\\python.exe -m app.scripts.fetch_jobs --source himalayas   # or remotive / jobicy
"""
import argparse
import logging

from app.core.database import SessionLocal
from app.services.ingestion import run_freelancer_ingestion, run_job_board_ingestion


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", type=int, default=3)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--source", default="freelancer", choices=["freelancer", "himalayas", "remotive", "jobicy"])
    args = parser.parse_args()
    db = SessionLocal()
    try:
        if args.source == "freelancer":
            stats = run_freelancer_ingestion(db, pages=args.pages, start_offset=args.offset)
        else:
            stats = run_job_board_ingestion(db, args.source)
    finally:
        db.close()
    print(f"{args.source}: fetched {stats.fetched}, new {stats.inserted}, updated {stats.updated}, "
          f"deactivated {stats.deactivated} ({stats.seconds}s)")


if __name__ == "__main__":
    main()
