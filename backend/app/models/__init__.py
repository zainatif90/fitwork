"""Import every model here so Alembic and SQLAlchemy can see all tables."""
from app.models.user import User

__all__ = ["User"]
