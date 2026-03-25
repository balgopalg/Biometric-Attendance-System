"""Face detection service using MediaPipe."""

import cv2
import numpy as np
import mediapipe as mp


class FaceDetector:
    """Detect and crop faces from an image using MediaPipe Face Detection."""

    def __init__(self, min_confidence=0.5):
        self.mp_face = mp.solutions.face_detection
        self.detector = self.mp_face.FaceDetection(
            model_selection=1, min_detection_confidence=min_confidence
        )

    def detect_faces(self, image_rgb: np.ndarray):
        """
        Detect faces in an RGB image.

        Returns a list of dicts:
          [{"bbox": (x, y, w, h), "confidence": float, "crop": np.ndarray}, ...]
        """
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

            # Add padding for better crop
            pad = int(0.15 * max(bw, bh))
            x1 = max(x - pad, 0)
            y1 = max(y - pad, 0)
            x2 = min(x + bw + pad, w)
            y2 = min(y + bh + pad, h)

            crop = image_rgb[y1:y2, x1:x2]
            if crop.size == 0:
                continue

            # Resize crop to 160x160 for FaceNet input
            crop_resized = cv2.resize(crop, (160, 160))

            faces.append(
                {
                    "bbox": (x, y, bw, bh),
                    "confidence": detection.score[0],
                    "crop": crop_resized,
                }
            )

        return faces

    def close(self):
        self.detector.close()


# Module-level singleton
_detector = None


def get_detector() -> FaceDetector:
    global _detector
    if _detector is None:
        _detector = FaceDetector()
    return _detector
