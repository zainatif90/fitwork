"""
Database connection setup (SQLAlchemy 2.0).

`engine` holds the connection pool, `SessionLocal` creates sessions, and `get_db`
is a FastAPI dependency that gives each request its own session and always closes it.
"""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    """Parent class for all ORM models."""


engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
