"""
Deploy FitWork to a free Hugging Face Docker Space (no card, no GitHub needed).

One container serves the React website AND the FastAPI backend (backend/Dockerfile).
The database is Neon (free). Cache / rate limits use the built-in in-memory store (REDIS_URL=memory).

Usage (from the repo root, with the backend venv):
    $env:HF_TOKEN="hf_..."            # Hugging Face -> Settings -> Access Tokens -> Write token
    $env:NEON_URL="postgresql://..."  # Neon connection string
    $env:DEMO_PASSWORD="..."          # same as DEMO.md
    backend\\.venv\\Scripts\\python.exe deploy\\huggingface_deploy.py

Secrets go into the Space's encrypted secret store, never into the uploaded files.
Run it again after code changes: it re-uploads and the Space rebuilds.
"""
import os
import secrets
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parents[1]
SPACE_NAME = "fitwork"

# Only what the Docker build needs is uploaded (tests, load tests, other deploy configs stay local).
KEEP = ["backend", "frontend", "data", ".dockerignore"]
DROP = ["backend/tests"]

SPACE_README = """---
title: FitWork
emoji: 🎯
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 8000
pinned: false
short_description: Freelance job matching with an explainable Match Score
---

# FitWork
Final year project: matches freelance jobs to a freelancer's skills with NLP embeddings
(all-MiniLM-L6-v2 + pgvector), explains every Match Score, drafts proposals, routes jobs inside
an agency, and shows which skill would unlock the most jobs.

Open the app directly at its `.hf.space` address for the best experience (login stays active).
"""


def stage_files(dest: Path) -> Path:
    """Copy the committed files (git archive: no .env or local secrets) and add the Space files."""
    archive = dest / "src.tar"
    subprocess.run(["git", "archive", "--format=tar", "-o", str(archive), "HEAD"], cwd=ROOT, check=True)
    with tarfile.open(archive) as tar:
        tar.extractall(dest / "all", filter="data")
    out = dest / "space"
    out.mkdir()
    for name in KEEP:
        src = dest / "all" / name
        if src.is_dir():
            shutil.copytree(src, out / name)
        else:
            shutil.copy2(src, out / name)
    for name in DROP:
        shutil.rmtree(out / name, ignore_errors=True)
    # Hugging Face builds the Dockerfile at the repo root; ours already uses repo-root-relative paths.
    shutil.copy2(out / "backend" / "Dockerfile", out / "Dockerfile")
    (out / "README.md").write_text(SPACE_README, encoding="utf-8")
    return out


def main() -> None:
    token = os.environ.get("HF_TOKEN", "").strip()
    neon = os.environ.get("NEON_URL", "").strip()
    demo_pw = os.environ.get("DEMO_PASSWORD", "").strip()
    if not (token and neon and demo_pw):
        sys.exit("Set HF_TOKEN, NEON_URL and DEMO_PASSWORD first.")

    api = HfApi(token=token)
    user = api.whoami()["name"]
    repo_id = f"{user}/{SPACE_NAME}"
    host = f"https://{user.lower().replace('_', '-').replace('.', '-')}-{SPACE_NAME}.hf.space"
    print(f"Hugging Face user: {user}\nSpace page: https://huggingface.co/spaces/{repo_id}\nApp URL: {host}")

    api.create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True, private=False)

    # Encrypted secrets (not visible in the Space files) and plain settings
    for key, value in {
        "DATABASE_URL": neon,
        "JWT_SECRET": os.environ.get("JWT_SECRET") or secrets.token_urlsafe(48),
        "DEMO_PASSWORD": demo_pw,
        "LLM_API_KEY": os.environ.get("LLM_API_KEY", "none"),
    }.items():
        api.add_space_secret(repo_id, key, value)
    for key, value in {
        "ENV": "production",
        "REDIS_URL": "memory",
        "SCHEDULER_ENABLED": "true",
        "BOOTSTRAP_DATA": "true",
        "ENABLE_API_DOCS": "true",
        "LLM_PROVIDER": "gemini",
        "LLM_MODEL": "gemini-2.5-flash",
        "FRONTEND_URL": host,
        "CORS_ORIGINS": host,
        "FRAME_ANCESTORS": "https://huggingface.co",
    }.items():
        api.add_space_variable(repo_id, key, value)
    print("Secrets and settings saved.")

    with tempfile.TemporaryDirectory() as tmp:
        space_dir = stage_files(Path(tmp))
        api.upload_folder(folder_path=str(space_dir), repo_id=repo_id, repo_type="space",
                          commit_message="Deploy FitWork")
    print("Files uploaded. Building (usually 8-15 minutes)...", flush=True)

    started = time.time()
    last = None
    while time.time() - started < 40 * 60:
        stage = api.get_space_runtime(repo_id).stage
        if stage != last:
            print(f"  [{int(time.time() - started):4d}s] {stage}", flush=True)
            last = stage
        if stage == "RUNNING":
            print(f"LIVE: {host}")
            return
        if stage in ("BUILD_ERROR", "RUNTIME_ERROR", "CONFIG_ERROR", "NO_APP_FILE"):
            sys.exit(f"FAILED: {stage}. Logs: https://huggingface.co/spaces/{repo_id}?logs=build")
        time.sleep(15)
    sys.exit("Timed out waiting for the Space; check the build logs on Hugging Face.")


if __name__ == "__main__":
    main()
