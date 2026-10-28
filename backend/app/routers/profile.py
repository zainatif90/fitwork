from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.profile import ProfileIn, ProfileOut
from app.services.profiles import get_profile, save_profile

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/me", response_model=ProfileOut | None)
def read_my_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):  # type: ignore[no-untyped-def]
    """Returns null when the user has not completed the profile wizard yet."""
    return get_profile(db, user.id)


@router.put("/me", response_model=ProfileOut)
def update_my_profile(data: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):  # type: ignore[no-untyped-def]
    return save_profile(db, user.id, data)
