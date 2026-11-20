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


def engine_options(url: str) -> dict:
    """
    Connection settings that stop a dead database connection from freezing the server.
    Without them, a connection that dies silently (e.g. the free Neon database suspends, or the network drops)
    can make a request wait forever; enough of those and every worker thread is stuck (Render: "health check
    timed out"). With them: connecting gives up after 10 s, dead connections are noticed within about a minute
    (TCP keepalive), and a request waits at most 10 s for a free connection from the pool.
    """
    # at most 10 connections: fits the free connection limits of hosted Postgres (Supabase/Neon poolers)
    opts: dict = {"pool_pre_ping": True, "pool_timeout": 10, "pool_recycle": 280, "pool_size": 5, "max_overflow": 5}
    if url.startswith("postgresql"):
        opts["connect_args"] = {"connect_timeout": 10, "keepalives": 1, "keepalives_idle": 30,
                                "keepalives_interval": 10, "keepalives_count": 3}
    return opts


engine = create_engine(settings.DATABASE_URL, **engine_options(settings.DATABASE_URL))
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
