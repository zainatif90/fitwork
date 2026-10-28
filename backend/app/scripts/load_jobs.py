"""
Load jobs from a CSV file into the database.

Usage (from /backend):
    .venv\\Scripts\\python.exe -m app.scripts.load_jobs ..\\data\\jobs_seed.csv
Running it twice is safe: rows with the same external_id are updated, not duplicated.
"""
import sys
import time

from app.core.database import SessionLocal
from app.services.ingestion import ingest_items
from app.services.sources.csv_source import CsvFormatError, read_jobs_csv


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python -m app.scripts.load_jobs <path/to/jobs.csv>")
        sys.exit(2)
    started = time.perf_counter()
    try:
        items = read_jobs_csv(sys.argv[1])
    except (CsvFormatError, FileNotFoundError) as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
    db = SessionLocal()
    try:
        stats = ingest_items(db, "csv", items, started)
    finally:
        db.close()
    print(f"Loaded {stats.fetched} rows: {stats.inserted} new, {stats.updated} updated ({stats.seconds}s)")


if __name__ == "__main__":
    main()
