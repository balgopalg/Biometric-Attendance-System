"""Face recognition service using FaceNet embeddings + cosine similarity."""

import os
import warnings

import numpy as np
from flask import current_app, has_app_context

from app.models.enrollment import decode_face_embedding


# We use keras-facenet which provides a ready-to-use InceptionResNetV1 model.
# It will be lazily loaded on first call to avoid slow startup.
import threading

_model = None
_model_is_stub = False
_model_lock = threading.Lock()

def _current_env():
    if has_app_context():
        try:
            env = current_app.config.get("ENV")
            if env:
                return str(env).strip().lower()
        except Exception:
            pass  # nosec B110

    return (os.getenv("FLASK_ENV") or os.getenv("ENV") or "").strip().lower()

def is_model_stub() -> bool:
    return _model_is_stub

def normalize_embedding(embedding: list) -> list:
    """Return an L2-normalized embedding vector as a Python list."""
    vector = np.asarray(embedding, dtype=np.float32).reshape(-1)
    norm = float(np.linalg.norm(vector))
    if norm <= 0.0:
        return vector.tolist()
    return (vector / norm).tolist()

def _load_model():
    global _model, _model_is_stub
    if _model is not None:
        return _model

    with _model_lock:
        if _model is not None:
            return _model

        try:
            # Force TF CPU to prevent MediaPipe GPU allocation hangs.
            os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
            os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
            
            from keras_facenet import FaceNet
            _model = FaceNet()
            _model_is_stub = False
            
            # Pre-warm model cache in background to prevent first-call latency
            def _warmup():
                try:
                    _model.embeddings(np.zeros((1, 160, 160, 3), dtype=np.uint8))
                except Exception:
                    pass
            threading.Thread(target=_warmup, daemon=True).start()
            
        except Exception as exc:
            env = _current_env()
            if env not in {"development", "dev", "local", "testing", "test"}:
                raise RuntimeError(
                    f"CRITICAL: FaceNet model failed to load in {env or 'unknown'} environment: {exc}"
                ) from exc
            warnings.warn(
                "keras-facenet not available — using RANDOM embeddings (dev mode only)."
            )

            class StubModel:
                def embeddings(self, images):
                    return [np.random.randn(512).tolist() for _ in images]

            _model = StubModel()
            _model_is_stub = True

    return _model


def generate_embedding(face_crop: np.ndarray) -> list:
    """
    Generate a 512-d embedding from a 160x160 RGB face crop.

    Parameters
    ----------
    face_crop : np.ndarray
        A (160, 160, 3) uint8 RGB image.

    Returns
    -------
    list of float
        512-dimensional embedding vector.
    """
    model = _load_model()
    face_crop = np.expand_dims(face_crop, axis=0)  # (1, 160, 160, 3)
    embeddings = model.embeddings(face_crop)
    first = embeddings[0]
    if hasattr(first, "tolist"):
        return normalize_embedding(first.tolist())
    return normalize_embedding(list(first))


def compare_embeddings(embedding_a: list, embedding_b: list) -> float:
    """Return cosine similarity (1 = identical, 0 = orthogonal)."""
    a = np.asarray(normalize_embedding(embedding_a), dtype=np.float32)
    b = np.asarray(normalize_embedding(embedding_b), dtype=np.float32)
    return float(np.clip(np.dot(a, b), -1.0, 1.0))


def prepare_profile_candidates(stored_profiles: list) -> list:
    """Pre-normalize embeddings once for repeated matching in a session."""
    prepared = []
    for profile in stored_profiles:
        vectors = []
        for emb in profile.get("face_embeddings", []):
            decoded = decode_face_embedding(emb)
            if decoded is None:
                continue
            vectors.append(np.asarray(normalize_embedding(decoded), dtype=np.float32))

        if not vectors:
            continue

        prepared.append(
            {
                "user_id": str(profile.get("user_id", profile.get("_id"))),
                "reg_number": profile.get("reg_number", ""),
                "vectors": vectors,
            }
        )
    return prepared


def find_best_match_cached(query_embedding: list, prepared_candidates: list, threshold=0.6):
    """Match against pre-normalized candidates. Returns (match_dict_or_none, best_score)."""
    if not prepared_candidates:
        return None, -1.0

    query = np.asarray(normalize_embedding(query_embedding), dtype=np.float32)
    best_candidate = None
    best_score = -1.0

    for candidate in prepared_candidates:
        for vec in candidate["vectors"]:
            sim = float(np.dot(query, vec))
            if sim > best_score:
                best_score = sim
                best_candidate = candidate

    if best_candidate and best_score >= threshold:
        return (
            {
                "user_id": best_candidate["user_id"],
                "similarity": round(best_score, 4),
                "reg_number": best_candidate.get("reg_number", ""),
            },
            best_score,
        )

    return None, best_score


def find_best_match(query_embedding: list, stored_profiles: list, threshold=0.6):
    """Compare a query embedding against all stored student profiles.

    .. deprecated::
        Prefer ``find_best_match_cached`` which pre-normalizes embeddings for
        O(1) cosine similarity per comparison. This function re-normalizes on
        every call and should only be used for single-profile verification.

    Parameters
    ----------
    query_embedding : list
        512-d embedding of the detected face.
    stored_profiles : list[dict]
        Each profile must have 'user_id' and 'face_embeddings' (list of vectors).
    threshold : float
        Minimum cosine similarity to consider a match.

    Returns
    -------
    dict or None
        {"user_id": str, "similarity": float} of best match, or None.
    """
    best_match = None
    best_score = -1.0

    normalized_query = normalize_embedding(query_embedding)

    for profile in stored_profiles:
        for stored_emb in profile.get("face_embeddings", []):
            decoded = decode_face_embedding(stored_emb)
            if decoded is None:
                continue
            sim = compare_embeddings(normalized_query, decoded)
            if sim > best_score:
                best_score = sim
                best_match = profile

    if best_score >= threshold and best_match:
        return {
            "user_id": str(best_match.get("user_id", best_match.get("_id"))),
            "similarity": round(best_score, 4),
            "reg_number": best_match.get("reg_number", ""),
        }

    return None
