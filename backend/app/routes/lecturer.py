"""Lecturer routes — paper list, attendance session, PIN commit and rollback."""

import random
import uuid
from collections import defaultdict
from datetime import datetime, timedelta

import numpy as np
from flask import Blueprint, request, jsonify, current_app

from app.extensions import get_collection
from app.models.audit import log_action
from app.models.attendance import log_attendance
from app.models.course import get_course_by_id
from app.models.enrollment import get_profiles_for_paper, count_profiles_for_paper
from app.models.paper import get_paper_by_id, get_papers_by_lecturer, increment_total_classes
from app.models.user import find_user_by_id, update_user
from app.services.face_detection import get_detector
from app.services.face_recognition import generate_embedding, find_best_match, compare_embeddings
from app.utils.auth_decorators import role_required
from app.utils.helpers import sanitise_mongo_doc, decode_base64_image

lecturer_bp = Blueprint("lecturer", __name__)

# In-memory active session store (would use Redis in production)
_sessions = {}
ROLLBACK_MINUTES = 30


def _enrich_paper(paper):
    item = sanitise_mongo_doc(paper)
    course = None
    if item.get("course_id"):
        try:
            course = get_course_by_id(item["course_id"])
        except Exception:
            course = None
    item["course_name"] = (course or {}).get("name")
    item["course_code"] = (course or {}).get("code")
    item["academic_year"] = item.get("academic_session") or item.get("academic_year")
    item["semester"] = item.get("semester")
    item["total_enrolled_students"] = count_profiles_for_paper(item.get("_id")) if item.get("_id") else 0
    return item


def _get_session_doc(session_id):
    sessions = get_collection("attendance", "attendance_sessions")
    return sessions.find_one({"session_id": session_id})


def _within_rollback(session_doc):
    rollback_until = session_doc.get("rollback_until")
    if not rollback_until:
        return False
    return datetime.utcnow() <= rollback_until


def _replace_session_attendance(session_id, paper_id, lecturer_id, student_ids, method="biometric"):
    # Replace entire attendance set for this session atomically from caller perspective.
    logs = get_collection("attendance", "attendance_logs")
    logs.delete_many({"session_id": session_id})
    for sid in student_ids:
        log_attendance(paper_id, sid, lecturer_id, session_id, method=method)


def _session_review_payload(session_doc):
    present_ids = session_doc.get("student_ids", [])
    present_students = []
    for uid in present_ids:
        u = find_user_by_id(uid)
        if u:
            present_students.append({
                "user_id": uid,
                "name": u.get("name", "Unknown"),
                "email": u.get("email", ""),
            })

    profiles = get_profiles_for_paper(session_doc.get("paper_id"))
    candidates = []
    for profile in profiles:
        uid = profile.get("user_id")
        u = find_user_by_id(uid)
        if u:
            candidates.append({
                "user_id": uid,
                "name": u.get("name", "Unknown"),
                "email": u.get("email", ""),
                "is_present": uid in present_ids,
            })

    paper = get_paper_by_id(session_doc.get("paper_id"))
    return {
        "session_id": session_doc.get("session_id"),
        "paper": _enrich_paper(paper) if paper else None,
        "present_students": present_students,
        "candidates": candidates,
        "committed_at": session_doc.get("committed_at"),
        "rollback_until": session_doc.get("rollback_until"),
        "editable": _within_rollback(session_doc) and not session_doc.get("finalized", False),
        "students_marked": len(present_ids),
    }


def _parse_date(value, end_of_day=False):
    if not value:
        return None
    try:
        dt = datetime.strptime(value, "%Y-%m-%d")
        if end_of_day:
            return dt + timedelta(days=1)
        return dt
    except Exception:
        return None


@lecturer_bp.route("/papers", methods=["GET"])
@role_required("lecturer")
def my_papers(user):
    """List papers assigned to the current lecturer with course/year metadata."""
    papers = get_papers_by_lecturer(str(user["_id"]))
    return jsonify([_enrich_paper(p) for p in papers])


@lecturer_bp.route("/pin", methods=["GET"])
@role_required("lecturer")
def get_pin_status(user):
    return jsonify({"has_pin": bool(str(user.get("pin", ""))), "pin_last_set": user.get("pin_last_set")})


@lecturer_bp.route("/pin", methods=["PUT"])
@role_required("lecturer")
def set_pin(user):
    d = request.get_json(silent=True) or {}
    pin = str(d.get("pin", "")).strip()
    if not pin.isdigit() or len(pin) != 4:
        return jsonify({"error": "PIN must be exactly 4 digits"}), 400

    update_user(str(user["_id"]), {"pin": pin, "pin_last_set": datetime.utcnow()})
    log_action("LECTURER_SET_PIN", str(user["_id"]), details="Lecturer updated personal PIN")
    return jsonify({"message": "PIN updated successfully"}), 200


@lecturer_bp.route("/pin/generate", methods=["POST"])
@role_required("lecturer")
def generate_pin(user):
    pin = f"{random.randint(0, 9999):04d}"
    update_user(str(user["_id"]), {"pin": pin, "pin_last_set": datetime.utcnow()})
    log_action("LECTURER_GENERATE_PIN", str(user["_id"]), details="Lecturer generated a new PIN")
    return jsonify({"pin": pin, "message": "New PIN generated"}), 200


@lecturer_bp.route("/session/start", methods=["POST"])
@role_required("lecturer")
def start_session(user):
    """Start a new attendance session for a selected paper."""
    d = request.get_json(silent=True) or {}
    paper_id = d.get("paper_id")
    if not paper_id:
        return jsonify({"error": "paper_id is required"}), 400

    paper = get_paper_by_id(paper_id)
    if not paper:
        return jsonify({"error": "Paper not found"}), 404

    if str(paper.get("lecturer_id")) != str(user["_id"]):
        return jsonify({"error": "You are not assigned to this paper"}), 403

    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "paper_id": paper_id,
        "lecturer_id": str(user["_id"]),
        "recognized": [],
        "started_at": datetime.utcnow(),
    }

    return jsonify({
        "session_id": session_id,
        "paper": _enrich_paper(paper),
        "started_at": _sessions[session_id]["started_at"],
    })


@lecturer_bp.route("/session/recognize", methods=["POST"])
@role_required("lecturer")
def recognize_frame(user):
    """Accept a webcam frame, run detection + recognition, return new matches."""
    d = request.get_json(silent=True) or {}
    session_id = d.get("session_id")
    frame_b64 = d.get("frame")

    if not session_id or session_id not in _sessions:
        return jsonify({"error": "Invalid session"}), 400
    if not frame_b64:
        return jsonify({"error": "frame is required"}), 400

    session = _sessions[session_id]
    paper_id = session["paper_id"]

    img = decode_base64_image(frame_b64)
    detector = get_detector()
    faces = detector.detect_faces(img)

    if not faces:
        return jsonify({"new_matches": [], "faces_detected": 0, "candidates_count": 0, "threshold": current_app.config.get("FACENET_THRESHOLD", 0.60), "best_similarity_seen": None})

    profiles = get_profiles_for_paper(paper_id)
    threshold = current_app.config.get("FACENET_THRESHOLD", 0.60)

    new_matches = []
    best_similarity_seen = -1.0
    for face in faces:
        embedding = generate_embedding(face["crop"])

        face_best_similarity = -1.0
        best_profile = None
        for profile in profiles:
            for stored_emb in profile.get("face_embeddings", []):
                sim = compare_embeddings(embedding, stored_emb)
                if sim > face_best_similarity:
                    face_best_similarity = sim
                    best_profile = profile
        if face_best_similarity > best_similarity_seen:
            best_similarity_seen = face_best_similarity

        match = find_best_match(embedding, profiles, threshold=threshold)
        if match and match["user_id"] not in session["recognized"]:
            session["recognized"].append(match["user_id"])
            stu_user = find_user_by_id(match["user_id"])
            match["name"] = stu_user["name"] if stu_user else "Unknown"
            new_matches.append(match)
            print(f"[RECOGNITION] Matched: {match['name']} (ID: {match['user_id']}) | Similarity: {match['similarity']} | Threshold: {threshold}")
        elif not match and best_profile:
            print(f"[RECOGNITION] Below threshold - Best match similarity: {face_best_similarity:.4f} (threshold: {threshold})")

    return jsonify({
        "new_matches": new_matches,
        "faces_detected": len(faces),
        "total_recognized": len(session["recognized"]),
        "candidates_count": len(profiles),
        "threshold": threshold,
        "best_similarity_seen": round(best_similarity_seen, 4) if best_similarity_seen >= 0 else None,
    })


@lecturer_bp.route("/session/recognize-image", methods=["POST"])
@role_required("lecturer")
def recognize_image(user):
    """Accept an uploaded classroom image, run detection + recognition, return new matches."""
    session_id = request.form.get("session_id")
    
    if not session_id or session_id not in _sessions:
        return jsonify({"error": "Invalid session"}), 400
    
    if "image" not in request.files:
        return jsonify({"error": "image file is required"}), 400
    
    file = request.files["image"]
    if not file or file.filename == "":
        return jsonify({"error": "No image file selected"}), 400
    
    session = _sessions[session_id]
    paper_id = session["paper_id"]
    
    try:
        # Read image from file
        from PIL import Image
        import io
        img_pil = Image.open(io.BytesIO(file.read()))
        img = np.array(img_pil)
        
        print(f"[DEBUG] Image shape: {img.shape}, dtype: {img.dtype}")
        
        # Ensure RGB format
        if len(img.shape) == 2:
            # Grayscale - convert to RGB
            img = np.stack([img] * 3, axis=-1)
        elif len(img.shape) == 3:
            if img.shape[2] == 4:
                # RGBA - remove alpha channel
                img = img[:, :, :3]
            elif img.shape[2] != 3:
                # Unexpected format - take first 3 channels
                img = img[:, :, :3]
        else:
            return jsonify({"error": f"Invalid image format: unexpected shape {img.shape}"}), 400
            
    except Exception as e:
        print(f"[ERROR] Image processing failed: {str(e)}")
        return jsonify({"error": f"Failed to process image: {str(e)}"}), 400
    
    detector = get_detector()
    faces = detector.detect_faces(img)
    
    if not faces:
        return jsonify({
            "new_matches": [],
            "faces_detected": 0,
            "candidates_count": 0,
            "threshold": current_app.config.get("FACENET_THRESHOLD", 0.60),
            "best_similarity_seen": None
        })
    
    profiles = get_profiles_for_paper(paper_id)
    threshold = current_app.config.get("FACENET_THRESHOLD", 0.60)

    new_matches = []
    best_similarity_seen = -1.0
    for face in faces:
        embedding = generate_embedding(face["crop"])
        
        face_best_similarity = -1.0
        best_profile = None
        for profile in profiles:
            for stored_emb in profile.get("face_embeddings", []):
                sim = compare_embeddings(embedding, stored_emb)
                if sim > face_best_similarity:
                    face_best_similarity = sim
                    best_profile = profile
        if face_best_similarity > best_similarity_seen:
            best_similarity_seen = face_best_similarity
        
        match = find_best_match(embedding, profiles, threshold=threshold)
        if match and match["user_id"] not in session["recognized"]:
            session["recognized"].append(match["user_id"])
            stu_user = find_user_by_id(match["user_id"])
            match["name"] = stu_user["name"] if stu_user else "Unknown"
            new_matches.append(match)
            print(f"[IMAGE_RECOGNITION] Matched: {match['name']} (ID: {match['user_id']}) | Similarity: {match['similarity']} | Threshold: {threshold}")
        elif not match and best_profile:
            print(f"[IMAGE_RECOGNITION] Below threshold - Best match similarity: {face_best_similarity:.4f} (threshold: {threshold})")
    
    return jsonify({
        "new_matches": new_matches,
        "faces_detected": len(faces),
        "total_recognized": len(session["recognized"]),
        "candidates_count": len(profiles),
        "threshold": threshold,
        "best_similarity_seen": round(best_similarity_seen, 4) if best_similarity_seen >= 0 else None,
    })


@lecturer_bp.route("/session/recognized", methods=["GET"])
@role_required("lecturer")
def session_recognized_list(user):
    session_id = request.args.get("session_id")
    if not session_id or session_id not in _sessions:
        return jsonify({"error": "Invalid session"}), 400

    session = _sessions[session_id]
    students = []
    for uid in session["recognized"]:
        u = find_user_by_id(uid)
        if u:
            students.append({"user_id": uid, "name": u["name"], "email": u["email"]})
    return jsonify({"students": students})


@lecturer_bp.route("/session/stop", methods=["POST"])
@role_required("lecturer")
def stop_session(user):
    """Stop and discard an active attendance session without committing."""
    d = request.get_json(silent=True) or {}
    session_id = d.get("session_id")

    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session = _sessions.get(session_id)
    if not session:
        return jsonify({"message": "Session already stopped"}), 200

    if str(session.get("lecturer_id")) != str(user["_id"]):
        return jsonify({"error": "Unauthorized"}), 403

    del _sessions[session_id]

    log_action(
        "STOP_ATTENDANCE_SESSION",
        str(user["_id"]),
        details=f"Session {session_id} stopped without commit",
    )

    return jsonify({"message": "Session stopped successfully"}), 200


@lecturer_bp.route("/session/commit", methods=["POST"])
@role_required("lecturer")
def commit_session(user):
    """Validate PIN, save attendance, and start 30-minute rollback window."""
    d = request.get_json(silent=True) or {}
    session_id = d.get("session_id")
    pin = str(d.get("pin", "")).strip()

    if not session_id or session_id not in _sessions:
        return jsonify({"error": "Invalid session"}), 400

    stored_pin = str(user.get("pin", "")).strip()
    if not stored_pin:
        return jsonify({"error": "PIN not set. Generate or set your 4-digit PIN first."}), 400
    if pin != stored_pin:
        return jsonify({"error": "Invalid PIN"}), 403

    session = _sessions[session_id]
    paper_id = session["paper_id"]
    lecturer_id = session["lecturer_id"]
    present_student_ids = list(session["recognized"])

    _replace_session_attendance(session_id, paper_id, lecturer_id, present_student_ids, method="biometric")
    increment_total_classes(paper_id)

    committed_at = datetime.utcnow()
    rollback_until = committed_at + timedelta(minutes=ROLLBACK_MINUTES)
    current_year = str(committed_at.year)
    sessions = get_collection("attendance", "attendance_sessions")
    sessions.update_one(
        {"session_id": session_id},
        {
            "$set": {
                "session_id": session_id,
                "paper_id": paper_id,
                "lecturer_id": lecturer_id,
                "student_ids": present_student_ids,
                "academic_session": current_year,
                "academic_year": current_year,
                "committed_at": committed_at,
                "rollback_until": rollback_until,
                "finalized": False,
                "last_updated_at": committed_at,
            }
        },
        upsert=True,
    )

    log_action(
        "COMMIT_ATTENDANCE",
        lecturer_id,
        details=f"Paper {paper_id}, {len(present_student_ids)} students, session {session_id}",
    )

    del _sessions[session_id]

    return jsonify({
        "message": "Attendance committed successfully",
        "students_marked": len(present_student_ids),
        "session_id": session_id,
        "rollback_until": rollback_until,
    })


@lecturer_bp.route("/session/<session_id>/review", methods=["GET"])
@role_required("lecturer")
def review_committed_session(user, session_id):
    session_doc = _get_session_doc(session_id)
    if not session_doc:
        return jsonify({"error": "Committed session not found"}), 404
    if str(session_doc.get("lecturer_id")) != str(user["_id"]):
        return jsonify({"error": "Unauthorized"}), 403

    if not _within_rollback(session_doc):
        sessions = get_collection("attendance", "attendance_sessions")
        sessions.update_one(
            {"session_id": session_id}, {"$set": {"finalized": True}}
        )
        session_doc["finalized"] = True

    return jsonify(_session_review_payload(session_doc))


@lecturer_bp.route("/session/<session_id>/adjust", methods=["PUT"])
@role_required("lecturer")
def adjust_committed_session(user, session_id):
    """Allow corrections within 30-minute rollback window, re-committed with PIN."""
    session_doc = _get_session_doc(session_id)
    if not session_doc:
        return jsonify({"error": "Committed session not found"}), 404
    if str(session_doc.get("lecturer_id")) != str(user["_id"]):
        return jsonify({"error": "Unauthorized"}), 403

    if not _within_rollback(session_doc):
        sessions = get_collection("attendance", "attendance_sessions")
        sessions.update_one(
            {"session_id": session_id}, {"$set": {"finalized": True}}
        )
        return jsonify({"error": "Rollback window expired. Session is finalized."}), 403

    d = request.get_json(silent=True) or {}
    pin = str(d.get("pin", "")).strip()
    student_ids = d.get("student_ids") or []

    stored_pin = str(user.get("pin", "")).strip()
    if not stored_pin or pin != stored_pin:
        return jsonify({"error": "Invalid PIN"}), 403

    _replace_session_attendance(
        session_id=session_id,
        paper_id=session_doc.get("paper_id"),
        lecturer_id=str(user["_id"]),
        student_ids=student_ids,
        method="manual-adjust",
    )

    sessions = get_collection("attendance", "attendance_sessions")
    sessions.update_one(
        {"session_id": session_id},
        {
            "$set": {
                "student_ids": student_ids,
                "last_updated_at": datetime.utcnow(),
            }
        },
    )

    log_action(
        "ADJUST_ATTENDANCE_WITHIN_ROLLBACK",
        str(user["_id"]),
        details=f"Session {session_id}, students {len(student_ids)}",
    )

    refreshed = _get_session_doc(session_id)
    return jsonify({
        "message": "Attendance updated and re-committed successfully",
        "review": _session_review_payload(refreshed),
    })


@lecturer_bp.route("/progress", methods=["GET"])
@role_required("lecturer")
def lecturer_progress(user):
    """Lecturer progress summary with paper/date filtering and class-wise attendance."""
    lecturer_id = str(user["_id"])
    paper_id = request.args.get("paper_id", "").strip()
    from_date = _parse_date(request.args.get("from_date", ""), end_of_day=False)
    to_date = _parse_date(request.args.get("to_date", ""), end_of_day=True)

    query = {"lecturer_id": lecturer_id}
    if paper_id:
        query["paper_id"] = paper_id
    if from_date or to_date:
        ts = {}
        if from_date:
            ts["$gte"] = from_date
        if to_date:
            ts["$lt"] = to_date
        query["timestamp"] = ts

    logs_col = get_collection("attendance", "attendance_logs")
    logs = list(logs_col.find(query).sort("timestamp", 1))
    assigned_papers = [_enrich_paper(p) for p in get_papers_by_lecturer(lecturer_id)]
    paper_lookup = {p["_id"]: p for p in assigned_papers}

    # Map committed session metadata for rollback/editability display.
    session_ids = list({log.get("session_id") for log in logs if log.get("session_id")})
    session_docs = {}
    if session_ids:
        sessions_col = get_collection("attendance", "attendance_sessions")
        docs = list(sessions_col.find({"session_id": {"$in": session_ids}}))
        session_docs = {doc.get("session_id"): doc for doc in docs}

    # Precompute total enrolled students per paper for attended/total metrics.
    enrolled_totals_by_paper = {}
    for paper in assigned_papers:
        pid = paper.get("_id")
        enrolled_totals_by_paper[pid] = len(get_profiles_for_paper(pid))

    # Group by class session.
    grouped = defaultdict(list)
    for log in logs:
        key = (log.get("session_id"), log.get("paper_id"))
        grouped[key].append(log)

    sessions = []
    for (sid, pid), entries in grouped.items():
        students = []
        seen = set()
        for entry in entries:
            stu_id = entry.get("student_id")
            if stu_id in seen:
                continue
            seen.add(stu_id)
            u = find_user_by_id(stu_id)
            students.append({
                "student_id": stu_id,
                "name": u.get("name", "Unknown") if u else "Unknown",
                "email": u.get("email", "") if u else "",
            })

        paper = paper_lookup.get(pid)
        first_ts = min((e.get("timestamp") for e in entries if e.get("timestamp")), default=None)
        session_doc = session_docs.get(sid)
        rollback_until = session_doc.get("rollback_until") if session_doc else None
        editable = False
        if session_doc:
            editable = _within_rollback(session_doc) and not session_doc.get("finalized", False)

        sessions.append({
            "session_id": sid,
            "paper_id": pid,
            "paper_name": (paper or {}).get("name") or ((get_paper_by_id(pid) or {}).get("name") if pid else "Unknown"),
            "paper_code": (paper or {}).get("code") or ((get_paper_by_id(pid) or {}).get("code") if pid else ""),
            "course_name": (paper or {}).get("course_name"),
            "academic_year": (session_doc or {}).get("academic_year") or (paper or {}).get("academic_year"),
            "timestamp": first_ts,
            "students_count": len(students),
            "total_students": enrolled_totals_by_paper.get(pid, 0),
            "students": students,
            "rollback_until": rollback_until,
            "editable": editable,
        })

    sessions.sort(key=lambda x: x.get("timestamp") or datetime.min, reverse=True)

    # Per-paper aggregate.
    paper_stats = defaultdict(lambda: {"classes_taken": 0, "attendance_marks": 0})
    for s in sessions:
        pid = s.get("paper_id")
        paper_stats[pid]["classes_taken"] += 1
        paper_stats[pid]["attendance_marks"] += s.get("students_count", 0)

    per_paper = []
    for pid, stat in paper_stats.items():
        paper = paper_lookup.get(pid)
        if not paper and pid:
            raw = get_paper_by_id(pid)
            paper = _enrich_paper(raw) if raw else None
        per_paper.append({
            "paper_id": pid,
            "paper_name": (paper or {}).get("name", "Unknown"),
            "paper_code": (paper or {}).get("code", ""),
            "course_name": (paper or {}).get("course_name"),
            "academic_year": (next((s for s in sessions if s.get("paper_id") == pid), {}) or {}).get("academic_year") or (paper or {}).get("academic_year"),
            "classes_taken": stat["classes_taken"],
            "attendance_marks": stat["attendance_marks"],
            "avg_attendance_per_class": round(
                stat["attendance_marks"] / stat["classes_taken"], 2
            ) if stat["classes_taken"] else 0,
        })

    total_classes = len(sessions)
    total_attendance_marks = sum(s.get("students_count", 0) for s in sessions)
    return jsonify({
        "filters": {
            "paper_id": paper_id or None,
            "from_date": request.args.get("from_date", "") or None,
            "to_date": request.args.get("to_date", "") or None,
        },
        "summary": {
            "total_classes_taken": total_classes,
            "total_attendance_marks": total_attendance_marks,
            "average_attendance_per_class": round(total_attendance_marks / total_classes, 2) if total_classes else 0,
        },
        "papers": assigned_papers,
        "per_paper": per_paper,
        "sessions": sessions,
    })
