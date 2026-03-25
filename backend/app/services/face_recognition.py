"""Face recognition service using FaceNet embeddings + cosine similarity."""

import numpy as np
from scipy.spatial.distance import cosine

# We use keras-facenet which provides a ready-to-use InceptionResNetV1 model.
# It will be lazily loaded on first call to avoid slow startup.
_model = None


def _load_model():
    global _model
    if _model is not None:
        return _model

    try:
        from keras_facenet import FaceNet
        _model = FaceNet()
    except Exception:
        # Fallback: if keras-facenet is unavailable, we create a stub
        # that generates random embeddings (useful for UI development).
        import warnings
        warnings.warn(
            "keras-facenet not available — using RANDOM embeddings (dev mode only)."
        )

        class StubModel:
            def embeddings(self, images):
                return [np.random.randn(512).tolist() for _ in images]

        _model = StubModel()

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
        return first.tolist()
    return list(first)


def compare_embeddings(embedding_a: list, embedding_b: list) -> float:
    """Return cosine similarity (1 = identical, 0 = orthogonal)."""
    return 1.0 - cosine(embedding_a, embedding_b)


def find_best_match(query_embedding: list, stored_profiles: list, threshold=0.6):
    """
    Compare a query embedding against all stored student profiles.

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

    for profile in stored_profiles:
        for stored_emb in profile.get("face_embeddings", []):
            sim = compare_embeddings(query_embedding, stored_emb)
            if sim > best_score:
                best_score = sim
                best_match = profile

    if best_score >= threshold and best_match:
        return {
            "user_id": str(best_match.get("user_id", best_match.get("_id"))),
            "similarity": round(best_score, 4),
            "roll_number": best_match.get("roll_number", ""),
        }

    return None
