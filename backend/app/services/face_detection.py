"""Face detection service using MediaPipe."""

import threading

import cv2
import numpy as np
import mediapipe as mp


class FaceDetector:
    """Detect and crop faces from an image using MediaPipe Face Detection."""

    def __init__(self, min_confidence=0.5, fallback_min_faces=4):
        self.mp_face = mp.solutions.face_detection
        self.detector = self.mp_face.FaceDetection(
            model_selection=1, min_detection_confidence=min_confidence
        )
        self.fallback_min_faces = max(1, int(fallback_min_faces))
        self.haar = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )

    def _build_face_record(self, image_rgb: np.ndarray, x: int, y: int, bw: int, bh: int, confidence: float):
        h, w, _ = image_rgb.shape

        # Add padding for better crop.
        pad = int(0.15 * max(bw, bh))
        x1 = max(x - pad, 0)
        y1 = max(y - pad, 0)
        x2 = min(x + bw + pad, w)
        y2 = min(y + bh + pad, h)

        crop = image_rgb[y1:y2, x1:x2]
        if crop.size == 0:
            return None

        crop_resized = cv2.resize(crop, (160, 160))
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
        results = self.detector.process(image_rgb)
        faces = []
        if not results.detections:
            return faces

        h, w, _ = image_rgb.shape
        for detection in results.detections:
            bb = detection.location_data.relative_bounding_box
            x = max(int(bb.xmin * w), 0)
            y = max(int(bb.ymin * h), 0)
            bw = int(bb.width * w)
            bh = int(bb.height * h)

            if bw <= 0 or bh <= 0:
                continue

            face = self._build_face_record(image_rgb, x, y, bw, bh, detection.score[0])
            if face is not None:
                faces.append(face)

        return faces

    def _detect_haar_fallback(self, image_rgb: np.ndarray):
        if self.haar.empty():
            return []

        h, w, _ = image_rgb.shape
        gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
        gray = cv2.equalizeHist(gray)

        raw_faces = self.haar.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=6,
            minSize=(60, 60),
        )

        faces = []
        for (x, y, bw, bh) in raw_faces:
            # Keep roughly face-like aspect ratios and skip tiny/noisy detections.
            ratio = bw / float(max(bh, 1))
            if ratio < 0.72 or ratio > 1.35:
                continue

            # Ignore detections too low in the frame; these are commonly false positives.
            center_y = y + (bh / 2.0)
            if center_y > (0.72 * h):
                continue

            face = self._build_face_record(image_rgb, int(x), int(y), int(bw), int(bh), 0.45)
            if face is not None:
                faces.append(face)

        return faces

    def _merge_faces(self, primary, fallback):
        merged = list(primary)
        for face in fallback:
            bbox = face["bbox"]
            duplicate = False
            for existing in merged:
                if self._iou(existing["bbox"], bbox) >= 0.35:
                    duplicate = True
                    break
            if not duplicate:
                merged.append(face)

        merged.sort(key=lambda f: f["confidence"], reverse=True)
        return merged

    def detect_faces(self, image_rgb: np.ndarray):
        """
        Detect faces in an RGB image.

        Returns a list of dicts:
          [{"bbox": (x, y, w, h), "confidence": float, "crop": np.ndarray}, ...]
        """
        primary_faces = self._detect_mediapipe(image_rgb)
        if len(primary_faces) >= self.fallback_min_faces:
            return primary_faces

        # Fallback improves tough cases (low light, side profiles, grayscale group shots).
        fallback_faces = self._detect_haar_fallback(image_rgb)
        return self._merge_faces(primary_faces, fallback_faces)

    def close(self):
        self.detector.close()


# Module-level singleton
_detector = None
_detector_lock = threading.Lock()


def get_detector() -> FaceDetector:
    global _detector
    if _detector is None:
        with _detector_lock:
            if _detector is None:
                _detector = FaceDetector()
    return _detector
