"""Shared helper utilities."""

import base64
import io
import re
from datetime import datetime, timezone

import numpy as np
from PIL import Image


def decode_base64_image(data_url: str) -> np.ndarray:
    """Convert a base64-encoded image (or data-URL) to a numpy RGB array."""
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    # Pad base64 string if necessary
    missing_padding = len(data_url) % 4
    if missing_padding:
        data_url += "=" * (4 - missing_padding)
    try:
        img_bytes = base64.b64decode(data_url)
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        return np.array(image)
    except Exception as e:
        raise ValueError(f"Invalid or corrupt image data: {e}")


def encode_image_base64(img_array: np.ndarray) -> str:
    """Encode a numpy RGB array back to a base64 JPEG string."""
    image = Image.fromarray(img_array.astype("uint8"))
    buf = io.BytesIO()
    image.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode()


def utcnow():
    """Return the current UTC datetime."""
    return datetime.now(timezone.utc)


def sanitise_mongo_doc(doc: dict) -> dict:
    """Convert MongoDB ObjectId to string for JSON serialisation."""
    if doc is None:
        return None
    new_doc = dict(doc)
    if "_id" in new_doc:
        new_doc["_id"] = str(new_doc["_id"])
    return new_doc


def sanitise_many(docs) -> list:
    """Sanitise a list of Mongo documents."""
    return [sanitise_mongo_doc(d) for d in docs]


