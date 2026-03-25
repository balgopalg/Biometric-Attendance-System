"""Shared helper utilities."""

import base64
import io
import re
from datetime import datetime

import numpy as np
from PIL import Image


def decode_base64_image(data_url: str) -> np.ndarray:
    """Convert a base64-encoded image (or data-URL) to a numpy RGB array."""
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    img_bytes = base64.b64decode(data_url)
    image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    return np.array(image)


def encode_image_base64(img_array: np.ndarray) -> str:
    """Encode a numpy RGB array back to a base64 JPEG string."""
    image = Image.fromarray(img_array.astype("uint8"))
    buf = io.BytesIO()
    image.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode()


def utcnow():
    """Return the current UTC datetime."""
    return datetime.utcnow()


def sanitise_mongo_doc(doc: dict) -> dict:
    """Convert MongoDB ObjectId to string for JSON serialisation."""
    if doc is None:
        return None
    doc["_id"] = str(doc["_id"])
    return doc


def sanitise_many(docs) -> list:
    """Sanitise a list of Mongo documents."""
    return [sanitise_mongo_doc(d) for d in docs]


def validate_email(email: str) -> bool:
    pattern = r"^[\w\.\+\-]+@[\w\-]+\.[\w]{2,}$"
    return bool(re.match(pattern, email))
