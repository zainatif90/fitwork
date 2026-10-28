"""Import every model here so Alembic and SQLAlchemy can see all tables."""
from app.models.agency import Agency, AgencyMember, Assignment
from app.models.feedback import MatchFeedback
from app.models.job import Job
from app.models.profile import Profile
from app.models.proposal import Proposal
from app.models.skill import Skill
from app.models.user import User

__all__ = ["Agency", "AgencyMember", "Assignment", "Job", "MatchFeedback", "Profile", "Proposal", "Skill", "User"]
