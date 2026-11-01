"""
Skill helpers shared by ingestion, matching and the skill gap radar.

- canonical_skill(): maps spelling variants ("React.js", "ReactJS") to one key ("react"),
  so "matched skills" are not missed just because two sites spell a skill differently.
- extract_skills(): finds known skills inside free text (used when a job has no skill tags).
"""
import re
from collections.abc import Iterable, Sequence
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.skill import Skill

# Spelling variants -> canonical lowercase key
ALIASES: dict[str, str] = {
    "react.js": "react", "reactjs": "react", "react js": "react",
    "node": "node.js", "nodejs": "node.js", "node js": "node.js",
    "vue": "vue.js", "vuejs": "vue.js",
    "next": "next.js", "nextjs": "next.js",
    "angular.js": "angular", "angularjs": "angular",
    "express": "express.js", "expressjs": "express.js",
    "js": "javascript", "ts": "typescript",
    "golang": "go",
    "postgres": "postgresql",
    "html5": "html", "css3": "css",
    "amazon web services": "aws",
    "gcp": "google cloud platform", "google cloud": "google cloud platform",
    "azure": "microsoft azure",
    "iphone": "ios", "ipad": "ios",
    "c# programming": "c#", "c++ programming": "c++", "c programming": "c",
    "seo": "search engine optimization", "seo optimization": "search engine optimization",
    "ui/ux": "ui/ux design", "ux / ui": "ui/ux design", "user interface / ia": "ui design",
    "photoshop": "adobe photoshop", "illustrator": "adobe illustrator",
    "after effects": "adobe after effects", "premiere pro": "adobe premiere pro",
    "ms excel": "excel", "microsoft excel": "excel",
    "nlp": "natural language processing", "ml": "machine learning",
    "llm": "large language models", "chatgpt api": "openai api",
    "wordpress development": "wordpress", "shopify development": "shopify",
    "mobile app": "mobile app development", "app development": "mobile app development",
    "website design": "web design", "website designing": "web design", "web designing": "web design",
    "website development": "web development", "website developer": "web development",
    # QA / testing: users write the same skill in many ways
    "qa": "qa testing", "sqa": "qa testing", "quality assurance": "qa testing", "testing / qa": "qa testing",
    "software testing": "qa testing", "software quality assurance": "qa testing", "qa engineer": "qa testing",
    "manual qa": "manual testing",
    "qa automation": "automation testing", "automation qa": "automation testing",
    "test automation": "automation testing", "automated testing": "automation testing",
    "api test": "api testing", "rest api testing": "api testing",
}

# Very short or common words that would create false matches in free text ("go to", "a C grade").
_AMBIGUOUS_IN_TEXT = {"c", "r", "go", "qt", "sales", "editing", "consulting", "automation", "nft", "ai",
                      "architecture", "documentation"}

# Generic words that appear in jobs of every field; they are never suggested as a skill to learn next.
NOT_SUGGESTED = {"documentation", "architecture", "consulting", "sales", "automation", "editing"}


def canonical_skill(name: str) -> str:
    key = " ".join(name.lower().split())
    return ALIASES.get(key, key)


def canonical_set(skills: Iterable[str]) -> set[str]:
    return {canonical_skill(s) for s in skills if s.strip()}


@lru_cache(maxsize=16)
def _compiled_patterns(names: tuple[str, ...]) -> list[tuple[str, re.Pattern[str]]]:
    patterns = []
    for name in names:
        if name.lower() in _AMBIGUOUS_IN_TEXT:
            continue
        # Word boundaries that also work for names like "C++", "C#", ".NET", "Node.js"
        patterns.append((name, re.compile(rf"(?<![\w+#.]){re.escape(name)}(?![\w+#])", re.IGNORECASE)))
    return patterns


def known_skill_names(db: Session) -> tuple[str, ...]:
    return tuple(db.scalars(select(Skill.name).order_by(Skill.name)))


def extract_skills(text: str, known: Sequence[str], limit: int = 12) -> list[str]:
    """Return known skills that appear in `text`, in order of first appearance."""
    found: list[tuple[int, str]] = []
    for name, pattern in _compiled_patterns(tuple(known)):
        m = pattern.search(text)
        if m:
            found.append((m.start(), name))
    found.sort()
    result: list[str] = []
    seen: set[str] = set()
    for _, name in found:
        key = canonical_skill(name)
        if key not in seen:
            seen.add(key)
            result.append(name)
    return result[:limit]


def skills_in_text(text: str, skills: Sequence[str]) -> set[str]:
    """Canonical keys of the given skills that appear in `text` as whole words (e.g. "QA" in "QA Tester needed")."""
    return {canonical_skill(name) for name in extract_skills(text, skills, limit=len(skills))}
