"""Recognition pipeline routes — standalone face detection & identification."""

from flask import Blueprint, request, jsonify, current_app

from app.utils.helpers import decode_base64_image
from app.services.face_detection import get_detector
from app.services.face_recognition import generate_embedding, find_best_match
from app.models.enrollment import get_all_profiles
from app.models.user import find_user_by_id

recognition_bp = Blueprint("recognition", __name__)


@recognition_bp.route("/detect", methods=["POST"])
def detect_faces():
    """Accept a base64 frame → return face bounding boxes."""
    d = request.get_json(silent=True) or {}
    frame = d.get("frame")
    if not frame:
        return jsonify({"error": "frame (base64) is required"}), 400

    img = decode_base64_image(frame)
    detector = get_detector()
    faces = detector.detect_faces(img)

    return jsonify({
        "faces": [
            {
                "bbox": f["bbox"],
                "confidence": round(f["confidence"], 4),
            }
            for f in faces
        ]
    })


@recognition_bp.route("/identify", methods=["POST"])
def identify_faces():
    """Full pipeline: frame → detect → embed → match → return student IDs."""
    d = request.get_json(silent=True) or {}
    frame = d.get("frame")
    if not frame:
        return jsonify({"error": "frame (base64) is required"}), 400

    img = decode_base64_image(frame)
    detector = get_detector()
    faces = detector.detect_faces(img)

    if not faces:
        return jsonify({"matches": [], "faces_detected": 0})

    profiles = get_all_profiles(["user_id", "face_embeddings", "roll_number"])
    threshold = current_app.config.get("FACENET_THRESHOLD", 0.6)

    matches = []
    for face in faces:
        embedding = generate_embedding(face["crop"])
        match = find_best_match(embedding, profiles, threshold=threshold)
        if match:
            user = find_user_by_id(match["user_id"])
            match["name"] = user["name"] if user else "Unknown"
            matches.append(match)

    return jsonify({
        "matches": matches,
        "faces_detected": len(faces),
    })
