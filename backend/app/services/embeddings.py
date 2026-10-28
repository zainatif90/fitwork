"""
Embedding service: turns text into a 384-number vector with all-MiniLM-L6-v2.

- The model is loaded once (first use or app startup) and then reused.
- We run the ONNX version through fastembed: same model and same 384-dim output as
  sentence-transformers, but no PyTorch, so it is small enough for a free cloud server.
- Every vector is L2-normalized (length 1). For unit vectors, cosine similarity is just
  the dot product, which makes comparisons fast and consistent.
"""
import logging
import threading
from collections.abc import Sequence

import numpy as np

from app.core.config import settings

log = logging.getLogger(__name__)

_model = None
_lock = threading.Lock()


def _get_model():  # type: ignore[no-untyped-def]
    global _model
    if _model is None:
        with _lock:
            if _model is None:  # double-checked so two threads don't load it twice
                from fastembed import TextEmbedding

                log.info("Loading embedding model %s ...", settings.EMBEDDING_MODEL)
                _model = TextEmbedding(settings.EMBEDDING_MODEL, cache_dir=settings.EMBEDDING_CACHE_DIR)
                log.info("Embedding model ready")
    return _model


def warm_up() -> None:
    """Load the model at startup so the first user request is not slow."""
    embed_texts(["warm up"])


def normalize(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0  # avoid division by zero for an all-zero vector
    return vectors / norms


def embed_texts(texts: Sequence[str], batch_size: int = 64) -> np.ndarray:
    """Embed many texts at once. Returns an array of shape (len(texts), 384), each row length 1."""
    if not texts:
        return np.zeros((0, settings.EMBEDDING_DIM), dtype=np.float32)
    model = _get_model()
    vectors = np.array(list(model.embed(list(texts), batch_size=batch_size)), dtype=np.float32)
    return normalize(vectors)


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0].tolist()


# ---- Text builders: what exactly we embed -------------------------------------------------
# The model reads at most ~256 tokens, so the most important information goes first.

def build_profile_text(skills: Sequence[str], experience_level: str, bio: str) -> str:
    parts = [f"Skills: {', '.join(skills)}."]
    parts.append(f"Experience level: {experience_level}.")
    if bio.strip():
        parts.append(bio.strip())
    return " ".join(parts)


def build_job_text(title: str, skills: Sequence[str], description: str) -> str:
    parts = [title.strip() + "."]
    if skills:
        parts.append(f"Skills: {', '.join(skills)}.")
    parts.append(description.strip()[:1500])
    return " ".join(parts)
