"""Import every model here so Alembic and SQLAlchemy can see all tables."""
from app.models.job import Job
from app.models.profile import Profile
from app.models.skill import Skill
from app.models.user import User

__all__ = ["Job", "Profile", "Skill", "User"]
