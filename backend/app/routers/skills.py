from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.skill import Skill
from app.models.user import User
from app.schemas.profile import SkillOut

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=list[SkillOut])
def search_skills(
    q: str = Query(default="", max_length=60),
    limit: int = Query(default=8, ge=1, le=20),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Skill]:
    """Autocomplete: skills that start with `q` come first, then skills that contain it."""
    term = q.strip().lower()
    stmt = select(Skill)
    if term:
        # Escape LIKE wildcards so user input is matched literally.
        safe = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        starts_first = case((Skill.name_lower.like(f"{safe}%", escape="\\"), 0), else_=1)
        stmt = stmt.where(Skill.name_lower.like(f"%{safe}%", escape="\\")).order_by(starts_first, Skill.name)
    else:
        stmt = stmt.order_by(Skill.name)
    return list(db.scalars(stmt.limit(limit)))
