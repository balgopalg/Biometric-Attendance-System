"""Utilities for face capture and image uploads."""

import logging
import os
import time
import uuid

import cv2
from app.utils.helpers import _as_uint8_image, save_jpeg_with_size_bounds
from app.utils.timezone import india_timestamp_token
from flask import current_app, has_app_context

logger = logging.getLogger(__name__)


def _photo_size_bounds():
    """Resolve image size bounds from config with safe defaults."""
    min_kb = 100
    max_kb = 300
    if has_app_context():
        min_kb = int(current_app.config.get("PHOTO_MIN_KB", min_kb) or min_kb)
        max_kb = int(current_app.config.get("PHOTO_MAX_KB", max_kb) or max_kb)
    if min_kb <= 0:
        min_kb = 1
    if max_kb < min_kb:
        max_kb = min_kb
    return min_kb, max_kb


def _safe_name(raw_value):
    """Keep only filename-safe characters."""
    text = str(raw_value or "").strip()
    cleaned = "".join(
        ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in text
    )
    return cleaned.strip("_") or "unknown"


def _ensure_directory(path):
    """Create a folder path and raise a clear error on failure."""
    try:
        os.makedirs(path, exist_ok=True)
    except OSError as exc:
        raise RuntimeError(f"Failed to create directory: {path}") from exc


def _save_bounded_jpeg(file_path, image):
    """Persist image as JPEG within configured storage bounds."""
    min_kb, max_kb = _photo_size_bounds()
    # Normalize to uint8 and ensure encoder receives a 3-channel BGR image.
    img = _as_uint8_image(image)
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    save_jpeg_with_size_bounds(
        file_path,
        img,
        min_kb=min_kb,
        max_kb=max_kb,
    )


def _save_fixed_jpeg(file_path, image, size=160, quality=85):
    """Save an image as a JPEG at an explicit pixel size without upscaling.

    - Ensures the saved image is exactly `size x size` by resizing or letterboxing.
    - Writes with a fixed JPEG quality to avoid the encoder's upscaling logic.
    """
    if image is None:
        raise ValueError("image is required")

    img = image
    # Normalize to uint8 and 2/3-channel layout
    img = _as_uint8_image(img)

    # If image is grayscale (2D), convert to 3-channel BGR for consistent JPEG encoding
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    h, w = img.shape[:2]
    # If larger than target, downscale; if smaller, do NOT upscale — pad instead
    if max(h, w) > size:
        # Resize so the largest side == size, preserve aspect ratio
        scale = size / float(max(h, w))
        new_w = max(1, int(round(w * scale)))
        new_h = max(1, int(round(h * scale)))
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
        h, w = img.shape[:2]

    # Create square canvas and center the resized image (letterbox with black)
    top = (size - h) // 2
    bottom = size - h - top
    left = (size - w) // 2
    right = size - w - left
    canvas = cv2.copyMakeBorder(
        img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(0, 0, 0)
    )

    # Encode with fixed quality and write file
    ok, encoded = cv2.imencode(
        ".jpg", canvas, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)]
    )
    if not ok:
        raise RuntimeError(f"Failed to encode JPEG for {file_path}")
    with open(file_path, "wb") as fh:
        fh.write(encoded.tobytes())
    return len(encoded)


def _to_grayscale_image(image):
    """Convert image array to single-channel grayscale for consistent upload storage."""
    if image is None or not hasattr(image, "shape"):
        return image

    if len(image.shape) == 2:
        return image

    if len(image.shape) == 3 and image.shape[2] == 4:
        return cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)

    if len(image.shape) == 3 and image.shape[2] == 3:
        # Input may be BGR or RGB depending on source; grayscale conversion is robust for storage.
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    return image


def capture_faces_for_user(
    user_name,
    dataset_root="dataset",
    subfolder="",
    total_images=50,
    delay_seconds=0.1,
    camera_index=0,
):
    """Capture grayscale face images from webcam into dataset/[subfolder]/<user_name>/.

    Returns a list of saved file paths.
    """
    if total_images <= 0:
        raise ValueError("total_images must be greater than 0")

    safe_user_name = _safe_name(user_name)
    user_dir = (
        os.path.join(dataset_root, subfolder, safe_user_name)
        if subfolder
        else os.path.join(dataset_root, safe_user_name)
    )
    _ensure_directory(user_dir)

    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        raise RuntimeError("Unable to access webcam")

    logger.info(
        "Face capture tip: ask the admin to slowly move their head in a U-shape or circle during capture for better side-profile coverage."
    )

    saved_paths = []
    delay_ms = max(1, int(delay_seconds * 1000))

    try:
        for idx in range(1, total_images + 1):
            ok, frame = cap.read()
            if not ok or frame is None:
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            file_name = f"{safe_user_name}_{idx}.jpg"
            file_path = os.path.join(user_dir, file_name)

            try:
                _save_bounded_jpeg(file_path, gray)
            except Exception as exc:
                raise RuntimeError(
                    f"Failed to save image: {file_path}"
                ) from exc

            saved_paths.append(file_path)
            time.sleep(delay_ms / 1000.0)
    finally:
        cap.release()

    if len(saved_paths) < total_images:
        raise RuntimeError(
            f"Capture stopped early: saved {len(saved_paths)} of {total_images} images"
        )

    return saved_paths


def save_student_upload(student_name, image, uploads_dir="uploads"):
    """Save one student photo to uploads/<student_name>_<YYYYMMDD>.jpg in grayscale."""
    if image is None:
        raise ValueError("image is required")

    _ensure_directory(uploads_dir)

    safe_student_name = _safe_name(student_name)
    date_token = india_timestamp_token().split("_")[0]
    file_name = f"{safe_student_name}_{date_token}.jpg"
    file_path = os.path.join(uploads_dir, file_name)

    image_to_save = _to_grayscale_image(image)

    try:
        _save_bounded_jpeg(file_path, image_to_save)
    except Exception as exc:
        raise RuntimeError(
            f"Failed to save student upload: {file_path}"
        ) from exc

    return file_path


def save_classroom_upload(image, uploads_dir="uploads"):
    """Save one classroom group photo copy to uploads/classroom_<timestamp>.jpg in grayscale."""
    if image is None:
        raise ValueError("image is required")

    _ensure_directory(uploads_dir)

    timestamp = india_timestamp_token()
    file_name = f"classroom_{timestamp}.jpg"
    file_path = os.path.join(uploads_dir, file_name)

    image_to_save = _to_grayscale_image(image)

    try:
        _save_bounded_jpeg(file_path, image_to_save)
    except Exception as exc:
        raise RuntimeError(
            f"Failed to save classroom upload: {file_path}"
        ) from exc

    return file_path


def save_cropped_face_dataset(
    user_name, face_crops, dataset_root="dataset", subfolder="", max_images=50
):
    """Save cropped face copies to dataset/[subfolder]/<user_name>/<user_name>_<count>.jpg."""
    safe_user_name = _safe_name(user_name)
    user_dir = (
        os.path.join(dataset_root, subfolder, safe_user_name)
        if subfolder
        else os.path.join(dataset_root, safe_user_name)
    )
    _ensure_directory(user_dir)

    saved_paths = []
    for idx, crop in enumerate((face_crops or [])[:max_images], start=1):
        if crop is None:
            continue

        image_to_save = crop
        if (
            hasattr(crop, "shape")
            and len(crop.shape) == 3
            and crop.shape[2] == 4
        ):
            image_to_save = cv2.cvtColor(crop, cv2.COLOR_BGRA2BGR)

        if (
            hasattr(image_to_save, "shape")
            and len(image_to_save.shape) == 3
            and image_to_save.shape[2] == 3
        ):
            # Detector returns RGB crops; convert to grayscale for offline dataset usage.
            image_to_save = cv2.cvtColor(image_to_save, cv2.COLOR_RGB2GRAY)

        file_name = f"{safe_user_name}_{idx}.jpg"
        file_path = os.path.join(user_dir, file_name)

        try:
            # Ensure face dataset images are saved as compact 160x160 JPEGs without upscaling
            _save_fixed_jpeg(file_path, image_to_save, size=160, quality=85)
        except Exception as exc:
            raise RuntimeError(
                f"Failed to save dataset image: {file_path}"
            ) from exc

        saved_paths.append(file_path)

    return saved_paths


def build_session_upload_folder(
    subject_label, uploads_dir="uploads", session_started_at=None
):
    """Return a stable folder path for a session based on subject + session start time."""
    safe_subject = _safe_name(subject_label)
    session_token = india_timestamp_token(session_started_at)
    folder_name = f"{safe_subject}_{session_token}"
    folder_path = os.path.join(uploads_dir, folder_name)
    return folder_path, folder_name


def save_classroom_upload_bundle(
    subject_label,
    image,
    face_crops,
    uploads_dir="uploads",
    folder_path=None,
    session_started_at=None,
):
    """Save classroom original and face crops into a session folder in grayscale."""
    if image is None:
        raise ValueError("image is required")

    _ensure_directory(uploads_dir)

    if not folder_path:
        folder_path, _folder_name = build_session_upload_folder(
            subject_label,
            uploads_dir=uploads_dir,
            session_started_at=session_started_at,
        )

    _ensure_directory(folder_path)

    upload_token = f"{india_timestamp_token()}_{uuid.uuid4().hex[:6]}"
    original_path = os.path.join(folder_path, f"original_{upload_token}.jpg")
    image_to_save = _to_grayscale_image(image)

    try:
        _save_bounded_jpeg(original_path, image_to_save)
    except Exception as exc:
        raise RuntimeError(
            f"Failed to save original classroom image: {original_path}"
        ) from exc

    saved_faces = []
    for idx, crop in enumerate(face_crops or [], start=1):
        if crop is None:
            continue

        # Convert face crops to grayscale for consistent storage and to avoid color artifacts
        crop_to_save = crop
        if hasattr(crop_to_save, "shape") and len(crop_to_save.shape) == 3:
            # If detector returned RGB convert to BGR then to gray; if already BGR, convert directly
            try:
                # Try converting assuming RGB first, fall back to BGR conversion if needed
                gray = cv2.cvtColor(crop_to_save, cv2.COLOR_RGB2GRAY)
            except Exception:
                gray = cv2.cvtColor(crop_to_save, cv2.COLOR_BGR2GRAY)
            crop_to_save = gray

        # Prefer saving a compact 160x160 face crop for storage efficiency
        face_path = os.path.join(
            folder_path, f"face_{upload_token}_{idx:02d}.jpg"
        )
        try:
            _save_fixed_jpeg(face_path, crop_to_save, size=160, quality=85)
        except Exception as exc:
            raise RuntimeError(
                f"Failed to save classroom face crop: {face_path}"
            ) from exc

        saved_faces.append(face_path)

    return {
        "folder_path": folder_path,
        "original_path": original_path,
        "face_paths": saved_faces,
    }
