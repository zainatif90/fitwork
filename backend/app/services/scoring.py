"""
Match Score formula (pure functions, no database), so every part can be unit-tested and explained.

    score = 100 * (W_SEM * semantic + fit_gate * (W_BUDGET * budget_fit + W_RECENCY * recency))
    fit_gate = min(1, semantic / FIT_GATE)

All parts are numbers from 0 to 1. Weights and bounds live in app/core/config.py.
The fit gate means budget and recency only count fully once the job really fits the profile
(semantic >= FIT_GATE). Without it, a brand-new job in another field with a perfect budget scored
54-58 ("Possible fit") for an unrelated profile, only because of budget and recency.
"""
from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.config import settings
from app.models.job import LIVE_SOURCES, SOURCE_MAX_AGE_HOURS
from app.services.skill_utils import canonical_set, canonical_skill

NEUTRAL = 0.5  # used when we cannot judge (unknown budget, non-live job date)


def semantic_score(cosine: float) -> float:
    """
    Calibrated cosine similarity.
    Raw MiniLM cosine between a profile and a job is usually 0.15-0.65, so we stretch that
    range to 0-1: at or below SEM_LOW -> 0, at or above SEM_HIGH -> 1, linear in between.
    """
    low, high = settings.SEM_LOW, settings.SEM_HIGH
    return min(1.0, max(0.0, (cosine - low) / (high - low)))


def _linear_falloff(distance_ratio: float, zero_at: float) -> float:
    return max(0.0, 1.0 - distance_ratio / zero_at)


def budget_fit(budget_type: str, budget_min: float | None, budget_max: float | None, hourly_rate: float | None) -> float | None:
    """
    How well the job budget fits the freelancer's hourly rate (0-1). Returns None when unknown.

    Hourly job: 1.0 if the rate is inside [min, max]; falls linearly to 0 when the rate is
                50% outside the range.
    Fixed job:  estimated hours = budget / rate. 5-200 hours is a sensible project -> 1.0.
                Under 1 hour -> 0 (budget far too small). 1-5 h ramps up; 200-400 h ramps down.
    """
    if not hourly_rate or hourly_rate <= 0:
        return None
    lo = budget_min if budget_min else budget_max
    hi = budget_max if budget_max else budget_min
    if not lo or not hi:
        return None
    lo, hi = min(lo, hi), max(lo, hi)

    if budget_type == "hourly":
        if lo <= hourly_rate <= hi:
            return 1.0
        if hourly_rate < lo:
            return _linear_falloff((lo - hourly_rate) / lo, 0.5)
        return _linear_falloff((hourly_rate - hi) / hi, 0.5)

    hours = hi / hourly_rate
    if hours < 1:
        return 0.0
    if hours < 5:
        return (hours - 1) / 4
    if hours <= 200:
        return 1.0
    return _linear_falloff((hours - 200) / 200, 1.0)


def recency_score(source: str, posted_at: datetime, now: datetime | None = None) -> float:
    """
    Live jobs: 1.0 while fresh, falling linearly to 0 when the job expires for its source.
    Fresh = the first 1/12 of the source's lifetime: Freelancer.com 6 h of 72 h,
    job boards 42 h of 21 days.
    Seed jobs (csv): 0. They are a snapshot copied on 28 Oct 2026 and are probably closed by now,
    so they must never beat a live job on freshness (before, their neutral 0.5 beat any live job
    older than 39 h). Manual / synthetic jobs: neutral 0.5 (their dates are not live).
    """
    if source == "csv":
        return 0.0
    if source not in SOURCE_MAX_AGE_HOURS:
        return NEUTRAL
    now = now or datetime.now(timezone.utc)
    age_h = max(0.0, (now - posted_at).total_seconds() / 3600)
    max_age = SOURCE_MAX_AGE_HOURS[source]
    fresh = max_age / 12
    if age_h <= fresh:
        return 1.0
    if age_h >= max_age:
        return 0.0
    return 1.0 - (age_h - fresh) / (max_age - fresh)


def fit_gate(semantic: float) -> float:
    """How much of the budget + recency credit a job gets: all of it once it fits the profile well."""
    return min(1.0, semantic / settings.FIT_GATE)


def combine(semantic: float, budget: float, recency: float) -> int:
    raw = settings.W_SEM * semantic + fit_gate(semantic) * (settings.W_BUDGET * budget + settings.W_RECENCY * recency)
    return int(round(100 * min(1.0, max(0.0, raw))))


def skill_overlap(user_skills: list[str], job_skills: list[str]) -> tuple[list[str], list[str]]:
    """Return (matched, missing) using the job's own spelling, compared via canonical names."""
    mine = canonical_set(user_skills)
    matched = [s for s in job_skills if canonical_skill(s) in mine]
    missing = [s for s in job_skills if canonical_skill(s) not in mine]
    return matched, missing


def _join(names: list[str]) -> str:
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + " and " + names[-1]


def humanize_age(posted_at: datetime, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    minutes = int(max(0, (now - posted_at).total_seconds()) // 60)
    if minutes < 60:
        return f"{max(minutes, 1)} minute{'s' if minutes != 1 else ''} ago"
    hours = minutes // 60
    if hours < 48:
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    return f"{hours // 24} days ago"


@dataclass
class ScoreParts:
    cosine: float
    semantic: float
    budget_fit: float
    budget_known: bool
    recency: float
    score: int


def score_parts(cosine: float, source: str, posted_at: datetime, budget_type: str,
                budget_min: float | None, budget_max: float | None, hourly_rate: float | None,
                now: datetime | None = None) -> ScoreParts:
    sem = semantic_score(cosine)
    bud = budget_fit(budget_type, budget_min, budget_max, hourly_rate)
    rec = recency_score(source, posted_at, now)
    bud_value = NEUTRAL if bud is None else bud
    return ScoreParts(cosine=cosine, semantic=sem, budget_fit=bud_value, budget_known=bud is not None,
                      recency=rec, score=combine(sem, bud_value, rec))


def build_reason(parts: ScoreParts, matched: list[str], source: str, posted_at: datetime,
                 now: datetime | None = None) -> str:
    """One short human-readable sentence explaining the score."""
    pieces: list[str] = []
    if matched:
        pieces.append(f"Matches your {_join(matched[:3])} skill{'s' if len(matched) > 1 else ''}")
    elif parts.semantic >= 0.5:
        pieces.append("Similar to the work in your profile")
    else:
        pieces.append("Few of your skills are mentioned")

    if not parts.budget_known:
        pieces.append("budget not stated")
    elif parts.budget_fit >= 0.8:
        pieces.append("budget fits your rate")
    elif parts.budget_fit >= 0.4:
        pieces.append("budget partly fits your rate")
    else:
        pieces.append("budget is outside your usual rate")

    if source in LIVE_SOURCES:
        pieces.append(f"posted {humanize_age(posted_at, now)}")
    elif source == "manual":
        pieces.append("added by you")
    return "; ".join(pieces)
