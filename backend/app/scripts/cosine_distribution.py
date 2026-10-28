"""
Print the real distribution of cosine similarity between sample profiles and all active jobs.
This is the evidence for the SEM_LOW / SEM_HIGH calibration bounds in config.py.

Usage (from /backend):  .venv\\Scripts\\python.exe -m app.scripts.cosine_distribution
"""
import numpy as np
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.job import Job
from app.services import embeddings

# Example freelancer personas (test inputs, not real users)
PERSONAS = {
    "React frontend dev": (["React", "TypeScript", "Tailwind CSS", "Next.js"], "expert", "I build web dashboards."),
    "Python data scientist": (["Python", "Pandas", "Machine Learning", "SQL"], "intermediate", "Data analysis and ML models."),
    "Logo / brand designer": (["Logo Design", "Adobe Illustrator", "Brand Identity"], "expert", "Logos and brand kits."),
    "Content writer": (["Content Writing", "Copywriting", "SEO Writing"], "intermediate", "Blog posts and web copy."),
    "WordPress developer": (["WordPress", "PHP", "WooCommerce", "Elementor"], "expert", "WordPress sites and stores."),
}


def main() -> None:
    db = SessionLocal()
    try:
        vecs = np.array([list(v) for v in db.scalars(select(Job.embedding).where(Job.is_active.is_(True), Job.embedding.is_not(None)))])
    finally:
        db.close()
    print(f"Active jobs: {len(vecs)}   current bounds: SEM_LOW={settings.SEM_LOW}  SEM_HIGH={settings.SEM_HIGH}\n")
    print(f"{'persona':24} {'median':>7} {'p90':>6} {'top50 min':>9} {'top5 avg':>8} {'max':>6}")
    all_top50 = []
    for name, (skills, level, bio) in PERSONAS.items():
        p = np.array(embeddings.embed_text(embeddings.build_profile_text(skills, level, bio)))
        cos = np.sort(vecs @ p)[::-1]
        all_top50.extend(cos[:50])
        print(f"{name:24} {np.median(cos):7.3f} {np.percentile(cos, 90):6.3f} {cos[49]:9.3f} {cos[:5].mean():8.3f} {cos[0]:6.3f}")
    t = np.array(all_top50)
    print(f"\nAcross all top-50 candidates: p5={np.percentile(t, 5):.3f}  p50={np.median(t):.3f}  p95={np.percentile(t, 95):.3f}")


if __name__ == "__main__":
    main()
