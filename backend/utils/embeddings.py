# backend/utils/embeddings.py
from functools import lru_cache
from typing import List, Sequence
from os import getenv
import numpy as np


@lru_cache(maxsize=1)
def _model():
    """
    Load and cache the SentenceTransformer model once.
    Uses a small, fast default model; override via EMBED_MODEL env.
    """
    # Lazy import so this module doesn't hard-fail if the package
    # isn't installed and embeddings are turned off.
    from sentence_transformers import SentenceTransformer

    name = getenv("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    device = getenv("EMBED_DEVICE", None)  # e.g., "cpu" or "cuda"
    # device argument is optional; SentenceTransformer will auto-select if None.
    return SentenceTransformer(name, device=device) if device else SentenceTransformer(name)


def embed(texts: Sequence[str]) -> np.ndarray:
    """
    Encode a list/tuple of strings to L2-normalized embeddings (np.ndarray, shape (n, d)).
    """
    if not isinstance(texts, (list, tuple)):
        texts = [str(texts)]
    # Guard against None and non-str items
    clean = [t if isinstance(t, str) else "" for t in texts]

    return _model().encode(
        clean,
        convert_to_numpy=True,
        normalize_embeddings=True,   # ensures unit vectors
        show_progress_bar=False,
    )


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    """
    Cosine similarity between two vectors. If inputs aren't unit-norm,
    they are normalized defensively.
    """
    a = np.asarray(a, dtype=np.float32)
    b = np.asarray(b, dtype=np.float32)

    # Normalize if not already normalized
    def _norm(v: np.ndarray) -> np.ndarray:
        n = np.linalg.norm(v)
        return v / n if n > 0 else v

    if not np.allclose(np.linalg.norm(a), 1.0, atol=1e-3):
        a = _norm(a)
    if not np.allclose(np.linalg.norm(b), 1.0, atol=1e-3):
        b = _norm(b)

    return float(np.clip(np.dot(a, b), -1.0, 1.0))
