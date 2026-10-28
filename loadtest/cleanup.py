"""Delete the users created by the load test (emails ending in @loadtest.example.com)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from sqlalchemy import delete  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402

db = SessionLocal()
result = db.execute(delete(User).where(User.email.like("%@loadtest.example.com")))
db.commit()
print(f"Deleted {result.rowcount} load-test users")
