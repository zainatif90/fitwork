"""
Point the fixed FitWork address (a free *static* Hugging Face Space) at the current tunnel address.

Usage:  python deploy/update_redirect.py https://<random>.trycloudflare.com
The Hugging Face token is read from C:\\Users\\PSBA\\FitWork\\hf_token.txt (outside the repo).
Static Spaces are free on Hugging Face; this page only forwards visitors, it holds no data.
"""
import sys
from pathlib import Path

from huggingface_hub import HfApi

TOKEN_FILE = Path(r"C:\Users\PSBA\FitWork\hf_token.txt")
SPACE = "fitwork"

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FitWork</title>
<style>
 body{{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;min-height:100vh}}
 .card{{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:40px;max-width:440px;text-align:center;box-shadow:0 1px 3px #0001}}
 a.btn{{display:inline-block;margin-top:20px;background:#4f46e5;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600}}
 p{{color:#475569}}
</style></head>
<body><div class="card">
 <h1 style="color:#4f46e5;margin:0">FitWork</h1>
 <p>Freelance jobs matched to your skills with an explainable Match Score.</p>
 <a class="btn" href="{url}" target="_top" rel="noopener">Open FitWork</a>
 <p style="font-size:13px;margin-top:18px">Taking you there automatically…</p>
</div>
<script>
 // Outside an iframe: go straight to the app (keeping any path, e.g. /reset-password?token=...).
 if (window.top === window.self) {{ location.replace("{url}" + location.pathname.replace(/\\/index\\.html$/, "") + location.search); }}
</script>
</body></html>
"""

README = """---
title: FitWork
emoji: 🎯
colorFrom: indigo
colorTo: blue
sdk: static
pinned: false
short_description: Freelance job matching with an explainable Match Score
---
"""


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].startswith("https://"):
        sys.exit("usage: update_redirect.py https://<tunnel-address>")
    url = sys.argv[1].rstrip("/")
    api = HfApi(token=TOKEN_FILE.read_text().strip())
    repo_id = f"{api.whoami()['name']}/{SPACE}"
    api.create_repo(repo_id, repo_type="space", space_sdk="static", exist_ok=True, private=False)
    api.upload_file(path_or_fileobj=README.encode(), path_in_repo="README.md", repo_id=repo_id, repo_type="space",
                    commit_message="FitWork landing")
    api.upload_file(path_or_fileobj=PAGE.format(url=url).encode(), path_in_repo="index.html", repo_id=repo_id,
                    repo_type="space", commit_message=f"Point to {url}")
    host = getattr(api.space_info(repo_id), "host", None)
    print(f"fixed address updated: {host or repo_id} -> {url}")


if __name__ == "__main__":
    main()
