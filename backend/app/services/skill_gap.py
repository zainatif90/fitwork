"""
Skill Gap Radar (UC-5).

1. Demand: count how many active jobs ask for each skill (a job's skill list; if a job had no
   tags, ingestion already extracted known skills from its description).
2. Candidates: the 15 most-demanded skills the user does NOT have.
3. Impact, measured honestly: for each candidate we rebuild the profile text WITH that skill,
   re-embed it, re-score every active job, and count jobs that now reach the match threshold
   (score >= 60) but did not before. That count is "jobs unlocked".
4. Return the top 5 gaps with sample job titles, plus radar data for the top 8 demand skills.
Results are cached in Redis for 1 hour (cleared when the profile changes).
"""
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any

import numpy as np
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.redis_client import cache_get, cache_set
from app.models.job import Job
from app.models.profile import Profile
from app.services import embeddings, scoring
from app.services.matching import ensure_profile_embedding
from app.services.skill_utils import canonical_set, canonical_skill

TOP_GAPS = 5
RADAR_SKILLS = 8


def skill_demand(jobs: list[Job]) -> tuple[Counter[str], dict[str, str]]:
    """
    Count jobs per skill. Spelling variants are merged ("React.js" and "React" count as one),
    and a skill is counted at most once per job. Returns (counts by canonical key, display names).
    """
    counts: Counter[str] = Counter()
    spellings: dict[str, Counter[str]] = {}
    for job in jobs:
        for key in canonical_set(job.skills):
            counts[key] += 1
        for s in job.skills:
            spellings.setdefault(canonical_skill(s), Counter())[s.strip()] += 1
    display = {key: c.most_common(1)[0][0] for key, c in spellings.items()}
    return counts, display


def semantic_vector(cosines: np.ndarray) -> np.ndarray:
    """Vectorised version of scoring.semantic_score."""
    return np.clip((cosines - settings.SEM_LOW) / (settings.SEM_HIGH - settings.SEM_LOW), 0.0, 1.0)


def scores_from_cosines(cosines: np.ndarray, fixed_part: np.ndarray) -> np.ndarray:
    """Match Scores for many jobs. `fixed_part` = budget + recency contribution (does not depend on the profile text)."""
    return np.round(100 * (settings.W_SEM * semantic_vector(cosines) + fixed_part))


def count_unlocked(base_scores: np.ndarray, new_scores: np.ndarray, threshold: float) -> np.ndarray:
    """Boolean mask of jobs that pass the threshold with the new skill but did not pass before."""
    return (new_scores >= threshold) & (base_scores < threshold)


def _fixed_part(job: Job, hourly_rate: float, now: datetime) -> float:
    """Budget + recency contribution to the score (0-0.30). Adding a skill does not change it."""
    budget = scoring.budget_fit(job.budget_type, job.budget_min, job.budget_max, hourly_rate)
    if budget is None:
        budget = scoring.NEUTRAL
    return settings.W_BUDGET * budget + settings.W_RECENCY * scoring.recency_score(job.source, job.posted_at, now)


def _active_jobs(db: Session, profile: Profile) -> list[Job]:
    return list(db.scalars(select(Job).where(
        Job.is_active.is_(True), Job.embedding.is_not(None),
        or_(Job.source != "manual", Job.created_by == profile.user_id),
    )))


def compute_skill_gap(db: Session, profile: Profile) -> dict[str, Any]:
    started = time.perf_counter()
    threshold = settings.MATCH_THRESHOLD
    base_vec = np.asarray(ensure_profile_embedding(db, profile), dtype=np.float32)
    jobs = _active_jobs(db, profile)
    if not jobs:
        return {"total_active_jobs": 0, "baseline_matches": 0, "threshold": threshold, "gaps": [], "radar": [], "your_skills": [],
                "coverage_message": "There are no active jobs to analyse yet.", "analysed_skills": 0,
                "compute_ms": 0.0, "generated_at": datetime.now(timezone.utc).isoformat()}

    # Job matrix (n x 384) and the parts of the score that do not change when a skill is added
    J = np.asarray([j.embedding for j in jobs], dtype=np.float32)
    now = datetime.now(timezone.utc)
    fixed = np.array([_fixed_part(j, profile.hourly_rate, now) for j in jobs])
    base_scores = scores_from_cosines(J @ base_vec, fixed)
    baseline = int((base_scores >= threshold).sum())

    # Demand + candidate skills (most demanded skills the user doesn't have)
    demand, display = skill_demand([j for j in jobs if j.source != "manual"])
    mine = canonical_set(profile.skills)
    candidates = [k for k, _ in demand.most_common() if k not in mine][: settings.SKILL_GAP_CANDIDATES]

    gaps = []
    if candidates:
        texts = [embeddings.build_profile_text(profile.skills + [display[k]], profile.experience_level, profile.bio)
                 for k in candidates]
        new_vecs = embeddings.embed_texts(texts)              # one batch: (15 x 384)
        new_scores_all = scores_from_cosines(J @ new_vecs.T, fixed[:, None])  # (n x 15)
        for i, key in enumerate(candidates):
            new_scores = new_scores_all[:, i]
            unlocked = count_unlocked(base_scores, new_scores, threshold)
            idx = np.flatnonzero(unlocked)
            idx = idx[np.argsort(-new_scores[idx])]  # best new matches first
            gaps.append({
                "skill": display[key],
                "demand": demand[key],
                "jobs_unlocked": int(unlocked.sum()),
                "percent_increase": round(100 * int(unlocked.sum()) / baseline, 1) if baseline else None,
                "sample_jobs": [{"id": str(jobs[j].id), "title": jobs[j].title, "score": int(new_scores[j])} for j in idx[:3]],
            })
    gaps.sort(key=lambda g: (g["jobs_unlocked"], g["demand"]), reverse=True)
    useful = [g for g in gaps if g["jobs_unlocked"] > 0][:TOP_GAPS]

    top_demand = demand.most_common(RADAR_SKILLS)
    max_count = top_demand[0][1] if top_demand else 1
    radar = [{"skill": display[k], "market_demand": round(100 * c / max_count), "jobs": c,
              "your_coverage": 100 if k in mine else 0} for k, c in top_demand]
    covered_top = sum(1 for r in radar if r["your_coverage"] == 100)
    # How many active jobs ask for each skill the user already has
    your_skills = sorted(({"skill": s, "jobs": demand.get(canonical_skill(s), 0)} for s in profile.skills),
                         key=lambda x: x["jobs"], reverse=True)

    message = None
    if not useful:
        message = ("Strong coverage: adding any one of the most in-demand skills would not unlock new matches "
                   "right now. Your profile already covers what the market is asking for.")
    elif covered_top >= 6:
        message = f"Strong coverage: you already have {covered_top} of the top {len(radar)} in-demand skills."

    return {
        "total_active_jobs": len(jobs),
        "baseline_matches": baseline,
        "threshold": threshold,
        "gaps": useful,
        "radar": radar,
        "your_skills": your_skills,
        "coverage_message": message,
        "analysed_skills": len(candidates),
        "compute_ms": round((time.perf_counter() - started) * 1000, 1),
        "generated_at": now.isoformat(),
    }


def get_skill_gap(db: Session, profile: Profile, use_cache: bool = True) -> dict[str, Any]:
    key = f"skillgap:{profile.user_id}"
    if use_cache and (cached := cache_get(key)):
        return {**cached, "cached": True}
    result = compute_skill_gap(db, profile)
    cache_set(key, result, settings.SKILL_GAP_CACHE_SEC)
    return {**result, "cached": False}
