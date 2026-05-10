"""Recognition pipeline routes — standalone face detection & identification."""

import cv2
import numpy as np
from app.models.user import find_user_by_id
from app.security.rate_limiter import limiter
from app.services.face_detection import get_detector
from app.services.face_recognition import (find_best_match_cached,
                                           generate_embedding,
                                           generate_embeddings_batch,
                                           prepare_profile_candidates)
from app.services.profile_cache import get_profiles_for_paper_cached
from app.utils.auth_decorators import role_required
from app.utils.helpers import decode_base64_image
from app.utils.validation import validate_object_id
from flask import Blueprint, current_app, jsonify, request

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
            return (
                jsonify(
                    {"error": "Invalid image file provided via multipart"}
                ),
                400,
            )
    else:
        d = request.get_json(silent=True) or {}
        frame = d.get("frame")
        if not frame:
            return (
                jsonify(
                    {
                        "error": "image (multipart) or frame (base64) is required"
                    }
                ),
                400,
            )
        try:
            img = decode_base64_image(frame)
        except ValueError as e:
            current_app.logger.warning("Invalid base64 image data: %s", e)
            return jsonify({"error": "Invalid image data"}), 400

    detector = get_detector()
    faces = detector.detect_faces(img)

    return jsonify(
        {
            "faces": [
                {
                    "bbox": f["bbox"],
                    "confidence": round(f["confidence"], 4),
                }
                for f in faces
            ]
        }
    )


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
            return (
                jsonify(
                    {"error": "Invalid image file provided via multipart"}
                ),
                400,
            )
    else:
        d = request.get_json(silent=True) or {}
        frame = d.get("frame")
        if not frame:
            return (
                jsonify(
                    {
                        "error": "image (multipart) or frame (base64) is required"
                    }
                ),
                400,
            )
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
        return (
            jsonify(
                {"error": "Valid paper_id is required for identification"}
            ),
            400,
        )

    profiles = get_profiles_for_paper_cached(paper_id)
    # Reuse cached candidates if already prepared (contain vectors)
    candidates = (
        profiles
        if profiles and profiles[0].get("vectors")
        else prepare_profile_candidates(profiles)
    )
    threshold = current_app.config.get("FACENET_THRESHOLD", 0.6)

    matches = []
    # Batch-generate embeddings for all detected faces in a single FaceNet call
    crops = [face["crop"] for face in faces]
    embeddings = generate_embeddings_batch(crops)

    for face, embedding in zip(faces, embeddings):
        match, _score = find_best_match_cached(
            embedding, candidates, threshold=threshold
        )
        if match:
            matches.append(match)

    if matches:
        matched_user_ids = list({m["user_id"] for m in matches})
        from app.models.user import get_users_by_ids

        users_map = get_users_by_ids(matched_user_ids)
        for match in matches:
            matched_user = users_map.get(match["user_id"])
            match["name"] = matched_user["name"] if matched_user else "Unknown"

    return jsonify(
        {
            "matches": matches,
            "faces_detected": len(faces),
        }
    )


@recognition_bp.route("/find-student", methods=["POST"])
@role_required("admin")
@limiter.limit("10 per minute")
def find_student_by_face(user):
    """Search across all student profiles to identify a student from a face frame."""
    d = request.get_json(silent=True) or {}
    frame = d.get("frame")
    if not frame:
        return jsonify({"error": "frame (base64) is required"}), 400

    try:
        img = decode_base64_image(frame)
    except ValueError as e:
        return jsonify({"error": f"Invalid image data: {e}"}), 400

    detector = get_detector()
    faces = detector.detect_faces(img)

    if not faces:
        return jsonify({"error": "No face detected in the frame"}), 400

    # Get all student profiles for matching
    from app.models.enrollment import get_all_profiles

    profiles = get_all_profiles(["user_id", "face_embeddings", "reg_number"])

    if not profiles:
        return (
            jsonify({"error": "No student profiles found for matching"}),
            404,
        )

    candidates = prepare_profile_candidates(profiles)
    threshold = current_app.config.get("FACENET_THRESHOLD", 0.6)

    # Use the largest detected face
    face = faces[0]
    embedding = generate_embedding(face["crop"])
    match, _score = find_best_match_cached(
        embedding, candidates, threshold=threshold
    )

    if not match:
        return jsonify({"error": "No matching student found"}), 404

    # Fetch full student details
    matched_user_id = match["user_id"]
    from app.extensions import get_collection
    from app.models.enrollment import get_profile_by_user
    from app.models.user import find_user_by_id
    from bson import ObjectId

    matched_user = find_user_by_id(matched_user_id)
    profile = get_profile_by_user(matched_user_id)

    if not matched_user or not profile:
        return jsonify({"error": "Matched student record is incomplete"}), 404

    # Resolve Department and Course names
    dept_name = "N/A"
    course_name = "N/A"

    if profile.get("department_id"):
        dept = get_collection("academic", "departments").find_one(
            {"_id": ObjectId(str(profile["department_id"]))}
        )
        if dept:
            dept_name = dept.get("name", "N/A")

    if profile.get("course_id"):
        course = get_collection("academic", "courses").find_one(
            {"_id": ObjectId(str(profile["course_id"]))}
        )
        if course:
            course_name = course.get("name", "N/A")
            if course.get("code"):
                course_name += f" ({course['code']})"

    from app.routes.auth import _build_profile_picture_url

    return jsonify(
        {
            "student": {
                "name": matched_user.get("name", "N/A"),
                "reg_number": profile.get("reg_number", "N/A"),
                "department": dept_name,
                "course": course_name,
                "academic_session": profile.get(
                    "academic_session", profile.get("academic_year", "N/A")
                ),
                "current_semester": profile.get("current_semester", "N/A"),
                "photo_url": _build_profile_picture_url(matched_user) or None,
                "similarity": match["similarity"],
            }
        }
    )


@recognition_bp.route("/find-lecturer", methods=["POST"])
@role_required("admin")
@limiter.limit("10 per minute")
def find_lecturer_by_face(user):
    """Search across all lecturer profiles to identify a lecturer from a face frame."""
    d = request.get_json(silent=True) or {}
    frame = d.get("frame")
    if not frame:
        return jsonify({"error": "frame (base64) is required"}), 400

    try:
        img = decode_base64_image(frame)
    except ValueError as e:
        return jsonify({"error": f"Invalid image data: {e}"}), 400

    detector = get_detector()
    faces = detector.detect_faces(img)

    if not faces:
        return jsonify({"error": "No face detected in the frame"}), 400

    # Get all lecturer profiles for matching
    from app.models.user import get_users_by_role

    lecturers = get_users_by_role("lecturer")

    if not lecturers:
        return (
            jsonify({"error": "No lecturer profiles found for matching"}),
            404,
        )

    # Filter lecturers with face embeddings
    profiles = [l for l in lecturers if l.get("face_embeddings")]

    if not profiles:
        return jsonify({"error": "No lecturer face profiles found"}), 404

    candidates = prepare_profile_candidates(profiles)
    threshold = current_app.config.get("FACENET_THRESHOLD", 0.6)

    # Use the largest detected face
    face = faces[0]
    embedding = generate_embedding(face["crop"])
    match, _score = find_best_match_cached(
        embedding, candidates, threshold=threshold
    )

    if not match:
        return jsonify({"error": "No matching lecturer found"}), 404

    # Fetch full lecturer details
    matched_user_id = match["user_id"]
    from app.extensions import get_collection
    from bson import ObjectId

    matched_user = find_user_by_id(matched_user_id)

    if not matched_user:
        return jsonify({"error": "Matched lecturer record is incomplete"}), 404

    # Resolve Department name
    dept_name = matched_user.get("department", "N/A")
    if matched_user.get("department_id"):
        dept = get_collection("academic", "departments").find_one(
            {"_id": ObjectId(str(matched_user["department_id"]))}
        )
        if dept:
            dept_name = dept.get("name", "N/A")

    from app.routes.auth import _build_profile_picture_url

    return jsonify(
        {
            "lecturer": {
                "name": matched_user.get("name", "N/A"),
                "email": matched_user.get("email", "N/A"),
                "department": dept_name,
                "photo_url": _build_profile_picture_url(matched_user) or None,
                "similarity": match["similarity"],
            }
        }
    )
