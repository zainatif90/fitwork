"""
AI Proposal Assistant (UC-6).

1. Build a prompt from the job (title, description, skills) and the freelancer's real profile.
2. Ask the LLM for a draft, with strict rules: no invented experience, only real skills,
   end with a short question to the client.
3. If the LLM fails or times out (30 s), return a filled-in template instead and flag it as a fallback.
4. Every draft is stored in the `proposals` table; each user can generate 20 per day.
"""
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.redis_client import redis_client
from app.models.job import Job
from app.models.profile import Profile
from app.models.proposal import Proposal
from app.models.user import User
from app.services.llm import LLMClient, LLMError
from app.services.scoring import skill_overlap

log = logging.getLogger(__name__)

LENGTH_WORDS = {"concise": 120, "standard": 200, "detailed": 280}
TONE_GUIDE = {
    "professional": "Professional and confident. Clear sentences, no slang.",
    "friendly": "Warm and friendly, but still businesslike. Natural, conversational sentences.",
    "technical": "Technical and precise. Briefly explain HOW you would approach the work, naming the relevant tools.",
}

SYSTEM_PROMPT = (
    "You write job proposals (cover letters) for freelancers on platforms like Freelancer.com and Upwork. "
    "You are honest: you never invent facts about the freelancer."
)


class RateLimitExceeded(Exception):
    pass


@dataclass
class Draft:
    content: str
    is_fallback: bool
    provider: str
    model: str | None


def build_prompt(job: Job, profile: Profile, user: User, tone: str, length: str) -> str:
    matched, _ = skill_overlap(profile.skills, job.skills)
    first_name = user.full_name.split()[0]
    portfolio = "\n".join(f"- {u}" for u in profile.portfolio_urls) or "(none provided)"
    return f"""Write a proposal for this job on behalf of the freelancer below.

## Job
Title: {job.title}
Required skills: {", ".join(job.skills) or "not listed"}
Description:
{job.description[:3000]}

## Freelancer (the ONLY facts you may use about them)
Name: {first_name}
Skills: {", ".join(profile.skills)}
Skills that match this job: {", ".join(matched) or "none listed exactly; rely on related skills from the list above"}
Experience level: {profile.experience_level}
Bio: {profile.bio or "(no bio)"}
Portfolio links:
{portfolio}

## Rules
1. Do NOT invent experience, past clients, project names, years, numbers, results, certifications or reviews.
   Use only the facts in the Freelancer section.
2. Mention only skills from the freelancer's skill list. Never claim a skill they do not list.
3. Show you understood the client's need: refer to 1-2 specifics from the job description.
4. If portfolio links are given, you may mention one of them exactly as written.
5. Tone: {TONE_GUIDE[tone]}
6. Length: about {LENGTH_WORDS[length]} words (between {round(LENGTH_WORDS[length] * 0.85)} and {round(LENGTH_WORDS[length] * 1.15)} words).
7. End with ONE short, specific question to the client, then sign off with "{first_name}".
8. Plain text only: no markdown, no headings, no placeholders like [Name] or [X years].
"""


# Words that start a new sentence glued onto a title by some sites ("Speed OptimizationThe budget is $20.")
_GLUED_SENTENCE = re.compile(r"(?<=[a-z])(?=(?:The|This|We|I|Our|Budget|Please|Looking|Need|Must)\b)")


def short_title(title: str) -> str:
    """The job title up to its first sentence end, so the template never quotes extra text."""
    first = re.split(r"[.!?](?:\s|$)", _GLUED_SENTENCE.split(title.strip(), maxsplit=1)[0], maxsplit=1)[0].strip()
    return first[:100].rsplit(" ", 1)[0] if len(first) > 100 else first


def fallback_proposal(job: Job, profile: Profile, user: User, length: str) -> str:
    """A filled template used when the LLM is unavailable. Uses only real profile facts."""
    first_name = user.full_name.split()[0]
    matched, _ = skill_overlap(profile.skills, job.skills)
    skills = matched[:4] or profile.skills[:4]
    skill_text = ", ".join(skills[:-1]) + f" and {skills[-1]}" if len(skills) > 1 else skills[0]
    bio_first = re.split(r"(?<=[.!?])\s+", profile.bio.strip())[0] if profile.bio.strip() else ""

    one = len(skills) == 1
    if matched:
        skills_sentence = f"My relevant skill{'' if one else 's'} for this work {'is' if one else 'are'} {skill_text}."
    else:
        skills_sentence = f"My main skill{'' if one else 's'} {'is' if one else 'are'} {skill_text}."
    paragraphs = [
        "Hello,",
        f"I read your post about \"{short_title(job.title)}\" and I would like to help. {skills_sentence}",
    ]
    if bio_first:
        paragraphs.append(f"A little about me: {bio_first}")
    if length != "concise":
        paragraphs.append(
            "I would start by confirming the exact requirements and the deliverables you expect, "
            "then share progress regularly so you can give feedback early."
        )
    if length == "detailed" and profile.portfolio_urls:
        paragraphs.append(f"You can see examples of my work here: {profile.portfolio_urls[0]}")
    paragraphs.append("What is the most important result you want from this project?")
    paragraphs.append(f"Best regards,\n{first_name}")
    return "\n\n".join(paragraphs)


def clean_output(text: str) -> str:
    """Remove markdown fences/bold that some models add despite the instructions."""
    text = re.sub(r"^```\w*\n?|```$", "", text.strip(), flags=re.MULTILINE)
    text = text.replace("**", "")
    return text.strip()


_URL = re.compile(r"(?:https?://|www\.)[^\s<>()\"']+", re.IGNORECASE)


def fix_links(text: str, allowed: list[str]) -> str:
    """
    Make every link in the draft one of the user's real portfolio links.
    LLMs sometimes miscopy URLs (seen live: "https://github.com/x" written as "https://github.x"),
    and a broken link in a proposal looks bad to clients. A link that is not exactly one of the
    user's links is replaced by the closest real one, or removed if nothing is close.
    """
    def replace(match: re.Match[str]) -> str:
        found = match.group(0)
        tail = ""
        while found and found[-1] in ".,;:!?":
            found, tail = found[:-1], found[-1] + tail  # keep sentence punctuation outside the link
        if found in allowed:
            return found + tail
        best = max(allowed, key=lambda u: SequenceMatcher(None, found.lower(), u.lower()).ratio(), default=None)
        if best and SequenceMatcher(None, found.lower(), best.lower()).ratio() >= 0.6:
            return best + tail
        return tail  # an invented link is dropped
    return _URL.sub(replace, text)


def _rate_limit_key(user_id: object) -> str:
    return f"rl:proposals:{user_id}:{datetime.now(timezone.utc):%Y-%m-%d}"


def remaining_today(user_id: object) -> int:
    try:
        used = int(redis_client.get(_rate_limit_key(user_id)) or 0)
    except Exception:
        used = 0
    return max(0, settings.PROPOSALS_PER_DAY - used)


GLOBAL_USER = "all"  # the counter for all users together


def global_ai_available() -> bool:
    """
    False once all users together used PROPOSALS_GLOBAL_PER_DAY AI drafts today. The free LLM key has its own
    daily quota; without this, a busy day used it up and every later draft failed (slowly) before falling back.
    """
    try:
        used = int(redis_client.get(_rate_limit_key(GLOBAL_USER)) or 0)
    except Exception:
        return True
    return used < settings.PROPOSALS_GLOBAL_PER_DAY


def record_use(user_id: object) -> None:
    """Count one AI draft towards today's limit (the user's and the site-wide one)."""
    for who in (user_id, GLOBAL_USER):
        key = _rate_limit_key(who)
        try:
            if redis_client.incr(key) == 1:
                redis_client.expire(key, 26 * 3600)
        except Exception as exc:  # Redis down -> do not block the user
            log.warning("Proposal rate limit skipped: %s", exc)


def draft_proposal(job: Job, profile: Profile, user: User, tone: str, length: str,
                   client: LLMClient | None = None) -> Draft:
    client = client or LLMClient()
    try:
        content = clean_output(client.generate(SYSTEM_PROMPT, build_prompt(job, profile, user, tone, length)))
        content = fix_links(content, list(profile.portfolio_urls or []))
        return Draft(content=content, is_fallback=False, provider=client.provider, model=client.model)
    except LLMError as exc:
        log.warning("LLM unavailable, using template proposal: %s", exc)
        return Draft(content=fallback_proposal(job, profile, user, length), is_fallback=True,
                     provider="template", model=None)


def generate_and_save(db: Session, user: User, profile: Profile, job: Job, tone: str, length: str) -> Proposal:
    if remaining_today(user.id) <= 0:
        raise RateLimitExceeded()
    if global_ai_available():
        draft = draft_proposal(job, profile, user, tone, length)
    else:  # site-wide AI budget used up today: the free template, straight away (no slow failing AI call)
        log.warning("Site-wide AI proposal limit (%d/day) reached: using the template", settings.PROPOSALS_GLOBAL_PER_DAY)
        draft = Draft(content=fallback_proposal(job, profile, user, length), is_fallback=True,
                      provider="template", model=None)
    if not draft.is_fallback:
        record_use(user.id)  # only real AI drafts count: a template after an AI failure is free
    proposal = Proposal(user_id=user.id, job_id=job.id, tone=tone, length=length, content=draft.content,
                        is_fallback=draft.is_fallback, provider=draft.provider, model=draft.model)
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return proposal
