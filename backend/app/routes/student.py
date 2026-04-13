"""Student dashboard routes — attendance summary, predictions, exam eligibility."""

from datetime import datetime, timezone, timedelta

from flask import Blueprint, jsonify
from bson import ObjectId

from app.extensions import get_collection
from app.utils.auth_decorators import role_required
from app.utils.helpers import sanitise_mongo_doc
from app.models.enrollment import get_profile_by_user
from app.models.paper import get_paper_by_id
from app.models.course import get_course_by_id
from app.models.attendance import count_attendance

student_bp = Blueprint("student", __name__)

_INDIA_TZ = timezone(timedelta(hours=5, minutes=30))


def _format_datetime_india(value, with_time=True):
    if not value:
        return "N/A"

    dt = value
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return str(value)

    if not isinstance(dt, datetime):
        return str(value)

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    local_dt = dt.astimezone(_INDIA_TZ)
    return local_dt.strftime("%d/%m/%Y, %H:%M:%S") if with_time else local_dt.strftime("%d/%m/%Y")


def _to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_text(value):
    return str(value or "").strip()


def _to_bool(value):
    if isinstance(value, bool):
        return value
    return _as_text(value).lower() in {"1", "true", "yes", "y"}


def _id_variants(value):
    variants = []
    text = _as_text(value)
    if text:
        variants.append(text)
    try:
        oid = ObjectId(text)
        if oid not in variants:
            variants.append(oid)
    except Exception:
        pass
    return variants


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
            "course_status": _as_text((course or {}).get("status") or "active").lower() or "active",
            "is_course_inactive": _as_text((course or {}).get("status") or "active").lower() != "active",
            "subjects": subjects,
            "papers": subjects,
        }
    )


@student_bp.route("/attendance", methods=["GET"])
@role_required("student")
def attendance_summary(user):
    """Per-paper attendance percentage summary with per-class session breakdown."""
    profile = get_profile_by_user(str(user["_id"]))
    if not profile:
        return jsonify({"error": "Student profile not found"}), 404

    sessions_col = get_collection("attendance", "attendance_sessions")

    summary = []
    for paper_id in profile.get("enrolled_papers", []):
        paper_id_text = str(paper_id)
        paper = get_paper_by_id(paper_id_text)
        if not paper:
            continue

        paper_id_variants = [paper_id_text]
        try:
            paper_id_variants.append(ObjectId(paper_id_text))
        except Exception:
            pass

        committed_sessions = list(
            sessions_col.find(
                {"paper_id": {"$in": paper_id_variants}},
                {"session_id": 1, "student_ids": 1, "committed_at": 1, "last_updated_at": 1, "finalized": 1},
            )
        )
        committed_sessions.sort(
            key=lambda d: d.get("committed_at") or d.get("last_updated_at") or datetime.min,
            reverse=True,
        )

        attended = 0
        class_rows = []
        for session_doc in committed_sessions:
            session_student_ids = session_doc.get("student_ids") or []
            present = str(user["_id"]) in [str(sid) for sid in session_student_ids]
            attended += 1 if present else 0

            raw_date = session_doc.get("committed_at") or session_doc.get("last_updated_at")
            date_label = _format_datetime_india(raw_date, with_time=False)
            date_time_label = _format_datetime_india(raw_date, with_time=True)

            class_rows.append({
                "session_id": session_doc.get("session_id"),
                "date": date_label,
                "date_time": date_time_label,
                "timestamp": raw_date,
                "status": "Present" if present else "Absent",
                "present": present,
                "students_marked": len(session_student_ids),
            })

        total = len(committed_sessions) or paper.get("total_classes", 0)
        pct = round((attended / total) * 100, 2) if total > 0 else 0
        summary.append({
            "paper_id": paper_id,
            "paper_name": paper.get("name", ""),
            "paper_code": paper.get("code", ""),
            "attended": attended,
            "total_classes": total,
            "percentage": pct,
            "sessions": class_rows,
        })

    return jsonify(summary)


@student_bp.route("/predictions", methods=["GET"])
@role_required("student")
def predictions(user):
    """Overall classes needed for 75% and safe bunks remaining across enrolled papers."""
    profile = get_profile_by_user(str(user["_id"]))
    if not profile:
        return jsonify({"error": "Student profile not found"}), 404

    uid = str(user["_id"])
    enrolled_papers = profile.get("enrolled_papers", [])

    total_attended = 0
    total_classes = 0
    for paper_id in enrolled_papers:
        paper = get_paper_by_id(paper_id)
        if not paper:
            continue
        total_attended += count_attendance(uid, paper_id)
        total_classes += _to_int(paper.get("total_classes"), 0)

    overall_pct = round((total_attended / total_classes) * 100, 2) if total_classes > 0 else 0.0

    # If student attends all upcoming classes, minimum classes to reach 75%:
    # (A + n) / (T + n) >= 0.75  =>  n >= (0.75*T - A) / 0.25
    needed_float = ((0.75 * total_classes) - total_attended) / 0.25 if total_classes > 0 else 0
    classes_needed = max(0, int(needed_float) if needed_float.is_integer() else int(needed_float) + 1)

    # Maximum bunks while staying at >=75%:
    # A / (T + b) >= 0.75  =>  b <= A/0.75 - T
    safe_bunks = max(0, int((total_attended / 0.75) - total_classes)) if total_classes > 0 else 0

    result = []
    for paper_id in enrolled_papers:
        paper = get_paper_by_id(paper_id)
        if not paper:
            continue
        result.append({
            "paper_id": paper_id,
            "paper_name": paper.get("name", ""),
            "paper_code": paper.get("code", ""),
            "current_percentage": overall_pct,
            "overall_attendance_percentage": overall_pct,
            "overall_attended_classes": total_attended,
            "overall_total_classes": total_classes,
            "classes_needed_for_75": classes_needed,
            "safe_bunks_remaining": safe_bunks,
        })

    return jsonify(result)


@student_bp.route("/exam-eligibility", methods=["GET"])
@role_required("student")
def exam_eligibility(user):
    """Exam eligibility status per paper using overall attendance (>= 75% required)."""
    profile = get_profile_by_user(str(user["_id"]))
    if not profile:
        return jsonify({"error": "Student profile not found"}), 404

    uid = str(user["_id"])
    enrolled_papers = profile.get("enrolled_papers", [])

    overrides_col = get_collection("attendance", "exam_eligibility_overrides")
    uid_variants = _id_variants(uid)
    paper_variants = []
    for pid in enrolled_papers:
        paper_variants.extend(_id_variants(pid))

    override_map = {}
    if uid_variants and paper_variants:
        for override in overrides_col.find(
            {
                "student_id": {"$in": uid_variants},
                "paper_id": {"$in": paper_variants},
            },
            {
                "_id": 0,
                "paper_id": 1,
                "override_status": 1,
            },
        ):
            override_map[_as_text(override.get("paper_id"))] = _to_bool(override.get("override_status"))

    total_attended = 0
    total_classes = 0
    for paper_id in enrolled_papers:
        paper = get_paper_by_id(paper_id)
        if not paper:
            continue
        attended = count_attendance(uid, paper_id)
        classes = _to_int(paper.get("total_classes"), 0)
        total_attended += attended
        total_classes += classes

    overall_pct = round((total_attended / total_classes) * 100, 2) if total_classes > 0 else 0.0
    has_lectures = total_classes > 0
    overall_eligible = (overall_pct >= 75.0) if has_lectures else None

    result = []
    for paper_id in enrolled_papers:
        paper = get_paper_by_id(paper_id)
        if not paper:
            continue

        paper_key = _as_text(paper_id)
        has_override = paper_key in override_map
        final_eligible = override_map.get(paper_key) if has_override else overall_eligible

        if has_override:
            approval_source = "Admin approved" if final_eligible else "Admin blocked"
        elif final_eligible is None:
            approval_source = "Auto pending"
        else:
            approval_source = "Auto approved" if final_eligible else "Auto blocked"

        result.append({
            "paper_id": paper_id,
            "paper_name": paper.get("name", ""),
            "paper_code": paper.get("code", ""),
            "attendance_percentage": overall_pct,
            "overall_attendance_percentage": overall_pct,
            "overall_attended_classes": total_attended,
            "overall_total_classes": total_classes,
            "eligible": final_eligible,
            "status": "No Lectures Yet" if final_eligible is None else ("Eligible" if final_eligible else "Not Eligible"),
            "approval_source": approval_source,
        })

    return jsonify(result)
