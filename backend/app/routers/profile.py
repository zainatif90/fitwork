from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.redis_client import hit_rate_limit
from app.models.user import User
from app.schemas.profile import ProfileIn, ProfileOut
from app.services import github_skills
from app.services.profiles import get_profile, save_profile
from app.services.skill_utils import known_skill_names

router = APIRouter(prefix="/profile", tags=["profile"])

GITHUB_LOOKUPS_PER_HOUR = 10


@router.get("/me", response_model=ProfileOut | None)
def read_my_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):  # type: ignore[no-untyped-def]
    """Returns null when the user has not completed the profile wizard yet."""
    return get_profile(db, user.id)


@router.put("/me", response_model=ProfileOut)
def update_my_profile(data: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):  # type: ignore[no-untyped-def]
    return save_profile(db, user.id, data)


class GitHubSuggestion(BaseModel):
    skill: str
    repos: int            # how many of the user's own public repositories use it
    examples: list[str]   # up to 3 repository names, as evidence


class GitHubSkillsOut(BaseModel):
    username: str
    repos_scanned: int
    suggestions: list[GitHubSuggestion]


@router.get("/github-skills", response_model=GitHubSkillsOut)
def github_skill_suggestions(
    username: str = Query(min_length=1, max_length=39),
    have: list[str] = Query(default=[], max_length=40, description="Skills already chosen in the wizard"),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
) -> dict:
    """Suggest skills from the languages and topics of a GitHub account's public repositories (nothing is saved)."""
    username = username.strip().lstrip("@")
    if not github_skills.valid_username(username):
        raise HTTPException(status_code=422, detail="That is not a valid GitHub username.")
    if hit_rate_limit(f"rl:github:{user.id}", GITHUB_LOOKUPS_PER_HOUR, 3600):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail="You looked up GitHub 10 times this hour. Please try again later.")
    profile = get_profile(db, user.id)
    already = list(have) + (list(profile.skills) if profile else [])
    try:
        return github_skills.github_skill_suggestions(username, known_skill_names(db), already)
    except github_skills.GitHubError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
