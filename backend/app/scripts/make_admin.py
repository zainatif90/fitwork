"""
Give a user admin rights (can trigger ingestion manually).

Usage (from /backend):  .venv\\Scripts\\python.exe -m app.scripts.make_admin you@example.com
"""
import sys

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.user import User


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python -m app.scripts.make_admin <email>")
        sys.exit(2)
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == sys.argv[1].lower()))
        if not user:
            print("No user with that email")
            sys.exit(1)
        user.is_admin = True
        db.commit()
        print(f"{user.email} is now an admin")
    finally:
        db.close()


if __name__ == "__main__":
    main()
