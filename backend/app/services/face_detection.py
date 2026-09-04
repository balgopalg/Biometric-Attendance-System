"""Face detection service using MediaPipe Tasks."""

from pathlib import Path
import threading

import cv2
import numpy as np
from mediapipe.tasks.python.core import base_options as base_options_module
from mediapipe.tasks.python.vision import face_detector as face_detector_module
from mediapipe.tasks.python.vision.core import image as image_module

from .mediapipe_assets import ensure_asset

# Minimum face bounding-box dimension (in pixels) to accept.
# Faces smaller than this produce noisy embeddings and hurt recognition accuracy.
_MIN_FACE_SIZE = 30
_MIN_VERIFIED_CONFIDENCE = 0.65
_MIN_VERIFIED_SIZE = 60
# Smaller overlapping tiles make distant faces large enough for the
# short-range detector while retaining their coordinates in the source image.
_GROUP_TILE_SIZE = 640
_GROUP_TILE_STRIDE = 320
_FACE_DETECTOR_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_detector/"
    "blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
)
_FACE_DETECTOR_MODEL_FILE = "blaze_face_short_range.tflite"


def _load_detector_model() -> Path:
    return ensure_asset(_FACE_DETECTOR_MODEL_FILE, _FACE_DETECTOR_MODEL_URL)


class FaceDetector:
    """Detect and crop faces from an image using MediaPipe Face Detection."""

    @staticmethod
    def _resize_with_letterbox(
        image: np.ndarray, size: int = 160
    ) -> np.ndarray | None:
        if image is None or not hasattr(image, "shape"):
            return None
        h, w = image.shape[:2]
        if h <= 0 or w <= 0:
            return None

        scale = size / float(max(h, w))
        new_w = max(1, int(round(w * scale)))
        new_h = max(1, int(round(h * scale)))
        interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
        resized = cv2.resize(image, (new_w, new_h), interpolation=interp)

        top = (size - new_h) // 2
        bottom = size - new_h - top
        left = (size - new_w) // 2
        right = size - new_w - left

        return cv2.copyMakeBorder(
            resized,
            top,
            bottom,
            left,
            right,
            cv2.BORDER_CONSTANT,
            value=(0, 0, 0),
        )

    def __init__(self, min_confidence=0.5, fallback_min_faces=4):
        model_path = _load_detector_model()
        options = face_detector_module.FaceDetectorOptions(
            base_options=base_options_module.BaseOptions(
                model_asset_path=str(model_path)
            ),
            min_detection_confidence=min_confidence,
        )
        self.detector = face_detector_module.FaceDetector.create_from_options(
            options
        )
        self.fallback_min_faces = max(1, int(fallback_min_faces))
        self.haar = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )

    def _build_face_record(
        self,
        image_rgb: np.ndarray,
        x: int,
        y: int,
        bw: int,
        bh: int,
        confidence: float,
    ):
        h, w, _ = image_rgb.shape

        # Skip faces too small to produce reliable embeddings.
        if bw < _MIN_FACE_SIZE or bh < _MIN_FACE_SIZE:
            return None

        # Add padding for better crop.
        pad = int(0.15 * max(bw, bh))
        x1 = max(x - pad, 0)
        y1 = max(y - pad, 0)
        x2 = min(x + bw + pad, w)
        y2 = min(y + bh + pad, h)

        crop = image_rgb[y1:y2, x1:x2]
        if crop.size == 0:
            return None

        crop_resized = self._resize_with_letterbox(crop, size=160)
        if crop_resized is None:
            return None
        return {
            "bbox": (x, y, bw, bh),
            "confidence": float(confidence),
            "crop": crop_resized,
        }

    @staticmethod
    def _iou(box_a, box_b):
        ax, ay, aw, ah = box_a
        bx, by, bw, bh = box_b

        ax2, ay2 = ax + aw, ay + ah
        bx2, by2 = bx + bw, by + bh

        inter_x1 = max(ax, bx)
        inter_y1 = max(ay, by)
        inter_x2 = min(ax2, bx2)
        inter_y2 = min(ay2, by2)

        inter_w = max(0, inter_x2 - inter_x1)
        inter_h = max(0, inter_y2 - inter_y1)
        inter_area = inter_w * inter_h
        if inter_area <= 0:
            return 0.0

        union = (aw * ah) + (bw * bh) - inter_area
        if union <= 0:
            return 0.0
        return inter_area / union

    def _detect_mediapipe(self, image_rgb: np.ndarray):
        if image_rgb is None or not hasattr(image_rgb, "shape"):
            return []

        mp_image = image_module.Image(
            image_module.ImageFormat.SRGB, np.ascontiguousarray(image_rgb)
        )
        results = self.detector.detect(mp_image)
        faces = []
        if not results.detections:
            return faces

        for detection in results.detections:
            bb = detection.bounding_box
            x = int(bb.origin_x)
            y = int(bb.origin_y)
            bw = int(bb.width)
            bh = int(bb.height)

            if bw <= 0 or bh <= 0:
                continue

            confidence = (
                float(detection.categories[0].score)
                if detection.categories
                else 0.0
            )
            face = self._build_face_record(
                image_rgb, x, y, bw, bh, confidence
            )
            if face is not None:
                faces.append(face)

        return faces

    def _detect_mediapipe_group_tiled(self, image_rgb: np.ndarray):
        """Detect faces in overlapping tiles for high-resolution group photos."""
        if image_rgb is None or not hasattr(image_rgb, "shape"):
            return []

        height, width = image_rgb.shape[:2]
        if max(height, width) <= _GROUP_TILE_SIZE:
            return []

        tile_size = min(_GROUP_TILE_SIZE, height, width)
        stride = min(_GROUP_TILE_STRIDE, tile_size)
        y_positions = list(range(0, max(1, height - tile_size + 1), stride))
        x_positions = list(range(0, max(1, width - tile_size + 1), stride))
        y_positions.append(max(0, height - tile_size))
        x_positions.append(max(0, width - tile_size))

        faces = []
        for y in sorted(set(y_positions)):
            for x in sorted(set(x_positions)):
                tile = image_rgb[y : y + tile_size, x : x + tile_size]
                for face in self._detect_mediapipe(tile):
                    face_x, face_y, face_w, face_h = face["bbox"]
                    absolute_bbox = (
                        face_x + x,
                        face_y + y,
                        face_w,
                        face_h,
                    )
                    absolute_face = self._build_face_record(
                        image_rgb,
                        *absolute_bbox,
                        face["confidence"],
                    )
                    if absolute_face is not None:
                        faces.append(absolute_face)

        return faces

    def _is_verified_face_crop(self, crop: np.ndarray):
        """Reject detector artifacts before they reach FaceNet or storage."""
        verified = self._detect_mediapipe(crop)
        crop_height, crop_width = crop.shape[:2]
        crop_area = crop_width * crop_height
        for face in verified:
            x, y, width, height = face["bbox"]
            if face["confidence"] < _MIN_VERIFIED_CONFIDENCE:
                continue
            # A real face should occupy the candidate crop, not only a
            # padded edge or background region.
            center_x = x + (width / 2.0)
            center_y = y + (height / 2.0)
            if not (0.2 * crop_width <= center_x <= 0.8 * crop_width):
                continue
            if not (0.2 * crop_height <= center_y <= 0.8 * crop_height):
                continue
            return True

        return False

    def _detect_haar_fallback(self, image_rgb: np.ndarray):
        return self._detect_haar(image_rgb, group_mode=False)

    def _detect_haar_group(self, image_rgb: np.ndarray):
        return self._detect_haar(image_rgb, group_mode=True)

    def _detect_haar(self, image_rgb: np.ndarray, group_mode=False):
        if self.haar.empty():
            return []

        if (
            image_rgb is None
            or not hasattr(image_rgb, "shape")
            or image_rgb.size == 0
        ):
            return []

        h, w, _ = image_rgb.shape
        if min(h, w) < 40:
            return []

        gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
        gray = cv2.equalizeHist(gray)

        # Group photos use smaller minSize and fewer neighbors for better recall
        min_size = (30, 30) if group_mode else (60, 60)
        min_neighbors = 4 if group_mode else 6

        try:
            raw_faces = self.haar.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=min_neighbors,
                minSize=min_size,
            )
        except cv2.error:
            return []

        faces = []
        for x, y, bw, bh in raw_faces:
            # Keep roughly face-like aspect ratios and skip tiny/noisy detections.
            ratio = bw / float(max(bh, 1))
            if ratio < 0.72 or ratio > 1.35:
                continue

            # In group mode, don't discard faces at the bottom of the frame.
            # The bottom-frame filter only applies to webcam feeds where
            # lower detections are typically false positives.
            if not group_mode:
                center_y = y + (bh / 2.0)
                if center_y > (0.72 * h):
                    continue

            face = self._build_face_record(
                image_rgb, int(x), int(y), int(bw), int(bh), 0.45
            )
            if face is not None:
                faces.append(face)

        return faces

    def _merge_faces(self, primary, fallback):
        merged = list(primary)
        for face in fallback:
            bbox = face["bbox"]
            duplicate = False
            for existing in merged:
                if self._iou(existing["bbox"], bbox) >= 0.25:
                    duplicate = True
                    break
            if not duplicate:
                merged.append(face)

        merged.sort(key=lambda f: f["confidence"], reverse=True)
        return merged

    @staticmethod
    def _nms(faces, iou_threshold=0.3):
        """Non-maximum suppression: keep highest-confidence face per overlap cluster."""
        if not faces:
            return faces
        # Already sorted by confidence descending by callers, but ensure it.
        faces = sorted(faces, key=lambda f: f["confidence"], reverse=True)
        keep = []
        for face in faces:
            dominated = False
            for kept in keep:
                if FaceDetector._iou(kept["bbox"], face["bbox"]) >= iou_threshold:
                    dominated = True
                    break
            if not dominated:
                keep.append(face)
        return keep

    def detect_faces(self, image_rgb: np.ndarray):
        """
        Detect faces in an RGB image (optimized for live webcam feeds).

        Returns a list of dicts:
          [{"bbox": (x, y, w, h), "confidence": float, "crop": np.ndarray}, ...]
        """
        return self._detect_mediapipe(image_rgb)

    def detect_faces_group(self, image_rgb: np.ndarray):
        """Detect face-only crops in an uploaded group photo.

        Group images use the tiled MediaPipe pass so small faces are enlarged
        before detection. Haar's permissive group mode is intentionally not
        merged here because it can classify hands, clothing, and objects as
        faces and send non-face crops to recognition.

        Returns a list of dicts:
          [{"bbox": (x, y, w, h), "confidence": float, "crop": np.ndarray}, ...]
        """
        primary_faces = self._detect_mediapipe(image_rgb)
        tiled_faces = self._detect_mediapipe_group_tiled(image_rgb)
        candidates = self._merge_faces(primary_faces, tiled_faces)
        verified = [
            face for face in candidates if self._is_verified_face_crop(face["crop"])
        ]
        # Final NMS pass to suppress overlapping detections from tiled merging
        return self._nms(verified, iou_threshold=0.3)

    def close(self):
        self.detector.close()


# Module-level singletons
_detector = None
_detector_lock = threading.Lock()

# Separate detector for uploaded group photos with lower confidence threshold
_group_detector = None
_group_detector_lock = threading.Lock()


def get_detector() -> FaceDetector:
    """Return the default detector (webcam, min_confidence=0.5)."""
    global _detector
    if _detector is None:
        with _detector_lock:
            if _detector is None:
                _detector = FaceDetector()
    return _detector


def get_group_detector() -> FaceDetector:
    """Return a permissive detector for uploaded group photos (min_confidence=0.3)."""
    global _group_detector
    if _group_detector is None:
        with _group_detector_lock:
            if _group_detector is None:
                _group_detector = FaceDetector(
                    min_confidence=0.3, fallback_min_faces=1
                )
    return _group_detector
