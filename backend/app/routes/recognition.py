"""Recognition pipeline routes — standalone face detection & identification."""

from flask import Blueprint, request, jsonify, current_app
import cv2
import numpy as np

from app.security.rate_limiter import limiter
from app.utils.helpers import decode_base64_image
from app.utils.auth_decorators import role_required
from app.services.face_detection import get_detector
from app.services.face_recognition import (
    generate_embedding,
    find_best_match_cached,
    prepare_profile_candidates,
)
from app.services.profile_cache import get_profiles_for_paper_cached
from app.models.user import find_user_by_id
from app.utils.validation import validate_object_id

recognition_bp = Blueprint("recognition", __name__)


@recognition_bp.route("/detect", methods=["POST"])
@role_required("lecturer", "admin")
@limiter.limit("30 per minute")
def detect_faces(user):
    """Accept a frame (multipart image or base64 JSON) → return face bounding boxes."""
    if "image" in request.files:
        file = request.files["image"]
        img_bytes = file.read()
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return jsonify({"error": "Invalid image file provided via multipart"}), 400
    else:
        d = request.get_json(silent=True) or {}
        frame = d.get("frame")
        if not frame:
            return jsonify({"error": "image (multipart) or frame (base64) is required"}), 400
        try:
            img = decode_base64_image(frame)
        except ValueError as e:
            current_app.logger.warning("Invalid base64 image data: %s", e)
            return jsonify({"error": "Invalid image data"}), 400
        
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
@role_required("lecturer", "admin")
@limiter.limit("20 per minute")
def identify_faces(user):
    """Full pipeline: frame (multipart/base64) → detect → embed → match → return student IDs."""
    if "image" in request.files:
        file = request.files["image"]
        img_bytes = file.read()
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return jsonify({"error": "Invalid image file provided via multipart"}), 400
    else:
        d = request.get_json(silent=True) or {}
        frame = d.get("frame")
        if not frame:
            return jsonify({"error": "image (multipart) or frame (base64) is required"}), 400
        try:
            img = decode_base64_image(frame)
        except ValueError as e:
            return jsonify({"error": f"Invalid image data: {e}"}), 400
        
    detector = get_detector()
    faces = detector.detect_faces(img)

    if not faces:
        return jsonify({"matches": [], "faces_detected": 0})

    d = request.get_json(silent=True) or {}
    paper_id = str(d.get("paper_id", "")).strip()
    if not paper_id or not validate_object_id(paper_id):
        return jsonify({"error": "Valid paper_id is required for identification"}), 400

    profiles = get_profiles_for_paper_cached(paper_id)
    # Reuse cached candidates if already prepared (contain vectors)
    candidates = profiles if profiles and profiles[0].get('vectors') else prepare_profile_candidates(profiles)
    threshold = current_app.config.get("FACENET_THRESHOLD", 0.6)

    matches = []
    for face in faces:
        embedding = generate_embedding(face["crop"])
        match, _score = find_best_match_cached(embedding, candidates, threshold=threshold)
        if match:
            matched_user = find_user_by_id(match["user_id"])
            match["name"] = matched_user["name"] if matched_user else "Unknown"
            matches.append(match)

    return jsonify({
        "matches": matches,
        "faces_detected": len(faces),
    })
