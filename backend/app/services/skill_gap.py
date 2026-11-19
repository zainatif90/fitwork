"""
Skill Gap Radar (UC-5): which missing skill, from the user's OWN field of work, would unlock the most jobs.

1. Your field: the 200 active jobs most similar to your profile (cosine similarity, at least 0.30)
   that also ask for at least one skill you already have (in their tags or title). For a QA tester
   these are testing jobs; for a logo designer, design jobs. If fewer than 5 jobs share one of your
   skills, we say so instead of guessing. A job posted several times is counted once.
2. Candidates: the 15 skills that those field jobs ask for most often and that you do NOT have
   (generic words such as "documentation" are never suggested). Skills from other fields
   (e.g. social media for a QA tester) cannot appear, because jobs in your field do not ask for them.
   A job's skills are its tags; if a job had no tags, ingestion extracted known skills from its text.
3. Impact, measured honestly: for each candidate we rebuild the profile text WITH that skill,
   re-embed it and re-score every active job. A job counts as "unlocked" only if it
   (a) asks for that skill, (b) is in your field (similar AND shares one of your skills), and
   (c) now reaches the match threshold (score >= 60) but did not before. Seen live without (b):
   "AWS" for a QA tester "unlocked" technical-support and DevOps jobs.
4. Return the top 5 gaps (by jobs unlocked, then by demand in your field) with sample job titles,
   plus radar data for the 8 most requested skills in your field.
Results are cached in Redis for 1 hour (cleared when the profile changes).
"""
import time
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import numpy as np
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.redis_client import cache_get, cache_set
from app.models.job import Job
from app.models.profile import Profile
from app.services import embeddings, scoring
from app.services.matching import ensure_profile_embedding
from app.services.skill_utils import NOT_SUGGESTED, _compact, canonical_set, canonical_skill, skills_in_text

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
    display = {key: _display_name(key, c) for key, c in spellings.items()}
    return counts, display


def _display_name(key: str, spellings: Counter[str]) -> str:
    """Prefer the standard spelling ("iOS" rather than "iPhone"), else the most common one."""
    standard = [s for s in spellings if _compact(s) == key]
    return max(standard, key=lambda s: spellings[s]) if standard else spellings.most_common(1)[0][0]


def semantic_vector(cosines: np.ndarray) -> np.ndarray:
    """Vectorised version of scoring.semantic_score."""
    return np.clip((cosines - settings.SEM_LOW) / (settings.SEM_HIGH - settings.SEM_LOW), 0.0, 1.0)


def scores_from_cosines(cosines: np.ndarray, fixed_part: np.ndarray) -> np.ndarray:
    """
    Match Scores for many jobs (vectorised scoring.combine). `fixed_part` = budget + recency contribution,
    which does not depend on the profile text; the fit gate scales it by how well the job fits.
    """
    sem = semantic_vector(cosines)
    gate = np.minimum(1.0, sem / settings.FIT_GATE)
    return np.round(100 * np.clip(settings.W_SEM * sem + gate * fixed_part, 0.0, 1.0))


def count_unlocked(base_scores: np.ndarray, new_scores: np.ndarray, threshold: float) -> np.ndarray:
    """Boolean mask of jobs that pass the threshold with the new skill but did not pass before."""
    return (new_scores >= threshold) & (base_scores < threshold)


def _fixed_part(job: Job, hourly_rate: float, now: datetime) -> float:
    """Budget + recency contribution to the score (0-0.30). Adding a skill does not change it."""
    budget = scoring.budget_fit(job.budget_type, job.budget_min, job.budget_max, hourly_rate)
    if budget is None:
        budget = scoring.NEUTRAL
    return settings.W_BUDGET * budget + settings.W_RECENCY * scoring.recency_score(job.source, job.posted_at, now)


@dataclass(slots=True)
class JobRow:
    """
    The parts of a job that Skill Gap needs (same attribute names as Job, so the functions here accept both).

    Why not full Job objects (fixed 19 Nov 2026, after the live server crashed on /skill-gap):
    pgvector returns each embedding as a Python list of 384 float objects (~12 KB per job), and Job also carries
    the full description. Measured: ~23 KB per job. With thousands of live jobs that went past the 512 MB of
    the free server, which was killed. Here the embedding is turned into a float32 array (1.5 KB) as each row
    arrives, and only the first 300 characters of the description are read (enough for unique_postings).
    """
    id: uuid.UUID
    title: str
    skills: list[str]
    source: str
    posted_at: datetime
    budget_type: str
    budget_min: float | None
    budget_max: float | None
    description: str
    embedding: np.ndarray


_LEAN_COLUMNS = (Job.id, Job.title, Job.skills, Job.source, Job.posted_at, Job.budget_type, Job.budget_min,
                 Job.budget_max, func.left(Job.description, 300).label("description"), Job.embedding)


def _active_jobs(db: Session, profile: Profile) -> list[JobRow]:
    result = db.execute(select(*_LEAN_COLUMNS).where(
        Job.is_active.is_(True), Job.embedding.is_not(None),
        or_(Job.source != "manual", Job.created_by == profile.user_id),
    ).execution_options(yield_per=100))                     # read in batches: only ~100 raw rows in memory at once
    return [JobRow(*row[:-1], embedding=np.asarray(row.embedding, dtype=np.float32)) for row in result]


def unique_postings(jobs: list[Job]) -> list[Job]:
    """
    Count a job that was posted several times (same title and description) only once.
    Seen live: one "CAD Engineer - AI Trainer" role was posted 14 times and looked like 14 jobs.
    """
    seen: set[tuple[str, str]] = set()
    unique = []
    for job in jobs:
        key = (" ".join(job.title.lower().split()), " ".join(job.description.lower().split())[:300])
        if key not in seen:
            seen.add(key)
            unique.append(job)
    return unique


def in_your_field(cosines: np.ndarray, shares_skill: np.ndarray) -> np.ndarray:
    """
    Boolean mask of jobs in the user's field: similar to the profile (similarity >= the floor) AND
    asking for at least one of the user's skills. Similarity alone is not enough: MiniLM gives any two
    job-like texts ~0.3 (measured: a social media job scored 0.39 against a React profile).
    If fewer than SKILL_GAP_FIELD_MIN_JOBS jobs share a skill (e.g. unusual skill names), the field is empty
    and the user is told so. (A similarity-only fallback suggested video editing to an unrelated profile.)
    """
    sharing = (cosines >= settings.SKILL_GAP_FIELD_MIN_COSINE) & shares_skill
    return sharing if sharing.sum() >= settings.SKILL_GAP_FIELD_MIN_JOBS else np.zeros_like(sharing)


def field_of_work(cosines: np.ndarray, shares_skill: np.ndarray) -> np.ndarray:
    """Indexes of the (up to) 200 most similar jobs in the user's field: used for demand and the radar."""
    order = np.argsort(-cosines)
    return order[in_your_field(cosines, shares_skill)[order]][: settings.SKILL_GAP_FIELD_SIZE]


def compute_skill_gap(db: Session, profile: Profile) -> dict[str, Any]:
    started = time.perf_counter()
    threshold = settings.MATCH_THRESHOLD
    base_vec = np.asarray(ensure_profile_embedding(db, profile), dtype=np.float32)
    jobs = unique_postings(_active_jobs(db, profile))
    now = datetime.now(timezone.utc)
    if not jobs:
        return {"total_active_jobs": 0, "field_jobs": 0, "baseline_matches": 0, "threshold": threshold, "gaps": [],
                "radar": [], "your_skills": [], "coverage_message": "There are no active jobs to analyse yet.",
                "analysed_skills": 0, "compute_ms": 0.0, "generated_at": now.isoformat()}

    # Job matrix (n x 384) and the parts of the score that do not change when a skill is added
    J = np.stack([j.embedding for j in jobs])  # (n x 384) float32
    fixed = np.array([_fixed_part(j, profile.hourly_rate, now) for j in jobs])
    base_cos = J @ base_vec
    base_scores = scores_from_cosines(base_cos, fixed)
    baseline = int((base_scores >= threshold).sum())

    # 1-2. The user's field, and the skills its jobs ask for that the user does not have yet
    mine = canonical_set(profile.skills)
    field_skills = mine - NOT_SUGGESTED  # generic words such as "automation" do not define a field
    job_keys = [canonical_set(j.skills) for j in jobs]
    # A job shares a skill if it is tagged with one of yours or names one in its title ("QA Tester needed")
    shares_skill = np.array([bool(keys & field_skills) or bool(skills_in_text(j.title, profile.skills) & field_skills)
                             for j, keys in zip(jobs, job_keys)])
    in_field = in_your_field(base_cos, shares_skill)
    field_jobs = [jobs[i] for i in field_of_work(base_cos, shares_skill) if jobs[i].source != "manual"]
    demand, display = skill_demand(field_jobs)
    candidates = [k for k, _ in demand.most_common()
                  if k not in mine and k not in NOT_SUGGESTED][: settings.SKILL_GAP_CANDIDATES]

    # 3. Impact of each candidate skill
    gaps = []
    if candidates:
        texts = [embeddings.build_profile_text(profile.skills + [display[k]], profile.experience_level, profile.bio)
                 for k in candidates]
        new_vecs = embeddings.embed_texts(texts)              # one batch: (15 x 384)
        new_scores_all = scores_from_cosines(J @ new_vecs.T, fixed[:, None])  # (n x 15)
        for i, key in enumerate(candidates):
            new_scores = new_scores_all[:, i]
            asks_for_it = np.array([key in keys for keys in job_keys])
            unlocked = count_unlocked(base_scores, new_scores, threshold) & asks_for_it & in_field
            idx = np.flatnonzero(unlocked)
            idx = idx[np.argsort(-new_scores[idx])]  # best new matches first
            gaps.append({
                "skill": display[key],
                "demand": demand[key],  # jobs in the user's field that ask for this skill
                "jobs_unlocked": int(unlocked.sum()),
                "percent_increase": round(100 * int(unlocked.sum()) / baseline, 1) if baseline else None,
                "sample_jobs": [{"id": str(jobs[j].id), "title": jobs[j].title, "score": int(new_scores[j])} for j in idx[:3]],
            })
    gaps.sort(key=lambda g: (g["jobs_unlocked"], g["demand"]), reverse=True)
    # Skills that unlock jobs come first; the rest of the 5 are skills often asked for in the user's field
    useful = [g for g in gaps if g["jobs_unlocked"] > 0 or g["demand"] >= 2][:TOP_GAPS]

    # 4. Radar: you vs your field
    top_demand = [(k, c) for k, c in demand.most_common() if k not in NOT_SUGGESTED][:RADAR_SKILLS]
    max_count = top_demand[0][1] if top_demand else 1
    # One real job from the user's field that asks for each skill, so the link is visible
    field_keys = [canonical_set(j.skills) for j in field_jobs]
    example = {k: next((j.title for j, keys in zip(field_jobs, field_keys) if k in keys), None) for k, _ in top_demand}
    radar = [{"skill": display[k], "market_demand": round(100 * c / max_count), "jobs": c,
              "your_coverage": 100 if k in mine else 0, "example_job": example[k]} for k, c in top_demand]
    covered_top = sum(1 for r in radar if r["your_coverage"] == 100)
    # How many active jobs (all fields) ask for each skill the user already has
    all_demand, _ = skill_demand([j for j in jobs if j.source != "manual"])
    your_skills = sorted(({"skill": s, "jobs": all_demand.get(canonical_skill(s), 0)} for s in profile.skills),
                         key=lambda x: x["jobs"], reverse=True)

    message = None
    if not field_jobs:
        message = ("We could not find enough jobs that ask for your skills yet. Use the common names for your "
                   "skills (pick them from the suggestions in your profile), or check again when new jobs arrive.")
    elif not useful:
        message = "Strong coverage: you already have the skills that jobs in your field ask for most."
    elif radar and covered_top >= max(1, round(0.75 * len(radar))):
        message = f"Strong coverage: you already have {covered_top} of the top {len(radar)} skills in your field."

    return {
        "total_active_jobs": len(jobs),
        "field_jobs": len(field_jobs),
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
