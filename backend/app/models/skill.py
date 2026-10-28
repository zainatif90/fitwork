from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Skill(Base):
    """Reference table of known skills (seeded by migration 0002). Used for autocomplete and extraction."""

    __tablename__ = "skills"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    name_lower: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(60))
