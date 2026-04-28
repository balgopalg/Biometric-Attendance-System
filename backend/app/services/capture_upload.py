"""Utilities for face capture and image uploads."""

import logging
import os
import uuid

import cv2
from flask import current_app, has_app_context

from app.utils.timezone import india_timestamp_token
from app.utils.helpers import save_jpeg_with_size_bounds


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
    cleaned = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in text)
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
    save_jpeg_with_size_bounds(
        file_path,
        image,
        min_kb=min_kb,
        max_kb=max_kb,
    )


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


def capture_faces_for_user(user_name, dataset_root="dataset", total_images=50, delay_seconds=0.1, camera_index=0):
    """Capture grayscale face images from webcam into dataset/<user_name>/.

    Returns a list of saved file paths.
    """
    if total_images <= 0:
        raise ValueError("total_images must be greater than 0")

    safe_user_name = _safe_name(user_name)
    user_dir = os.path.join(dataset_root, safe_user_name)
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
                raise RuntimeError(f"Failed to save image: {file_path}") from exc

            saved_paths.append(file_path)

            cv2.imshow("Face Capture", gray)
            if cv2.waitKey(delay_ms) & 0xFF == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()

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
        raise RuntimeError(f"Failed to save student upload: {file_path}") from exc

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
        raise RuntimeError(f"Failed to save classroom upload: {file_path}") from exc

    return file_path


def save_cropped_face_dataset(user_name, face_crops, dataset_root="dataset", max_images=50):
    """Save cropped face copies to dataset/<user_name>/<user_name>_<count>.jpg."""
    safe_user_name = _safe_name(user_name)
    user_dir = os.path.join(dataset_root, safe_user_name)
    _ensure_directory(user_dir)

    saved_paths = []
    for idx, crop in enumerate((face_crops or [])[:max_images], start=1):
        if crop is None:
            continue

        image_to_save = crop
        if hasattr(crop, "shape") and len(crop.shape) == 3 and crop.shape[2] == 4:
            image_to_save = cv2.cvtColor(crop, cv2.COLOR_BGRA2BGR)

        if hasattr(image_to_save, "shape") and len(image_to_save.shape) == 3 and image_to_save.shape[2] == 3:
            # Detector returns RGB crops; convert to grayscale for offline dataset usage.
            image_to_save = cv2.cvtColor(image_to_save, cv2.COLOR_RGB2GRAY)

        file_name = f"{safe_user_name}_{idx}.jpg"
        file_path = os.path.join(user_dir, file_name)

        try:
            _save_bounded_jpeg(file_path, image_to_save)
        except Exception as exc:
            raise RuntimeError(f"Failed to save dataset image: {file_path}") from exc

        saved_paths.append(file_path)

    return saved_paths


def build_session_upload_folder(subject_label, uploads_dir="uploads", session_started_at=None):
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
        raise RuntimeError(f"Failed to save original classroom image: {original_path}") from exc

    saved_faces = []
    for idx, crop in enumerate(face_crops or [], start=1):
        if crop is None:
            continue

        crop_to_save = _to_grayscale_image(crop)

        face_path = os.path.join(folder_path, f"face_{upload_token}_{idx:02d}.jpg")
        try:
            _save_bounded_jpeg(face_path, crop_to_save)
        except Exception as exc:
            raise RuntimeError(f"Failed to save classroom face crop: {face_path}") from exc

        saved_faces.append(face_path)

    return {
        "folder_path": folder_path,
        "original_path": original_path,
        "face_paths": saved_faces,
    }
