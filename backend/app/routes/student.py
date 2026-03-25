"""Student dashboard routes — attendance summary, predictions, exam eligibility."""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.utils.auth_decorators import role_required
from app.utils.helpers import sanitise_mongo_doc, sanitise_many
from app.models.user import find_user_by_email
from app.models.enrollment import get_profile_by_user
from app.models.paper import get_paper_by_id
from app.models.course import get_course_by_id
from app.models.attendance import count_attendance
from app.services.attendance_calc import (
    get_attendance_percentage,
    classes_needed_for_threshold,
    safe_bunks_remaining,
)

student_bp = Blueprint("student", __name__)


def _to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@student_bp.route("/profile", methods=["GET"])
@role_required("student")
def my_profile(user):
    """Return student profile, course details and assigned subjects."""
    profile = get_profile_by_user(str(user["_id"]))
    if not profile:
        return jsonify({"error": "Student profile not found"}), 404

    course = None
    if profile.get("course_id"):
        course = get_course_by_id(profile.get("course_id"))

    subjects = []
    paper_semesters = []
    for pid in profile.get("enrolled_papers", []):
        paper = get_paper_by_id(pid)
        if not paper:
            continue
        sem = _to_int(paper.get("semester"), 0) or None
        if sem:
            paper_semesters.append(sem)
        subjects.append(
            {
                "paper_id": pid,
                "paper_name": paper.get("name", ""),
                "paper_code": paper.get("code", ""),
                "semester": sem,
                "total_classes": paper.get("total_classes", 0),
            }
        )

    current_semester = _to_int(profile.get("current_semester"), 0) or None
    if not current_semester and paper_semesters:
        current_semester = max(paper_semesters)

    return jsonify(
        {
            "student": {
                "user_id": str(user["_id"]),
                "name": user.get("name", ""),
                "email": user.get("email", ""),
                "department": user.get("department", ""),
            },
            "profile": {
                "reg_number": profile.get("reg_number") or profile.get("roll_number", ""),
                "academic_year": profile.get("academic_year") or profile.get("year", ""),
                "current_semester": current_semester,
                "course_id": profile.get("course_id", ""),
            },
            "course": sanitise_mongo_doc(course) if course else None,
            "subjects": subjects,
            "papers": subjects,
        }
    )


@student_bp.route("/attendance", methods=["GET"])
@role_required("student")
def attendance_summary(user):
    """Per-paper attendance percentage summary."""
    profile = get_profile_by_user(str(user["_id"]))
    if not profile:
        return jsonify({"error": "Student profile not found"}), 404

    summary = []
    for paper_id in profile.get("enrolled_papers", []):
        paper = get_paper_by_id(paper_id)
        if not paper:
            continue
        attended = count_attendance(str(user["_id"]), paper_id)
        total = paper.get("total_classes", 0)
        pct = round((attended / total) * 100, 2) if total > 0 else 0
        summary.append({
            "paper_id": paper_id,
            "paper_name": paper.get("name", ""),
            "paper_code": paper.get("code", ""),
            "attended": attended,
            "total_classes": total,
            "percentage": pct,
        })

    return jsonify(summary)


@student_bp.route("/predictions", methods=["GET"])
@role_required("student")
def predictions(user):
    """Classes needed for 75% and safe bunks remaining."""
    profile = get_profile_by_user(str(user["_id"]))
    if not profile:
        return jsonify({"error": "Student profile not found"}), 404

    uid = str(user["_id"])
    result = []
    for paper_id in profile.get("enrolled_papers", []):
        paper = get_paper_by_id(paper_id)
        if not paper:
            continue
        pct = get_attendance_percentage(uid, paper_id)
        needed = classes_needed_for_threshold(uid, paper_id, 75.0)
        bunks = safe_bunks_remaining(uid, paper_id, 75.0)
        result.append({
            "paper_id": paper_id,
            "paper_name": paper.get("name", ""),
            "paper_code": paper.get("code", ""),
            "current_percentage": pct,
            "classes_needed_for_75": needed,
            "safe_bunks_remaining": bunks,
        })

    return jsonify(result)


@student_bp.route("/exam-eligibility", methods=["GET"])
@role_required("student")
def exam_eligibility(user):
    """Exam eligibility status per paper (>= 75% required)."""
    profile = get_profile_by_user(str(user["_id"]))
    if not profile:
        return jsonify({"error": "Student profile not found"}), 404

    uid = str(user["_id"])
    result = []
    for paper_id in profile.get("enrolled_papers", []):
        paper = get_paper_by_id(paper_id)
        if not paper:
            continue
        pct = get_attendance_percentage(uid, paper_id)
        result.append({
            "paper_id": paper_id,
            "paper_name": paper.get("name", ""),
            "paper_code": paper.get("code", ""),
            "attendance_percentage": pct,
            "eligible": pct >= 75.0,
            "status": "Eligible" if pct >= 75.0 else "Not Eligible",
        })

    return jsonify(result)
