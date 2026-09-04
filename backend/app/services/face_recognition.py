"""Face recognition service using FaceNet embeddings + cosine similarity."""

import hashlib
import os
# We use keras-facenet which provides a ready-to-use InceptionResNetV1 model.
# It will be lazily loaded on first call to avoid slow startup.
import threading
import warnings

import numpy as np
from app.models.enrollment import decode_face_embedding
from app.utils.helpers import _current_env
from flask import current_app, has_app_context

_model = None
_model_is_stub = False
_model_lock = threading.Lock()
_VECTORS_CACHE = None
_VECTORS_CACHE_LOCK = threading.Lock()


def initialize_face_recognition():
    """Load FaceNet and complete one inference before serving requests."""
    model = _load_model()
    if _model_is_stub:
        return
    model.embeddings(np.zeros((1, 160, 160, 3), dtype=np.uint8))


def _init_vectors_cache():
    global _VECTORS_CACHE
    if _VECTORS_CACHE is None:
        with _VECTORS_CACHE_LOCK:
            if _VECTORS_CACHE is None:
                from collections import OrderedDict

                _VECTORS_CACHE = OrderedDict()


def _vectors_cache_get(key):
    _init_vectors_cache()
    with _VECTORS_CACHE_LOCK:
        return _VECTORS_CACHE.get(key)


def _vectors_cache_set(key, value):
    _init_vectors_cache()
    if has_app_context():
        max_entries = int(
            current_app.config.get("VECTORS_CACHE_MAX_ENTRIES", 128)
        )
    else:
        max_entries = 128
    with _VECTORS_CACHE_LOCK:
        _VECTORS_CACHE[key] = value
        _VECTORS_CACHE.move_to_end(key)
        while len(_VECTORS_CACHE) > max_entries:
            _VECTORS_CACHE.popitem(last=False)


def _prepared_candidates_cache_key(prepared_candidates: list):
    """Build a stable fingerprint for the current candidate vectors."""
    digest = hashlib.sha256()
    for candidate in prepared_candidates:
        digest.update(str(candidate.get("user_id", "")).encode("utf-8"))
        digest.update(b"\x00")
        digest.update(str(candidate.get("reg_number", "")).encode("utf-8"))
        digest.update(b"\x00")

        vectors = candidate.get("vectors", []) or []
        digest.update(str(len(vectors)).encode("ascii"))
        digest.update(b"\x00")

        for vector in vectors:
            array = np.asarray(vector, dtype=np.float32).reshape(-1)
            digest.update(str(array.shape[0]).encode("ascii"))
            digest.update(b"\x00")
            digest.update(array.tobytes())
            digest.update(b"\x00")

    return digest.hexdigest()


def is_model_stub() -> bool:
    return _model_is_stub


def _normalize_np(vector: np.ndarray) -> np.ndarray:
    """L2-normalize a numpy vector in-place (no list conversion)."""
    vec = np.asarray(vector, dtype=np.float32).reshape(-1)
    norm = np.linalg.norm(vec)
    if norm > 0.0:
        vec = vec / norm
    return vec


def normalize_embedding(embedding: list) -> list:
    """Return an L2-normalized embedding vector as a Python list."""
    return _normalize_np(np.asarray(embedding, dtype=np.float32)).tolist()


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
    return _generate_embedding_np(face_crop).tolist()


def _generate_embedding_np(face_crop: np.ndarray) -> np.ndarray:
    """Internal: generate a normalized 512-d numpy embedding (no list conversion)."""
    model = _load_model()
    batch = np.expand_dims(face_crop, axis=0)  # (1, 160, 160, 3)
    raw = model.embeddings(batch)
    return _normalize_np(np.asarray(raw[0], dtype=np.float32))


def generate_embeddings_batch(face_crops: list) -> list:
    """Generate normalized embeddings for multiple face crops in a single inference call.

    Significantly faster than calling generate_embedding() per crop because
    FaceNet processes the entire batch with optimized TF graph execution.

    Parameters
    ----------
    face_crops : list of np.ndarray
        Each element is a (160, 160, 3) uint8 RGB face crop.

    Returns
    -------
    list of np.ndarray
        Each element is a normalized 512-d float32 numpy vector.
    """
    if not face_crops:
        return []
    model = _load_model()
    batch = np.stack(face_crops)  # (N, 160, 160, 3)
    raw_embeddings = model.embeddings(batch)
    return [
        _normalize_np(np.asarray(emb, dtype=np.float32))
        for emb in raw_embeddings
    ]


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
            # Use _normalize_np to stay in numpy land (no list↔numpy conversion)
            vectors.append(
                _normalize_np(np.asarray(decoded, dtype=np.float32))
            )

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


def find_best_match_cached(
    query_embedding, prepared_candidates: list, threshold=0.6
):
    """Match against pre-normalized candidates. Returns (match_dict_or_none, best_score).

    query_embedding can be a list (will be normalized) or a pre-normalized
    np.ndarray from generate_embeddings_batch (used directly, zero-copy).
    """
    if not prepared_candidates:
        return None, -1.0

    # Accept pre-normalized numpy arrays directly to avoid redundant conversion
    if isinstance(query_embedding, np.ndarray):
        query = query_embedding.astype(np.float32)
    else:
        query = _normalize_np(np.asarray(query_embedding, dtype=np.float32))

    # Quick path: if there are few candidates, fall back to simple loop
    total_vectors = sum(
        [len(c.get("vectors", [])) for c in prepared_candidates]
    )
    best_candidate = None
    best_score = -1.0

    if total_vectors <= 128:
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

    # Vectorized path: try to reuse pre-stacked vectors from a small LRU cache.
    # Create a fingerprint key from the actual candidate vectors so re-enrollment
    # with the same vector count still invalidates stale cache entries.
    try:
        key = _prepared_candidates_cache_key(prepared_candidates)
    except Exception:
        key = None

    cached = None
    if key is not None:
        cached = _vectors_cache_get(key)

    if cached is not None:
        all_vectors, owner_indices = cached
        sims = np.dot(all_vectors, query)
    else:
        vectors_list = []
        owner_indices = []  # candidate index for each vector
        for ci, candidate in enumerate(prepared_candidates):
            vecs = candidate.get("vectors") or []
            if len(vecs) == 0:
                continue
            arr = np.asarray(vecs, dtype=np.float32)
            vectors_list.append(arr)
            owner_indices.extend([ci] * arr.shape[0])

        if not vectors_list:
            return None, -1.0

        all_vectors = np.vstack(vectors_list)  # (M, D)
        sims = np.dot(all_vectors, query)  # (M,)

        if key is not None:
            try:
                # Store small caches of stacked arrays to speed future calls
                _vectors_cache_set(
                    key,
                    (all_vectors, np.asarray(owner_indices, dtype=np.int32)),
                )
            except Exception:
                pass

    # For each candidate find max similarity across its vectors — O(M) via ufunc.at
    owner_indices = np.asarray(owner_indices, dtype=np.int32)
    num_candidates = len(prepared_candidates)
    per_candidate_best = np.full((num_candidates,), -1.0, dtype=np.float64)

    # np.maximum.at scatters element-wise max into per_candidate_best in a single pass
    np.maximum.at(per_candidate_best, owner_indices, sims.astype(np.float64))

    best_idx = int(np.argmax(per_candidate_best))
    best_score = float(per_candidate_best[best_idx])
    if best_score >= threshold:
        best_candidate = prepared_candidates[best_idx]
        return (
            {
                "user_id": best_candidate["user_id"],
                "similarity": round(best_score, 4),
                "reg_number": best_candidate.get("reg_number", ""),
            },
            best_score,
        )

    return None, best_score


def find_best_match(
    query_embedding: list, stored_profiles: list, threshold=0.6
):
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
