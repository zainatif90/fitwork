"""Embedding service tests: shape, normalization, and that similar texts are closer."""
import numpy as np

from app.services import embeddings


def test_vectors_are_384_dim_and_unit_length() -> None:
    vecs = embeddings.embed_texts(["React developer", "Python data scientist", "Logo designer"])
    assert vecs.shape == (3, 384)
    assert np.allclose(np.linalg.norm(vecs, axis=1), 1.0, atol=1e-5)


def test_similar_texts_are_closer_than_unrelated() -> None:
    profile, react_job, chef_job = embeddings.embed_texts([
        "Skills: React, TypeScript, Tailwind CSS. Frontend developer.",
        "Build a React dashboard with TypeScript and Tailwind",
        "Looking for a chef to design a restaurant menu",
    ])
    assert float(profile @ react_job) > float(profile @ chef_job) + 0.2


def test_empty_input_returns_empty_array() -> None:
    assert embeddings.embed_texts([]).shape == (0, 384)


def test_normalize_handles_zero_vector() -> None:
    out = embeddings.normalize(np.array([[0.0, 0.0], [3.0, 4.0]]))
    assert np.allclose(out[0], [0.0, 0.0])
    assert np.allclose(out[1], [0.6, 0.8])


def test_profile_text_puts_skills_first() -> None:
    text = embeddings.build_profile_text(["React", "Node.js"], "expert", "  I build web apps. ")
    assert text.startswith("Skills: React, Node.js.")
    assert text.endswith("I build web apps.")
