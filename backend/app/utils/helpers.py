"""Shared helper utilities."""

import base64
import io
from datetime import datetime, timezone

import cv2
import numpy as np
from PIL import Image, ImageOps


def decode_image_bytes(img_bytes: bytes) -> np.ndarray:
    """Decode raw image bytes to an RGB numpy array with EXIF orientation fixed."""
    if not img_bytes:
        raise ValueError("Image payload is empty")

    try:
        with Image.open(io.BytesIO(img_bytes)) as image:
            # Mobile photos often encode camera rotation in EXIF orientation metadata.
            corrected = ImageOps.exif_transpose(image)
            rgb = corrected.convert("RGB")
            return np.array(rgb)
    except Exception as e:
        raise ValueError(f"Invalid or corrupt image data: {e}")


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
        return decode_image_bytes(img_bytes)
    except Exception as e:
        raise ValueError(f"Invalid or corrupt image data: {e}")


def encode_image_base64(img_array: np.ndarray) -> str:
    """Encode a numpy RGB array back to a base64 JPEG string."""
    image = Image.fromarray(img_array.astype("uint8"))
    buf = io.BytesIO()
    image.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode()


def _as_uint8_image(img_array: np.ndarray) -> np.ndarray:
    """Normalize input arrays to uint8 images accepted by OpenCV encoders."""
    arr = np.asarray(img_array)
    if arr.ndim not in (2, 3):
        raise ValueError("Image must be 2D grayscale or 3D color")

    if arr.ndim == 3 and arr.shape[2] not in (1, 3, 4):
        raise ValueError("Unsupported channel count")

    if arr.dtype != np.uint8:
        arr = np.clip(arr, 0, 255).astype(np.uint8)

    if arr.ndim == 3 and arr.shape[2] == 4:
        arr = arr[:, :, :3]
    if arr.ndim == 3 and arr.shape[2] == 1:
        arr = arr[:, :, 0]

    return arr


def encode_jpeg_with_size_bounds(
    img_array: np.ndarray,
    min_kb: int = 100,
    max_kb: int = 300,
) -> bytes:
    """Encode image to JPEG while targeting a bounded file size window.

    Guarantees output <= max_kb when possible. The lower bound is best-effort
    for very small source images where JPEG output may naturally be under min_kb.
    """
    image = _as_uint8_image(img_array)
    min_bytes = max(1, int(min_kb) * 1024)
    max_bytes = max(min_bytes, int(max_kb) * 1024)

    def _encode(arr: np.ndarray, quality: int) -> bytes:
        ok, encoded = cv2.imencode(
            ".jpg",
            arr,
            [cv2.IMWRITE_JPEG_QUALITY, int(max(1, min(100, quality)))],
        )
        if not ok:
            raise RuntimeError("Failed to encode JPEG")
        return encoded.tobytes()

    best_under = None
    for quality in range(95, 24, -5):
        encoded = _encode(image, quality)
        size = len(encoded)
        if min_bytes <= size <= max_bytes:
            return encoded
        if size <= max_bytes and best_under is None:
            best_under = encoded

    if best_under is not None and len(best_under) >= min_bytes:
        return best_under

    # Try modest upscaling for very small images so output can approach min_bytes.
    if best_under is not None and len(best_under) < min_bytes:
        upscaled = image
        for _ in range(6):
            h, w = upscaled.shape[:2]
            if max(h, w) >= 1600:
                break
            upscaled = cv2.resize(
                upscaled,
                (max(1, int(w * 1.2)), max(1, int(h * 1.2))),
                interpolation=cv2.INTER_CUBIC,
            )
            for quality in range(95, 24, -5):
                encoded = _encode(upscaled, quality)
                size = len(encoded)
                if min_bytes <= size <= max_bytes:
                    return encoded
                if size <= max_bytes:
                    best_under = encoded

        if best_under is not None:
            return best_under

    resized = image
    for _ in range(8):
        h, w = resized.shape[:2]
        if min(h, w) <= 160:
            break
        resized = cv2.resize(
            resized,
            (max(1, int(w * 0.85)), max(1, int(h * 0.85))),
            interpolation=cv2.INTER_AREA,
        )
        for quality in range(90, 19, -5):
            encoded = _encode(resized, quality)
            size = len(encoded)
            if min_bytes <= size <= max_bytes:
                return encoded
            if size <= max_bytes:
                return encoded

    return _encode(resized, 20)


def save_jpeg_with_size_bounds(
    file_path: str,
    img_array: np.ndarray,
    min_kb: int = 100,
    max_kb: int = 300,
) -> int:
    """Encode and save image as JPEG with bounded file size; returns bytes written."""
    payload = encode_jpeg_with_size_bounds(img_array, min_kb=min_kb, max_kb=max_kb)
    with open(file_path, "wb") as f:
        f.write(payload)
    return len(payload)


def utcnow():
    """Return the current UTC datetime."""
    return datetime.now(timezone.utc)


def sanitise_mongo_doc(doc: dict) -> dict:
    """Convert MongoDB ObjectId fields to strings for JSON serialisation."""
    from bson import ObjectId

    if doc is None:
        return None

    def _convert(value):
        if isinstance(value, ObjectId):
            return str(value)
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, dict):
            return {k: _convert(v) for k, v in value.items()}
        if isinstance(value, list):
            return [_convert(item) for item in value]
        return value

    return _convert(dict(doc))


def sanitise_many(docs) -> list:
    """Sanitise a list of Mongo documents."""
    return [sanitise_mongo_doc(d) for d in docs]


