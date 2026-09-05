import threading

import numpy as np
from scipy.spatial import distance as dist
from mediapipe.tasks.python.core import base_options as base_options_module
from mediapipe.tasks.python.vision import face_landmarker as face_landmarker_module
from mediapipe.tasks.python.vision.core import image as image_module

from .mediapipe_assets import ensure_asset


class DrowsinessDetector:
    """Service to detect drowsiness (eyes closed or yawning) from an RGB frame."""

    _FACE_LANDMARKER_MODEL_URL = (
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
        "face_landmarker/float16/1/face_landmarker.task"
    )
    _FACE_LANDMARKER_MODEL_FILE = "face_landmarker.task"

    def __init__(self, ear_threshold=0.25, mar_threshold=0.6):
        model_path = ensure_asset(
            self._FACE_LANDMARKER_MODEL_FILE,
            self._FACE_LANDMARKER_MODEL_URL,
        )
        options = face_landmarker_module.FaceLandmarkerOptions(
            base_options=base_options_module.BaseOptions(
                model_asset_path=str(model_path)
            ),
            num_faces=1,
            min_face_detection_confidence=0.5,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        self.face_landmarker = (
            face_landmarker_module.FaceLandmarker.create_from_options(options)
        )
        self.ear_threshold = ear_threshold
        self.mar_threshold = mar_threshold

        # Landmark indices for eyes (MediaPipe Face Mesh)
        self.LEFT_EYE = [362, 385, 387, 263, 373, 380]
        self.RIGHT_EYE = [33, 160, 158, 133, 153, 144]

        # Landmark indices for mouth (inner lip)
        self.MOUTH_TOP = 13
        self.MOUTH_BOTTOM = 14
        self.MOUTH_LEFT = 78
        self.MOUTH_RIGHT = 308

    def _calculate_ear(self, eye_coords):
        v1 = dist.euclidean(eye_coords[1], eye_coords[5])
        v2 = dist.euclidean(eye_coords[2], eye_coords[4])
        h = dist.euclidean(eye_coords[0], eye_coords[3])
        return (v1 + v2) / (2.0 * h) if h > 0 else 0

    def _calculate_mar(self, coords):
        # Vertical distance
        v = dist.euclidean(coords[self.MOUTH_TOP], coords[self.MOUTH_BOTTOM])
        # Horizontal width
        h = dist.euclidean(coords[self.MOUTH_LEFT], coords[self.MOUTH_RIGHT])
        return v / h if h > 0 else 0

    def analyze_frame(self, frame_rgb: np.ndarray):
        if frame_rgb is None or not hasattr(frame_rgb, "shape"):
            return {"status": "no_face"}

        mp_image = image_module.Image(
            image_module.ImageFormat.SRGB, np.ascontiguousarray(frame_rgb)
        )
        results = self.face_landmarker.detect(mp_image)
        if not results.face_landmarks:
            return {"status": "no_face"}

        landmarks = results.face_landmarks[0]
        h, w, _ = frame_rgb.shape

        # Convert landmarks to pixel coordinates
        coords = np.array(
            [(int(idx.x * w), int(idx.y * h)) for idx in landmarks]
        )

        # Calculate Eye Aspect Ratio (EAR)
        left_ear = self._calculate_ear(coords[self.LEFT_EYE])
        right_ear = self._calculate_ear(coords[self.RIGHT_EYE])
        avg_ear = (left_ear + right_ear) / 2.0

        # Calculate Mouth Aspect Ratio (MAR)
        mar = self._calculate_mar(coords)

        is_eyes_closed = avg_ear < self.ear_threshold
        is_yawning = mar > self.mar_threshold

        return {
            "status": "success",
            "ear": float(avg_ear),
            "mar": float(mar),
            "is_eyes_closed": bool(is_eyes_closed),
            "is_yawning": bool(is_yawning),
            "is_drowsy": bool(is_eyes_closed or is_yawning),
        }

    def close(self):
        self.face_landmarker.close()


# Module-level singleton to prevent heavy reloading
_detector = None
_detector_lock = threading.Lock()


def get_drowsiness_detector() -> DrowsinessDetector:
    global _detector
    if _detector is None:
        with _detector_lock:
            if _detector is None:
                from flask import current_app

                ear = current_app.config.get("DROWSINESS_EAR_THRESHOLD", 0.25)
                mar = current_app.config.get("DROWSINESS_MAR_THRESHOLD", 0.60)
                _detector = DrowsinessDetector(
                    ear_threshold=ear,
                    mar_threshold=mar,
                )
    return _detector
