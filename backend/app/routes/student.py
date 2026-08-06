"""Student dashboard routes — attendance summary, predictions, exam eligibility."""

from datetime import datetime, timedelta, timezone

from app.extensions import get_collection
from app.models.attendance import get_approved_leave_dates, session_date_str
from app.models.course import get_course_by_id
from app.models.enrollment import get_profile_by_user
from app.models.paper import get_paper_by_id
from app.repositories import find_many_by_ids
from app.utils.auth_decorators import role_required
from app.utils.helpers import (_as_text, _id_variants, _to_bool, _to_int,
                               sanitise_many, sanitise_mongo_doc)
from app.utils.validation import sanitize_string
from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request

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
    return (
        local_dt.strftime("%d/%m/%Y, %H:%M:%S")
        if with_time
        else local_dt.strftime("%d/%m/%Y")
    )


def _paper_id_variants(paper_id_text):
    """Return [str, ObjectId] variants for a paper_id."""
    variants = [paper_id_text]
    try:
        variants.append(ObjectId(paper_id_text))
    except Exception:
        pass  # nosec B110
    return variants


def _compute_paper_attendance(uid, paper_id_text, sessions_col, leave_dates):
    """Compute attendance for a single paper. Returns (attended, effective_total, leave_sessions, sessions)."""
    paper_id_variants = _paper_id_variants(paper_id_text)

    committed_sessions = list(
        sessions_col.find(
            {"paper_id": {"$in": paper_id_variants}},
            {
                "session_id": 1,
                "user_ids": 1,
                "committed_at": 1,
                "last_updated_at": 1,
                "finalized": 1,
            },
        )
    )
    committed_sessions.sort(
        key=lambda d: d.get("committed_at")
        or d.get("last_updated_at")
        or datetime.min,
        reverse=True,
    )

    attended = 0
    effective_total = 0
    leave_sessions = 0

    for sess in committed_sessions:
        sess_date = session_date_str(sess)
        if leave_dates and sess_date and sess_date in leave_dates:
            leave_sessions += 1
            continue
        effective_total += 1
        session_user_set = {str(sid) for sid in (sess.get("user_ids") or [])}
        if uid in session_user_set:
            attended += 1

    return attended, effective_total, leave_sessions, committed_sessions


# ─── Routes ──────────────────────────────────────────────────────────────────


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

    enrolled = profile.get("enrolled_papers", [])
    paper_map = find_many_by_ids("academic", "papers", enrolled)

    subjects = []
    paper_semesters = []
    for pid in enrolled:
        paper = paper_map.get(str(pid))
        if not paper:
            continue
        sem = _to_int(paper.get("semester"), 0) or None
        if sem:
            paper_semesters.append(sem)
        subjects.append(
            {
                "paper_id": str(pid),
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
                "reg_number": profile.get("reg_number")
                or profile.get("roll_number", ""),
                "academic_year": profile.get("academic_year")
                or profile.get("year", ""),
                "current_semester": current_semester,
                "course_id": profile.get("course_id", ""),
                "has_face": bool(profile.get("face_embeddings")),
            },
            "course": sanitise_mongo_doc(course) if course else None,
            "course_status": _as_text(
                (course or {}).get("status") or "active"
            ).lower()
            or "active",
            "is_course_inactive": _as_text(
                (course or {}).get("status") or "active"
            ).lower()
            != "active",
            "subjects": subjects,
            "papers": subjects,
        }
    )


@student_bp.route("/attendance", methods=["GET"])
@role_required("student")
def attendance_summary(user):
    """Per-paper attendance percentage summary with per-class session breakdown.

    Approved medical leave sessions are excluded from the denominator so they
    neither penalise the student nor artificially inflate the percentage.
    """
    profile = get_profile_by_user(str(user["_id"]))
    if not profile:
        return jsonify({"error": "Student profile not found"}), 404

    uid = str(user["_id"])
    sessions_col = get_collection("attendance", "attendance_sessions")
    enrolled = profile.get("enrolled_papers", [])

    # Feature flag: Should approved leaves be excluded from attendance denominator?
    leave_adjusted = current_app.config.get(
        "LEAVE_ADJUSTED_ATTENDANCE_ENABLED", False
    )
    if leave_adjusted:
        leave_map = get_approved_leave_dates(uid, enrolled)
    else:
        leave_map = {str(pid): set() for pid in enrolled}

    # Batch-fetch papers in one query
    paper_map = find_many_by_ids("academic", "papers", enrolled)

    summary = []
    for paper_id in enrolled:
        paper_id_text = str(paper_id)
        paper = paper_map.get(paper_id_text)
        if not paper:
            continue

        paper_leave_dates = leave_map.get(paper_id_text, set())
        attended, effective_total, leave_sessions, committed_sessions = (
            _compute_paper_attendance(
                uid,
                paper_id_text,
                sessions_col,
                paper_leave_dates if leave_adjusted else None,
            )
        )

        # Build per-session rows, tagging leave-covered sessions.
        class_rows = []
        for session_doc in committed_sessions:
            sess_date = session_date_str(session_doc)
            is_leave = leave_adjusted and bool(
                sess_date and sess_date in paper_leave_dates
            )
            session_user_ids = session_doc.get("user_ids") or []
            present = str(uid) in [str(sid) for sid in session_user_ids]

            if is_leave:
                status = "Leave (Approved)"
            elif present:
                status = "Present"
            else:
                status = "Absent"

            raw_date = session_doc.get("committed_at") or session_doc.get(
                "last_updated_at"
            )
            date_label = _format_datetime_india(raw_date, with_time=False)
            date_time_label = _format_datetime_india(raw_date, with_time=True)

            class_rows.append(
                {
                    "session_id": session_doc.get("session_id"),
                    "date": date_label,
                    "date_time": date_time_label,
                    "timestamp": raw_date,
                    "status": status,
                    "present": present,
                    "is_leave": is_leave,
                    "students_marked": len(session_user_ids),
                }
            )

        total = effective_total or paper.get("total_classes", 0)
        pct = round((attended / total) * 100, 2) if total > 0 else 0

        summary.append(
            {
                "paper_id": paper_id,
                "paper_name": paper.get("name", ""),
                "paper_code": paper.get("code", ""),
                "attended": attended,
                "total_classes": total,
                "approved_leave_sessions": leave_sessions,
                "percentage": pct,
                "sessions": class_rows,
            }
        )

    return jsonify(summary)


@student_bp.route("/predictions", methods=["GET"])
@role_required("student")
def predictions(user):
    """Overall classes needed for threshold and safe bunks remaining across enrolled papers."""
    threshold = float(current_app.config.get("ATTENDANCE_THRESHOLD", 75.0))
    threshold_dec = threshold / 100.0

    # Approved leave sessions are excluded from the total class count so the
    # threshold calculation reflects the student's real effective workload.
    profile = get_profile_by_user(str(user["_id"]))
    if not profile:
        return jsonify({"error": "Student profile not found"}), 404

    uid = str(user["_id"])
    enrolled_papers = profile.get("enrolled_papers", [])
    sessions_col = get_collection("attendance", "attendance_sessions")

    # One DB call for all approved leaves.
    leave_map = get_approved_leave_dates(uid, enrolled_papers)

    # Batch-fetch papers in one query
    paper_map = find_many_by_ids("academic", "papers", enrolled_papers)

    total_attended = 0
    total_classes = 0

    for paper_id in enrolled_papers:
        paper_id_text = str(paper_id)
        paper = paper_map.get(paper_id_text)
        if not paper:
            continue

        paper_leave_dates = leave_map.get(paper_id_text, set())
        attended, effective_total, _, committed_sessions = (
            _compute_paper_attendance(
                uid, paper_id_text, sessions_col, paper_leave_dates
            )
        )

        total_attended += attended
        # Use effective session count when available; fall back to paper metadata.
        total_classes += (
            effective_total
            if committed_sessions
            else _to_int(paper.get("total_classes"), 0)
        )

    overall_pct = (
        round((total_attended / total_classes) * 100, 2)
        if total_classes > 0
        else 0.0
    )

    # (A + n) / (T + n) >= threshold_dec  =>  n >= (threshold_dec*T - A) / (1 - threshold_dec)
    divider = 1.0 - threshold_dec
    needed_float = (
        ((threshold_dec * total_classes) - total_attended) / divider
        if divider > 0 and total_classes > 0
        else 0
    )
    classes_needed = max(
        0,
        (
            int(needed_float)
            if isinstance(needed_float, float) and needed_float.is_integer()
            else int(needed_float) + 1
        ),
    )

    # A / (T + b) >= threshold_dec  =>  b <= A/threshold_dec - T
    safe_bunks = (
        max(0, int((total_attended / threshold_dec) - total_classes))
        if threshold_dec > 0 and total_classes > 0
        else 0
    )

    result = []
    for paper_id in enrolled_papers:
        paper = paper_map.get(str(paper_id))
        if not paper:
            continue
        result.append(
            {
                "paper_id": paper_id,
                "paper_name": paper.get("name", ""),
                "paper_code": paper.get("code", ""),
                "current_percentage": overall_pct,
                "overall_attendance_percentage": overall_pct,
                "overall_attended_classes": total_attended,
                "overall_total_classes": total_classes,
                "classes_needed_for_threshold": classes_needed,
                "classes_needed_for_75": classes_needed,  # Legacy alias
                "threshold": threshold,
                "safe_bunks_remaining": safe_bunks,
            }
        )

    return jsonify(result)


@student_bp.route("/exam-eligibility", methods=["GET"])
@role_required("student")
def exam_eligibility(user):
    """Exam eligibility status per paper using overall attendance.
    Threshold: ATTENDANCE_THRESHOLD (defaults to 75.0%).
    """
    threshold = float(current_app.config.get("ATTENDANCE_THRESHOLD", 75.0))

    # Approved leave sessions are excluded from the denominator before evaluating
    # the threshold, ensuring medical absences do not disqualify eligible students.
    profile = get_profile_by_user(str(user["_id"]))
    if not profile:
        return jsonify({"error": "Student profile not found"}), 404

    uid = str(user["_id"])
    enrolled_papers = profile.get("enrolled_papers", [])
    sessions_col = get_collection("attendance", "attendance_sessions")

    # Admin overrides take final precedence over all calculations.
    overrides_col = get_collection("attendance", "exam_eligibility_overrides")
    uid_variants = _id_variants(uid)
    paper_variants = []
    for pid in enrolled_papers:
        paper_variants.extend(_id_variants(str(pid)))

    override_map = {}
    if uid_variants and paper_variants:
        for override in overrides_col.find(
            {
                "user_id": {"$in": uid_variants},
                "paper_id": {"$in": paper_variants},
            },
            {"_id": 0, "paper_id": 1, "override_status": 1},
        ):
            override_map[_as_text(override.get("paper_id"))] = _to_bool(
                override.get("override_status")
            )

    # Pre-fetch approved leave dates in one DB call.
    leave_map = get_approved_leave_dates(uid, enrolled_papers)

    # Batch-fetch papers in one query
    paper_map = find_many_by_ids("academic", "papers", enrolled_papers)

    total_attended = 0
    total_classes = 0
    total_leave_sessions = 0

    for paper_id in enrolled_papers:
        paper_id_text = str(paper_id)
        paper = paper_map.get(paper_id_text)
        if not paper:
            continue

        paper_leave_dates = leave_map.get(paper_id_text, set())
        attended, effective_total, leave_sessions, committed_sessions = (
            _compute_paper_attendance(
                uid, paper_id_text, sessions_col, paper_leave_dates
            )
        )

        total_attended += attended
        total_leave_sessions += leave_sessions
        total_classes += (
            effective_total
            if committed_sessions
            else _to_int(paper.get("total_classes"), 0)
        )

    overall_pct = (
        round((total_attended / total_classes) * 100, 2)
        if total_classes > 0
        else 0.0
    )
    has_lectures = total_classes > 0
    overall_eligible = (overall_pct >= threshold) if has_lectures else None

    result = []
    for paper_id in enrolled_papers:
        paper = paper_map.get(str(paper_id))
        if not paper:
            continue

        paper_key = _as_text(paper_id)
        has_override = paper_key in override_map
        final_eligible = (
            override_map.get(paper_key) if has_override else overall_eligible
        )

        if has_override:
            approval_source = (
                "Admin approved" if final_eligible else "Admin blocked"
            )
        elif final_eligible is None:
            approval_source = "Auto pending"
        else:
            approval_source = (
                "Auto approved" if final_eligible else "Auto blocked"
            )

        result.append(
            {
                "paper_id": paper_id,
                "paper_name": paper.get("name", ""),
                "paper_code": paper.get("code", ""),
                "attendance_percentage": overall_pct,
                "overall_attendance_percentage": overall_pct,
                "overall_attended_classes": total_attended,
                "overall_total_classes": total_classes,
                "approved_leave_sessions": total_leave_sessions,
                "eligible": final_eligible,
                "status": (
                    "No Lectures Yet"
                    if final_eligible is None
                    else ("Eligible" if final_eligible else "Not Eligible")
                ),
                "approval_source": approval_source,
            }
        )

    return jsonify(result)


@student_bp.route("/leave-requests", methods=["GET", "POST"])
@role_required("student")
def manage_leave_requests(user):
    """Submit a medical leave appeal or fetch past appeals."""
    leaves_col = get_collection("academic", "leave_requests")

    if request.method == "POST":
        d = request.get_json(silent=True) or {}
        start_date = _as_text(d.get("start_date") or d.get("date"))
        end_date = _as_text(d.get("end_date") or start_date)
        reason = sanitize_string(d.get("reason") or "", max_length=500)
        paper_id = d.get("paper_id")  # Null indicates "Global/All Papers"

        # Validate dates are in proper format (YYYY-MM-DD)
        def _parse_calendar_date(date_str):
            if not date_str:
                return False
            try:
                datetime.strptime(date_str, "%Y-%m-%d")
                return True
            except Exception:
                return False

        if not _parse_calendar_date(start_date) or not _parse_calendar_date(
            end_date
        ):
            return (
                jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}),
                400,
            )
        if not reason:
            return jsonify({"error": "Reason is required"}), 400

        new_leave = {
            "user_id": str(user["_id"]),
            "start_date": start_date,
            "end_date": end_date,
            "date": start_date,  # Fallback for legacy compatibility
            "paper_id": paper_id,
            "reason": reason,
            "status": "pending",
            "created_at": datetime.now(timezone.utc),
        }
        leaves_col.insert_one(new_leave)
        return (
            jsonify({"message": "Leave request submitted successfully"}),
            201,
        )

    requests_cursor = leaves_col.find({"user_id": str(user["_id"])}).sort(
        "created_at", -1
    )
    return jsonify(sanitise_many(list(requests_cursor)))
