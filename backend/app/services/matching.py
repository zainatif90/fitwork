"""
Matching engine (UC-3).

Step 1  pgvector finds the 50 active jobs whose embeddings are closest (cosine distance) to the
        user's profile embedding. This runs inside PostgreSQL using the HNSW index.
Step 2  Each candidate gets a Match Score (0-100) from semantic fit, budget fit and recency
        (see app/services/scoring.py).
Step 3  Each score gets a short reason plus matched / missing skills. The top 5 are returned.

Results are cached in Redis for 10 minutes per user; saving the profile clears the cache.
"""
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import numpy as np
from fastapi import HTTPException
from sqlalchemy import exists, or_, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.redis_client import cache_get, cache_set
from app.models.feedback import MatchFeedback
from app.models.job import Job
from app.models.profile import Profile
from app.services import scoring
from app.services.profiles import refresh_embedding

log = logging.getLogger(__name__)


def ensure_profile_embedding(db: Session, profile: Profile) -> list[float]:
    """Retry a 'pending' embedding; if it still fails, tell the user to try again shortly."""
    if profile.embedding is None:
        if refresh_embedding(profile):
            db.commit()
        else:
            raise HTTPException(status_code=503, detail="Your profile is still being processed. Try again in a minute.")
    return list(profile.embedding)  # type: ignore[arg-type]


def visible_jobs_filter(user_id: uuid.UUID):  # type: ignore[no-untyped-def]
    """Active jobs with an embedding. Manual jobs are only visible to the user who added them."""
    return (
        Job.is_active.is_(True),
        Job.embedding.is_not(None),
        or_(Job.source != "manual", Job.created_by == user_id),
    )


def nearest_jobs(db: Session, embedding: list[float], user_id: uuid.UUID, limit: int) -> list[tuple[Job, float]]:
    """
    Top-k jobs by cosine distance. Returns (job, cosine_similarity) pairs, closest first.
    Jobs the user already gave feedback on (not relevant / applied / won / lost) are left out,
    so marking a job "Not relevant" lets the next best job move up.
    """
    # The HNSW index only explores `ef_search` candidates (default 40). Raise it so that,
    # after the WHERE filter, we still get `limit` results.
    db.execute(text(f"SET LOCAL hnsw.ef_search = {max(100, limit * 2)}"))
    distance = Job.embedding.cosine_distance(embedding)
    already_handled = exists().where(MatchFeedback.user_id == user_id, MatchFeedback.job_id == Job.id)
    rows = db.execute(
        select(Job, distance.label("distance"))
        .where(*visible_jobs_filter(user_id), ~already_handled)
        .order_by(distance)
        .limit(limit)
    ).all()
    # cosine distance = 1 - cosine similarity
    return [(job, 1.0 - float(dist)) for job, dist in rows]


def score_job(profile: Profile, job: Job, cosine: float, now: datetime | None = None) -> dict[str, Any]:
    """Full, explainable match result for one job (JSON-ready dict)."""
    now = now or datetime.now(timezone.utc)
    parts = scoring.score_parts(cosine, job.source, job.posted_at, job.budget_type,
                                job.budget_min, job.budget_max, profile.hourly_rate, now)
    matched, missing = scoring.skill_overlap(profile.skills, job.skills)
    return {
        "job_id": str(job.id),
        "score": parts.score,
        "breakdown": {
            "semantic": round(parts.semantic, 3),
            "budget_fit": round(parts.budget_fit, 3),
            "recency": round(parts.recency, 3),
            "cosine": round(parts.cosine, 3),
            "budget_known": parts.budget_known,
            "fit_gate": round(scoring.fit_gate(parts.semantic), 3),
            "weights": {"semantic": settings.W_SEM, "budget_fit": settings.W_BUDGET, "recency": settings.W_RECENCY},
        },
        "reason": scoring.build_reason(parts, matched, job.source, job.posted_at, now),
        "matched_skills": matched,
        "missing_skills": missing,
    }


def job_summary(job: Job) -> dict[str, Any]:
    return {
        "id": str(job.id),
        "source": job.source,
        "title": job.title,
        "description_preview": job.description[:280],
        "skills": job.skills,
        "budget_min": job.budget_min,
        "budget_max": job.budget_max,
        "budget_type": job.budget_type,
        "currency": job.currency,
        "proposals_count": job.proposals_count,
        "posted_at": job.posted_at.isoformat(),
        "url": job.url,
        "is_active": job.is_active,
    }


def posting_key(title: str, description: str) -> tuple[str, str]:
    """Two jobs with the same title and the same start of the description are the same posting (a repost,
    or the same job on two boards). Used by matching and by Skill Gap (unique_postings)."""
    return " ".join(title.lower().split()), " ".join(description.lower().split())[:300]


def compute_matches(db: Session, profile: Profile, top_n: int | None = None,
                    candidates: int | None = None) -> list[dict[str, Any]]:
    """Score the nearest candidates and return the best `top_n`, highest score first (each posting once)."""
    embedding = ensure_profile_embedding(db, profile)
    now = datetime.now(timezone.utc)
    nearest = nearest_jobs(db, embedding, profile.user_id, candidates or settings.MATCH_CANDIDATES)
    scored = [(score_job(profile, job, cos, now), job) for job, cos in nearest]
    # Sort by score; ties broken by raw similarity so the order is stable
    scored.sort(key=lambda r: (r[0]["score"], r[0]["breakdown"]["cosine"]), reverse=True)
    results, seen = [], set()
    for result, job in scored:
        key = posting_key(job.title, job.description)
        if key in seen:      # a repost of a job already listed (seen: 1 job filled 3 of the 5 slots)
            continue
        seen.add(key)
        results.append({**result, "job": job_summary(job)})
    return results if top_n is None else results[:top_n]


def get_matches(db: Session, profile: Profile, use_cache: bool = True) -> dict[str, Any]:
    """Top-5 matches + quick stats, served from Redis when fresh."""
    key = f"matches:{profile.user_id}"
    if use_cache:
        cached = cache_get(key)
        if cached:
            cached["cached"] = True
            return cached

    started = time.perf_counter()
    scored = compute_matches(db, profile)
    top = scored[: settings.MATCH_TOP_N]
    payload = {
        "matches": top,
        "stats": {
            "candidates_considered": len(scored),
            "strong_matches": sum(1 for r in scored if r["score"] >= 75),
            "average_score": round(float(np.mean([r["score"] for r in top])), 1) if top else 0,
            "top_source": _most_common([r["job"]["source"] for r in top]),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "compute_ms": round((time.perf_counter() - started) * 1000, 1),
        "cached": False,
    }
    cache_set(key, payload, settings.MATCH_CACHE_SEC)
    return payload


def _most_common(values: list[str]) -> str | None:
    if not values:
        return None
    return max(set(values), key=values.count)


def score_single_job(db: Session, profile: Profile, job: Job) -> dict[str, Any] | None:
    """Score one specific job (used by the job detail page and agency routing)."""
    if job.embedding is None:
        return None
    embedding = ensure_profile_embedding(db, profile)
    cosine = float(np.dot(np.asarray(embedding), np.asarray(job.embedding)))  # both are unit vectors
    return score_job(profile, job, cosine)
