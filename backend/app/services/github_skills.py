"""
"Import my skills from GitHub" (added 19 Nov 2026).

The user types a GitHub username; we read that account's PUBLIC repositories with the GitHub REST API
(GET https://api.github.com/users/{username}/repos) and turn each repository's main language and topics into
skills from FitWork's skill dictionary (the same 370+ names the skill autocomplete uses).

- Forks are skipped (someone else's work), and skills the user already has are not suggested again.
- Each suggestion says how many repositories use it and names up to 3 of them, so it is evidence, not a guess.
- Nothing is saved: the user decides which suggestions to add to the profile.
- GitHub allows 60 requests an hour without a token (per server IP), so results are cached for an hour per
  username and each FitWork user can look up 10 names an hour. GITHUB_TOKEN (optional) raises GitHub's limit.
"""
import logging
import re
from collections import Counter
from collections.abc import Sequence
from typing import Any

import httpx

from app.core.config import settings
from app.services.skill_utils import canonical_set, canonical_skill

log = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
MAX_SUGGESTIONS = 15
# GitHub usernames: letters, digits and single hyphens, not at the start or end, at most 39 characters.
_USERNAME = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$")

# GitHub names that are not the same word as the skill in our dictionary (compared after canonical_skill).
GITHUB_ALIASES = {
    "jupyternotebook": "Python", "cpp": "C++", "csharp": "C#", "k8s": "Kubernetes", "shell": "Bash",
    "dockerfile": "Docker", "hcl": "Terraform", "scss": "Sass", "postgres": "PostgreSQL", "js": "JavaScript",
    "ts": "TypeScript", "ml": "Machine Learning", "dl": "Deep Learning", "nlp": "Natural Language Processing",
}


class GitHubError(Exception):
    def __init__(self, message: str, status: int) -> None:
        super().__init__(message)
        self.status = status


def valid_username(name: str) -> bool:
    return bool(_USERNAME.match(name or ""))


def fetch_repos(username: str) -> list[dict[str, Any]]:
    """The user's own public repositories, most recently pushed first (one request, up to 100 repos)."""
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "FitWork-FYP",
               "X-GitHub-Api-Version": "2022-11-28"}
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    try:
        res = httpx.get(f"{GITHUB_API}/users/{username}/repos", headers=headers, timeout=15,
                        params={"per_page": 100, "sort": "pushed", "type": "owner"})
    except httpx.HTTPError as exc:
        raise GitHubError("Could not reach GitHub. Please try again.", 503) from exc
    if res.status_code == 404:
        raise GitHubError("No GitHub user with that name.", 404)
    if res.status_code in (403, 429):
        raise GitHubError("GitHub is busy right now. Please try again in a few minutes.", 503)
    if res.status_code != 200:
        raise GitHubError("GitHub did not answer. Please try again.", 503)
    data = res.json()
    return data if isinstance(data, list) else []


def suggest_skills(repos: list[dict[str, Any]], known: Sequence[str], have: Sequence[str]) -> list[dict[str, Any]]:
    """Map repository languages and topics to known skills; most-used first. Pure function (unit-tested)."""
    index = {canonical_skill(name): name for name in known}
    mine = canonical_set(have)
    counts: Counter[str] = Counter()
    examples: dict[str, list[str]] = {}
    for repo in repos:
        if repo.get("fork"):
            continue
        terms = [repo.get("language")] + list(repo.get("topics") or [])
        found: set[str] = set()
        for term in filter(None, terms):
            key = canonical_skill(str(term))
            alias = GITHUB_ALIASES.get(key)
            skill = index.get(canonical_skill(alias)) if alias else index.get(key)
            if skill is None:
                skill = index.get(canonical_skill(str(term).replace("-", " ")))
            if skill and canonical_skill(skill) not in mine:
                found.add(skill)
        for skill in found:                       # a skill counts once per repository
            counts[skill] += 1
            examples.setdefault(skill, []).append(str(repo.get("name", "")))
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:MAX_SUGGESTIONS]
    return [{"skill": s, "repos": n, "examples": examples[s][:3]} for s, n in ranked]


def github_skill_suggestions(username: str, known: Sequence[str], have: Sequence[str]) -> dict[str, Any]:
    from app.core.redis_client import cache_get, cache_set

    key = f"github:repos:{username.lower()}"
    repos = cache_get(key)
    if repos is None:
        repos = [{"name": r.get("name"), "fork": bool(r.get("fork")), "language": r.get("language"),
                  "topics": r.get("topics") or []} for r in fetch_repos(username)]
        cache_set(key, repos, 3600)
    own = [r for r in repos if not r.get("fork")]
    return {"username": username, "repos_scanned": len(own), "suggestions": suggest_skills(repos, known, have)}
