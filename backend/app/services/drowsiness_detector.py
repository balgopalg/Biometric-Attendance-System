import threading
import mediapipe as mp
import numpy as np
from scipy.spatial import distance as dist
from app.config import Config

class DrowsinessDetector:
    """Service to detect drowsiness (eyes closed or yawning) from an RGB frame."""
    
    def __init__(self, ear_threshold=0.25, mar_threshold=0.6):
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5
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
        results = self.face_mesh.process(frame_rgb)
        if not results.multi_face_landmarks:
            return {"status": "no_face"}

        landmarks = results.multi_face_landmarks[0].landmark
        h, w, _ = frame_rgb.shape
        
        # Convert landmarks to pixel coordinates
        coords = np.array([(int(idx.x * w), int(idx.y * h)) for idx in landmarks])
        
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
            "is_drowsy": bool(is_eyes_closed or is_yawning)
        }

    def close(self):
        self.face_mesh.close()

# Module-level singleton to prevent heavy reloading
_detector = None
_detector_lock = threading.Lock()

def get_drowsiness_detector() -> DrowsinessDetector:
    global _detector
    if _detector is None:
        with _detector_lock:
            if _detector is None:
                _detector = DrowsinessDetector(
                    ear_threshold=Config.DROWSINESS_EAR_THRESHOLD,
                    mar_threshold=Config.DROWSINESS_MAR_THRESHOLD
                )
    return _detector
