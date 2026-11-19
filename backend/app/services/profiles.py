"""Profile business logic: save a profile and (re)compute its embedding."""
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.redis_client import cache_delete
from app.models.profile import Profile
from app.schemas.profile import ProfileIn
from app.services import embeddings

log = logging.getLogger(__name__)


def user_cache_keys(user_id: uuid.UUID) -> list[str]:
    """Every cached result that depends on this user's profile."""
    return [f"matches:{user_id}", f"skillgap:{user_id}"]


def get_profile(db: Session, user_id: uuid.UUID) -> Profile | None:
    return db.scalar(select(Profile).where(Profile.user_id == user_id))


def refresh_embedding(profile: Profile) -> bool:
    """
    Compute the profile embedding. Returns True on success.
    On failure the profile keeps embedding_status='pending' and is retried later
    (the matching service calls this again when it finds a pending profile).
    """
    try:
        text = embeddings.build_profile_text(profile.skills, profile.experience_level, profile.bio)
        profile.embedding = embeddings.embed_text(text)
        profile.embedding_status = "ready"
        return True
    except Exception:
        log.exception("Embedding failed for profile %s; saved as pending", profile.id)
        profile.embedding = None
        profile.embedding_status = "pending"
        return False


def save_profile(db: Session, user_id: uuid.UUID, data: ProfileIn) -> Profile:
    profile = get_profile(db, user_id) or Profile(user_id=user_id)
    profile.skills = data.skills
    profile.experience_level = data.experience_level
    profile.hourly_rate = data.hourly_rate
    profile.bio = data.bio.strip()
    profile.portfolio_urls = [str(u) for u in data.portfolio_urls]
    profile.platforms = list(data.platforms)
    db.add(profile)

    refresh_embedding(profile)  # never raises: the profile is saved either way
    db.commit()
    db.refresh(profile)

    # The profile changed, so old match / skill-gap results are no longer valid.
    cache_delete(*user_cache_keys(user_id))
    # ...and the new Skill Gap is calculated in the background, so the page is ready when the user opens it.
    from app.services.skill_gap import prewarm_in_background

    prewarm_in_background(user_id)
    return profile
