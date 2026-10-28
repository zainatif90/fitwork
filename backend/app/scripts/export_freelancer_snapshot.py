"""
Build the CSV seed dataset from a snapshot of REAL public Freelancer.com listings.

Why: live jobs expire after 72h, so the demo needs a stable dataset that never disappears.
This script saves real listings (not invented data) in our CSV format; SOURCES.md records
when the snapshot was taken.

Usage (from /backend):
    .venv\\Scripts\\python.exe -m app.scripts.export_freelancer_snapshot ..\\data\\jobs_seed.csv --count 500 --offset 1200
`--offset` skips the newest listings so the seed does not overlap with what the live fetch pulls in.
"""
import argparse
import csv
import logging

from app.services.sources.csv_source import CSV_COLUMNS
from app.services.sources.freelancer import FreelancerClient


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("out")
    parser.add_argument("--count", type=int, default=500)
    parser.add_argument("--offset", type=int, default=1200)
    args = parser.parse_args()

    page_size = 100
    pages = (args.count + page_size - 1) // page_size
    jobs = FreelancerClient().fetch_active(pages=pages, page_size=page_size, start_offset=args.offset)[: args.count]

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for j in jobs:
            writer.writerow({
                "external_id": f"fl-{j.external_id}",
                "title": j.title,
                "description": j.description,
                "skills": ";".join(j.skills),
                "budget_min": "" if j.budget_min is None else j.budget_min,
                "budget_max": "" if j.budget_max is None else j.budget_max,
                "budget_type": j.budget_type,
                "currency": "USD",
                "client_country": j.client_country or "",
                "proposals_count": "" if j.proposals_count is None else j.proposals_count,
                "posted_at": j.posted_at.isoformat().replace("+00:00", "Z"),
                "url": j.url or "",
            })
    print(f"Wrote {len(jobs)} real Freelancer.com listings to {args.out}")


if __name__ == "__main__":
    main()
