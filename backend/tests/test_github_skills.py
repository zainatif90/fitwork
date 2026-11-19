"""
"Import my skills from GitHub" (GET /api/profile/github-skills, added 19 Nov 2026).
GitHub is never called here: the repository list is injected.
"""
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.services import github_skills
from app.services.github_skills import GitHubError, suggest_skills
from tests.conftest import auth_header, register

KNOWN = ["Python", "JavaScript", "TypeScript", "React", "Next.js", "Tailwind CSS", "Django", "Docker", "Kubernetes",
         "Machine Learning", "C++", "Go"]

REPOS: list[dict[str, Any]] = [
    {"name": "portfolio", "fork": False, "language": "TypeScript", "topics": ["nextjs", "tailwindcss", "react"]},
    {"name": "shop-api", "fork": False, "language": "Python", "topics": ["django", "docker"]},
    {"name": "ml-notes", "fork": False, "language": "Jupyter Notebook", "topics": ["machine-learning"]},
    {"name": "dash", "fork": False, "language": "TypeScript", "topics": ["react", "k8s"]},
    {"name": "someone-elses-lib", "fork": True, "language": "Go", "topics": ["golang"]},   # forks are not your work
    {"name": "notes", "fork": False, "language": None, "topics": []},
]


def test_suggestions_count_repos_and_skip_forks_and_owned_skills() -> None:
    out = suggest_skills(REPOS, KNOWN, have=["react"])
    by = {s["skill"]: s for s in out}
    assert "React" not in by                                       # already on the profile (any spelling)
    assert "Go" not in by                                          # only in a fork
    assert by["TypeScript"]["repos"] == 2 and by["TypeScript"]["examples"] == ["portfolio", "dash"]
    assert by["Python"]["repos"] == 2                              # shop-api + "Jupyter Notebook" ml-notes
    assert {"Next.js", "Tailwind CSS", "Django", "Docker", "Kubernetes", "Machine Learning"} <= set(by)
    assert out[0]["repos"] >= out[-1]["repos"]                     # most-used first


def test_unknown_terms_are_ignored() -> None:
    assert suggest_skills([{"name": "x", "fork": False, "language": "Brainfuck", "topics": ["hacktoberfest"]}],
                          KNOWN, have=[]) == []


@pytest.mark.parametrize("name", ["zainatif90", "a", "octo-cat", "A1-b2"])
def test_valid_usernames(name: str) -> None:
    assert github_skills.valid_username(name)


@pytest.mark.parametrize("name", ["", "-start", "end-", "two--dashes", "has space", "x" * 40, "../etc", "a/b"])
def test_invalid_usernames(name: str) -> None:
    assert not github_skills.valid_username(name)


# ------------------------------------------------------------------ endpoint (integration)
def test_endpoint_returns_suggestions(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(github_skills, "fetch_repos", lambda username: REPOS)
    token = register(client)["access_token"]
    res = client.get("/api/profile/github-skills", params={"username": "octocat"}, headers=auth_header(token))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["username"] == "octocat" and body["repos_scanned"] == 5      # forks not counted
    assert {"TypeScript", "Python", "React"} <= {s["skill"] for s in body["suggestions"]}


def test_endpoint_rejects_bad_usernames_without_calling_github(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(github_skills, "fetch_repos", lambda username: pytest.fail("GitHub must not be called"))
    token = register(client)["access_token"]
    assert client.get("/api/profile/github-skills", params={"username": "../etc"},
                      headers=auth_header(token)).status_code == 422


def test_endpoint_unknown_user_is_404_and_github_down_is_503(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    token = register(client)["access_token"]

    def missing(username: str) -> list:
        raise GitHubError("GitHub user not found", 404)

    monkeypatch.setattr(github_skills, "fetch_repos", missing)
    assert client.get("/api/profile/github-skills", params={"username": "nobody-here"},
                      headers=auth_header(token)).status_code == 404

    def down(username: str) -> list:
        raise GitHubError("GitHub is busy", 503)

    monkeypatch.setattr(github_skills, "fetch_repos", down)
    assert client.get("/api/profile/github-skills", params={"username": "someone"},
                      headers=auth_header(token)).status_code == 503


def test_endpoint_is_rate_limited(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(github_skills, "fetch_repos", lambda username: REPOS)
    token = register(client)["access_token"]
    codes = [client.get("/api/profile/github-skills", params={"username": f"user{i}"},
                        headers=auth_header(token)).status_code for i in range(11)]
    assert codes[:10] == [200] * 10 and codes[10] == 429
