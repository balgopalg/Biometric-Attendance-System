"""Admin CRUD routes — Courses, Papers, Lecturers, Students, Enrollment, Audit."""

import re
import random
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, current_app
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.extensions import get_collection
from app.models.attendance import log_attendance, count_attendance
from app.models.audit import log_action, get_audit_logs, get_audit_log_by_id, mark_audit_log_rolled_back
from app.models.course import (
    create_course,
    get_all_courses,
    get_course_by_id,
    update_course,
    delete_course,
)
from app.models.enrollment import (
    create_student_profile,
    get_profile_by_user,
    get_profile_by_id,
    add_face_embedding,
    enroll_in_papers,
    get_all_profiles,
    update_profile,
    delete_profile,
)
from app.models.paper import (
    create_paper,
    get_all_papers,
    get_paper_by_id,
    get_papers_by_course,
    update_paper,
    delete_paper,
    bulk_assign_lecturer,
    bulk_assign_course,
)
from app.models.user import (
    create_user,
    get_users_by_role,
    update_user,
    delete_user,
    find_user_by_id,
    find_user_by_email,
    generate_temp_password,
    reset_user_password,
)
from app.services.face_detection import get_detector
from app.services.face_recognition import generate_embedding
from app.utils.auth_decorators import role_required
from app.utils.helpers import sanitise_mongo_doc, sanitise_many, decode_base64_image

admin_bp = Blueprint("admin", __name__)


def _as_text(value):
    return str(value or "").strip()


def _normalise_year(value):
    if value is None:
        return ""
    text = _as_text(value)
    return text


def _to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_object_id(value):
    if isinstance(value, ObjectId):
        return value
    text = _as_text(value)
    if not text:
        return None
    try:
        return ObjectId(text)
    except Exception:
        return None


def _normalise_filter_ids(filter_doc):
    if not isinstance(filter_doc, dict):
        return filter_doc
    out = dict(filter_doc)
    if "_id" in out:
        if isinstance(out["_id"], dict):
            oid_map = dict(out["_id"])
            if "$in" in oid_map and isinstance(oid_map["$in"], list):
                oid_map["$in"] = [_as_object_id(v) or v for v in oid_map["$in"]]
            out["_id"] = oid_map
        else:
            out["_id"] = _as_object_id(out["_id"]) or out["_id"]
    return out


def _normalise_document_ids(doc):
    if not isinstance(doc, dict):
        return doc
    out = dict(doc)
    if "_id" in out:
        out["_id"] = _as_object_id(out["_id"]) or out["_id"]
    return out


def _rb_delete(db, collection, filter_doc):
    return {
        "type": "delete_document",
        "db": db,
        "collection": collection,
        "filter": filter_doc,
    }


def _rb_restore(db, collection, document):
    return {
        "type": "restore_document",
        "db": db,
        "collection": collection,
        "document": document,
    }


def _rb_replace(db, collection, filter_doc, previous_document):
    return {
        "type": "replace_document",
        "db": db,
        "collection": collection,
        "filter": filter_doc,
        "previous_document": previous_document,
    }


def _rb_batch(operations):
    return {"type": "batch", "operations": operations}


def _execute_rollback_operation(operation):
    op_type = operation.get("type")
    if op_type == "batch":
        for op in operation.get("operations") or []:
            _execute_rollback_operation(op)
        return

    db = operation.get("db")
    collection = operation.get("collection")
    if not db or not collection:
        return

    col = get_collection(db, collection)

    if op_type == "delete_document":
        filt = _normalise_filter_ids(operation.get("filter") or {})
        if filt:
            col.delete_many(filt)
        return

    if op_type == "replace_document":
        filt = _normalise_filter_ids(operation.get("filter") or {})
        prev_doc = _normalise_document_ids(operation.get("previous_document") or {})
        if filt and prev_doc:
            col.replace_one(filt, prev_doc, upsert=True)
        return

    if op_type == "restore_document":
        doc = _normalise_document_ids(operation.get("document") or {})
        if not doc:
            return

        if doc.get("_id") is not None:
            col.replace_one({"_id": doc.get("_id")}, doc, upsert=True)
        elif doc.get("user_id"):
            col.replace_one({"user_id": doc.get("user_id")}, doc, upsert=True)
        else:
            col.insert_one(doc)


def _derive_academic_session(enrollment_year, course_duration):
    """Build session label like 2024-26 from start year and duration."""
    start_year = _to_int(enrollment_year, datetime.utcnow().year)
    duration_years = max(1, _to_int(course_duration, 1))
    end_year_short = str(start_year + duration_years)[-2:]
    return f"{start_year}-{end_year_short}"


def _safe_find_user(user_id):
    try:
        return find_user_by_id(user_id)
    except Exception:
        return None


def _safe_get_profile_by_id(profile_id):
    try:
        return get_profile_by_id(profile_id)
    except Exception:
        return None


def _safe_get_course(course_id):
    try:
        return get_course_by_id(course_id)
    except Exception:
        return None


def _resolve_student_identity(student_identifier):
    """Resolve route id that may be either user_id or profile_id."""
    profile = get_profile_by_user(student_identifier)
    if profile:
        return student_identifier, profile

    profile = _safe_get_profile_by_id(student_identifier)
    if profile:
        return profile.get("user_id"), profile

    user = _safe_find_user(student_identifier)
    if user and user.get("role") == "student":
        return student_identifier, get_profile_by_user(student_identifier)

    return None, None


def _generate_registration_number(course, academic_session, exclude_user_id=None):
    """Generate a unique registration number, compatible with legacy and new session fields."""
    prefix = re.sub(r"[^A-Za-z0-9]", "", (course or {}).get("code", "STU")).upper() or "STU"
    session = _as_text(academic_session) or "NA"
    course_id = _as_text((course or {}).get("_id"))

    profiles = get_collection("academic", "student_profiles")
    query = {
        "course_id": course_id,
        "$or": [
            {"academic_session": session},
            {"academic_year": session},
            {"year": session},
        ],
    }

    pattern = re.compile(rf"^{re.escape(prefix)}-{re.escape(session)}-(\\d+)$")
    max_seq = 0
    for row in profiles.find(query, {"reg_number": 1}):
        reg = _as_text(row.get("reg_number"))
        m = pattern.match(reg)
        if m:
            max_seq = max(max_seq, _to_int(m.group(1), 0))

    seq = max_seq + 1
    while True:
        candidate = f"{prefix}-{session}-{seq:03d}"
        existing = profiles.find_one({"reg_number": candidate}, {"user_id": 1})
        if not existing:
            return candidate
        if exclude_user_id and _as_text(existing.get("user_id")) == _as_text(exclude_user_id):
            return candidate
        seq += 1


def _enrich_paper(paper, course_map, lecturer_map):
    item = sanitise_mongo_doc(paper)
    course = course_map.get(item.get("course_id"))
    lecturer = lecturer_map.get(item.get("lecturer_id"))
    item["course_name"] = course.get("name") if course else None
    item["course_code"] = course.get("code") if course else None
    item["semester"] = item.get("semester")
    item["academic_year"] = item.get("academic_session") or item.get("academic_year")
    item["lecturer_name"] = lecturer.get("name") if lecturer else None
    item["lecturer_email"] = lecturer.get("email") if lecturer else None
    return item


def _to_bool(value):
    if isinstance(value, bool):
        return value
    text = _as_text(value).lower()
    return text in {"1", "true", "yes", "y"}


# ─── Courses ────────────────────────────────────────────────────────────────

@admin_bp.route("/courses", methods=["GET"])
@role_required("admin")
def list_courses(user):
    courses = sanitise_many(get_all_courses())
    q = _as_text(request.args.get("q", "")).lower()
    course_duration = _as_text(request.args.get("course_duration", ""))

    filtered = []
    for c in courses:
        if course_duration and str(c.get("course_duration", "")) != course_duration:
            continue
        if q and not (
            q in _as_text(c.get("name")).lower()
            or q in _as_text(c.get("code")).lower()
            or q in _as_text(c.get("department")).lower()
        ):
            continue
        filtered.append(c)

    return jsonify(filtered)


@admin_bp.route("/courses", methods=["POST"])
@role_required("admin")
def add_course(user):
    d = request.get_json(silent=True) or {}
    if not d.get("name") or not d.get("code") or not d.get("course_duration"):
        return jsonify({"error": "name, code and course_duration are required"}), 400
    course = create_course(
        d["name"],
        d["code"],
        d.get("department", ""),
        _to_int(d.get("course_duration"), 0),
    )
    log_action(
        "CREATE_COURSE",
        str(user["_id"]),
        details=f"Course {d['code']}",
        rollback=_rb_delete("academic", "courses", {"_id": course.get("_id")}),
    )
    return jsonify(sanitise_mongo_doc(course)), 201


@admin_bp.route("/courses/<cid>/semesters", methods=["GET"])
@role_required("admin")
def list_course_semesters(user, cid):
    """Return available semesters for a course (duration-derived + paper-derived)."""
    course = _safe_get_course(cid)
    if not course:
        return jsonify({"error": "Course not found"}), 404

    semesters = set()

    duration_years = max(1, _to_int(course.get("course_duration"), 1))
    for sem in range(1, duration_years * 2 + 1):
        semesters.add(sem)

    papers = get_papers_by_course(cid)
    for paper in papers:
        sem = _to_int(paper.get("semester"), 0)
        if sem > 0:
            semesters.add(sem)

    return jsonify(sorted(list(semesters)))


@admin_bp.route("/courses/<cid>", methods=["PUT"])
@role_required("admin")
def edit_course(user, cid):
    d = request.get_json(silent=True) or {}
    allowed = {"name", "code", "department", "course_duration"}
    fields = {k: v for k, v in d.items() if k in allowed}
    if "course_duration" in fields:
        fields["course_duration"] = _to_int(fields.get("course_duration"), 0)

    previous = get_course_by_id(cid)
    updated = update_course(cid, fields)
    log_action(
        "UPDATE_COURSE",
        str(user["_id"]),
        details=f"Course {cid}",
        rollback=_rb_replace("academic", "courses", {"_id": cid}, previous) if previous else None,
    )
    return jsonify(sanitise_mongo_doc(updated))


@admin_bp.route("/courses/<cid>", methods=["DELETE"])
@role_required("admin")
def remove_course(user, cid):
    previous = get_course_by_id(cid)
    delete_course(cid)
    log_action(
        "DELETE_COURSE",
        str(user["_id"]),
        details=f"Course {cid}",
        rollback=_rb_restore("academic", "courses", previous) if previous else None,
    )
    return jsonify({"message": "Deleted"}), 200


# ─── Papers ─────────────────────────────────────────────────────────────────

@admin_bp.route("/papers", methods=["GET"])
@role_required("admin")
def list_papers(user):
    papers = get_all_papers()
    courses = sanitise_many(get_all_courses())
    lecturers = sanitise_many(get_users_by_role("lecturer"))
    course_map = {c["_id"]: c for c in courses}
    lecturer_map = {l["_id"]: l for l in lecturers}

    q = _as_text(request.args.get("q", "")).lower()
    course_id = _as_text(request.args.get("course_id", ""))
    lecturer_id = _as_text(request.args.get("lecturer_id", ""))
    semester = _as_text(request.args.get("semester", ""))
    academic_year = _normalise_year(request.args.get("academic_year", ""))

    result = []
    for paper in papers:
        item = _enrich_paper(paper, course_map, lecturer_map)
        if course_id and item.get("course_id") != course_id:
            continue
        if lecturer_id and item.get("lecturer_id") != lecturer_id:
            continue
        if semester and str(item.get("semester", "")) != semester:
            continue
        if academic_year and _normalise_year(item.get("academic_year")) != academic_year:
            continue
        if q and not (
            q in _as_text(item.get("name")).lower()
            or q in _as_text(item.get("code")).lower()
            or q in _as_text(item.get("course_name")).lower()
            or q in _as_text(item.get("lecturer_name")).lower()
        ):
            continue
        result.append(item)

    return jsonify(sanitise_many(result))


@admin_bp.route("/papers", methods=["POST"])
@role_required("admin")
def add_paper(user):
    d = request.get_json(silent=True) or {}
    if not d.get("name") or not d.get("code") or not d.get("course_id") or not d.get("semester"):
        return jsonify({"error": "name, code, course_id and semester are required"}), 400
    paper = create_paper(
        d["name"],
        d["code"],
        d.get("course_id", ""),
        d.get("lecturer_id") or None,
        _to_int(d.get("semester"), 0) or None,
        d.get("total_classes", 0),
    )
    log_action(
        "CREATE_PAPER",
        str(user["_id"]),
        details=f"Paper {d['code']}",
        rollback=_rb_delete("academic", "papers", {"_id": paper.get("_id")}),
    )
    return jsonify(sanitise_mongo_doc(paper)), 201


@admin_bp.route("/papers/<pid>", methods=["PUT"])
@role_required("admin")
def edit_paper(user, pid):
    d = request.get_json(silent=True) or {}
    fields = dict(d)
    if "semester" in fields:
        fields["semester"] = _to_int(fields.get("semester"), 0) or None
    if "lecturer_id" in fields and not fields["lecturer_id"]:
        fields["lecturer_id"] = None
    previous = get_paper_by_id(pid)
    updated = update_paper(pid, fields)
    log_action(
        "UPDATE_PAPER",
        str(user["_id"]),
        details=f"Paper {pid}",
        rollback=_rb_replace("academic", "papers", {"_id": pid}, previous) if previous else None,
    )
    return jsonify(sanitise_mongo_doc(updated))


@admin_bp.route("/papers/<pid>", methods=["DELETE"])
@role_required("admin")
def remove_paper(user, pid):
    previous = get_paper_by_id(pid)
    delete_paper(pid)
    log_action(
        "DELETE_PAPER",
        str(user["_id"]),
        details=f"Paper {pid}",
        rollback=_rb_restore("academic", "papers", previous) if previous else None,
    )
    return jsonify({"message": "Deleted"}), 200


@admin_bp.route("/papers/bulk-assign", methods=["POST"])
@role_required("admin")
def bulk_assign(user):
    """Assign multiple papers to a lecturer or course in one click."""
    d = request.get_json(silent=True) or {}

    # Student enrollment flow: assign one paper to many students.
    paper_id = d.get("paper_id")
    student_ids = d.get("student_ids") or []
    if paper_id and student_ids:
        updated_count = 0
        for sid in student_ids:
            uid, _ = _resolve_student_identity(sid)
            if not uid:
                continue
            enroll_in_papers(uid, [paper_id])
            updated_count += 1

        log_action(
            "BULK_ENROLL_STUDENTS",
            str(user["_id"]),
            details=f"Paper {paper_id}, students {updated_count}",
        )
        return jsonify({"message": "Students enrolled successfully", "updated_count": updated_count}), 200

    paper_ids = d.get("paper_ids", [])
    lecturer_id = d.get("lecturer_id")
    course_id = d.get("course_id")

    if not paper_ids:
        return jsonify({"error": "paper_ids or (paper_id + student_ids) is required"}), 400

    if lecturer_id:
        bulk_assign_lecturer(paper_ids, lecturer_id)
        log_action("BULK_ASSIGN_LECTURER", str(user["_id"]),
                   details=f"Papers {paper_ids} → Lecturer {lecturer_id}")
    if course_id:
        bulk_assign_course(paper_ids, course_id)
        log_action("BULK_ASSIGN_COURSE", str(user["_id"]),
                   details=f"Papers {paper_ids} → Course {course_id}")
    return jsonify({"message": "Assigned"}), 200


@admin_bp.route("/lecturers/<lid>/papers", methods=["GET"])
@role_required("admin")
def get_lecturer_papers(user, lid):
    papers = get_all_papers()
    courses = sanitise_many(get_all_courses())
    lecturers = sanitise_many(get_users_by_role("lecturer"))
    course_map = {c["_id"]: c for c in courses}
    lecturer_map = {l["_id"]: l for l in lecturers}

    all_papers = [_enrich_paper(p, course_map, lecturer_map) for p in papers]
    assigned = [p for p in all_papers if p.get("lecturer_id") == lid]
    return jsonify({"assigned": assigned, "all": all_papers})


@admin_bp.route("/lecturers/<lid>/papers", methods=["PUT"])
@role_required("admin")
def set_lecturer_papers(user, lid):
    d = request.get_json(silent=True) or {}
    paper_ids = set(d.get("paper_ids") or [])
    object_ids = []
    for pid in paper_ids:
        try:
            object_ids.append(ObjectId(pid))
        except Exception:
            continue

    # Unassign papers currently tied to lecturer but not selected now.
    papers = get_collection("academic", "papers")
    papers.update_many(
        {"lecturer_id": lid, "_id": {"$nin": object_ids}},
        {"$set": {"lecturer_id": None}},
    )

    # Assign selected papers to lecturer.
    if object_ids:
        papers.update_many(
            {"_id": {"$in": object_ids}},
            {"$set": {"lecturer_id": lid}},
        )

    log_action(
        "UPDATE_LECTURER_ASSIGNMENTS",
        str(user["_id"]),
        target_user=lid,
        details=f"Assigned papers: {sorted(list(paper_ids))}",
    )
    return jsonify({"message": "Lecturer paper assignments updated"}), 200


# ─── Lecturers ──────────────────────────────────────────────────────────────

@admin_bp.route("/lecturers", methods=["GET"])
@role_required("admin")
def list_lecturers(user):
    lecturers = sanitise_many(get_users_by_role("lecturer"))
    papers = sanitise_many(get_all_papers())
    courses = sanitise_many(get_all_courses())
    course_map = {c["_id"]: c for c in courses}

    q = _as_text(request.args.get("q", "")).lower()
    course_id = _as_text(request.args.get("course_id", ""))
    semester = _as_text(request.args.get("semester", ""))
    paper_id = _as_text(request.args.get("paper_id", ""))
    academic_year = _normalise_year(request.args.get("academic_year", ""))

    result = []
    for lec in lecturers:
        assigned = [p for p in papers if p.get("lecturer_id") == lec["_id"]]
        assigned_paper_ids = [p["_id"] for p in assigned]
        assigned_course_ids = list({p.get("course_id") for p in assigned if p.get("course_id")})
        assigned_papers = [f"{p.get('name', '')} ({p.get('code', '')})" for p in assigned]
        assigned_semesters = list({str(_to_int(p.get("semester"), 0)) for p in assigned if _to_int(p.get("semester"), 0) > 0})

        years = []
        for p in assigned:
            p_year = _normalise_year(p.get("academic_year", ""))
            if not p_year:
                p_year = _normalise_year((course_map.get(p.get("course_id")) or {}).get("year", ""))
            if p_year:
                years.append(p_year)

        if course_id and course_id not in assigned_course_ids:
            continue
        if semester and semester not in assigned_semesters:
            continue
        if paper_id and paper_id not in assigned_paper_ids:
            continue
        if academic_year and academic_year not in years:
            continue
        if q and not (
            q in _as_text(lec.get("name")).lower()
            or q in _as_text(lec.get("email")).lower()
            or any(q in _as_text(paper).lower() for paper in assigned_papers)
        ):
            continue

        lec["paper_count"] = len(assigned)
        lec["assigned_paper_ids"] = assigned_paper_ids
        lec["assigned_course_ids"] = assigned_course_ids
        lec["assigned_papers"] = assigned_papers
        lec["assigned_semesters"] = sorted(assigned_semesters, key=lambda v: int(v))
        lec["academic_years"] = sorted(list(set(years)))
        result.append(lec)

    return jsonify(sanitise_many(result))


@admin_bp.route("/lecturers", methods=["POST"])
@role_required("admin")
def add_lecturer(user):
    d = request.get_json(silent=True) or {}
    temp_pw = generate_temp_password()
    lec = create_user(d["name"], d["email"], temp_pw,
                      "lecturer", d.get("department", ""),
                      must_change_password=True)
    log_action(
        "CREATE_LECTURER",
        str(user["_id"]),
        target_user=lec["_id"],
        rollback=_rb_delete("auth", "users", {"_id": lec.get("_id")}),
    )
    lec_clean = sanitise_mongo_doc(lec)
    return jsonify({**lec_clean, "temp_password": temp_pw}), 201


@admin_bp.route("/lecturers/<lid>", methods=["PUT"])
@role_required("admin")
def edit_lecturer(user, lid):
    d = request.get_json(silent=True) or {}
    previous = find_user_by_id(lid)
    updated = update_user(lid, d)
    log_action(
        "UPDATE_LECTURER",
        str(user["_id"]),
        target_user=lid,
        rollback=_rb_replace("auth", "users", {"_id": lid}, previous) if previous else None,
    )
    return jsonify(sanitise_mongo_doc(updated))


@admin_bp.route("/lecturers/<lid>", methods=["DELETE"])
@role_required("admin")
def remove_lecturer(user, lid):
    previous = find_user_by_id(lid)
    delete_user(lid)
    log_action(
        "DELETE_LECTURER",
        str(user["_id"]),
        target_user=lid,
        rollback=_rb_restore("auth", "users", previous) if previous else None,
    )
    return jsonify({"message": "Deleted"}), 200


@admin_bp.route("/lecturers/<lid>/reset-password", methods=["POST"])
@role_required("admin")
def reset_lecturer_password(user, lid):
    temp_pw = reset_user_password(lid)
    log_action("RESET_PASSWORD", str(user["_id"]), target_user=lid,
               details="Lecturer password reset")
    return jsonify({"temp_password": temp_pw})


@admin_bp.route("/lecturers/<lid>/reset-pin", methods=["POST"])
@role_required("admin")
def reset_lecturer_pin(user, lid):
    new_pin = f"{random.randint(0, 9999):04d}"
    update_user(lid, {"pin": new_pin, "pin_last_set": datetime.utcnow()})
    log_action("RESET_LECTURER_PIN", str(user["_id"]), target_user=lid,
               details="Admin reset lecturer PIN")
    return jsonify({"pin": new_pin, "message": "Lecturer PIN reset"})


@admin_bp.route("/lecturers/<lid>/pin", methods=["PUT"])
@role_required("admin")
def update_lecturer_pin(user, lid):
    return jsonify({"error": "Admins cannot set lecturer PIN. Lecturer must manage PIN from dashboard."}), 403


# ─── Students ───────────────────────────────────────────────────────────────

@admin_bp.route("/students", methods=["GET"])
@role_required("admin")
def list_students(user):
    profiles = get_all_profiles()
    courses = sanitise_many(get_all_courses())
    papers = sanitise_many(get_all_papers())
    course_map = {c["_id"]: c for c in courses}
    paper_map = {p["_id"]: p for p in papers}

    q = _as_text(request.args.get("q", "")).lower()
    course_id = _as_text(request.args.get("course_id", ""))
    paper_id = _as_text(request.args.get("paper_id", ""))
    academic_session = _as_text(request.args.get("academic_session", "")) or _normalise_year(request.args.get("academic_year", ""))
    semester = _as_text(request.args.get("semester", ""))

    result = []
    for p in profiles:
        u = _safe_find_user(p.get("user_id", ""))
        course = course_map.get(_as_text(p.get("course_id", "")))
        enrolled_papers = p.get("enrolled_papers", [])

        item = sanitise_mongo_doc(p)
        if u:
            item["name"] = u["name"]
            item["email"] = u["email"]

        item["reg_number"] = item.get("reg_number") or item.get("roll_number")
        enrollment_year = item.get("enrollment_year") or (item.get("created_at") or datetime.utcnow()).year
        duration_years = _to_int((course or {}).get("course_duration"), 1)
        item["academic_session"] = (
            _as_text(item.get("academic_session"))
            or _as_text(item.get("academic_year"))
            or _derive_academic_session(enrollment_year, duration_years)
        )
        item["academic_year"] = item.get("academic_session")
        item["year"] = item.get("academic_session")
        item["enrollment_year"] = enrollment_year
        item["mobile_no"] = (u or {}).get("mobile_no", "")
        item["course_name"] = (course or {}).get("name")
        item["course_code"] = (course or {}).get("code")
        item["course_department"] = (course or {}).get("department")
        item["course_duration"] = (course or {}).get("course_duration")
        item["current_semester"] = _to_int(item.get("current_semester"), 0) or None
        item["has_face"] = bool(item.get("face_embeddings"))
        item["enrolled_papers"] = [
            {
                "paper_id": pid,
                "paper_name": (paper_map.get(pid) or {}).get("name", "Unknown"),
                "paper_code": (paper_map.get(pid) or {}).get("code", ""),
            }
            for pid in enrolled_papers
        ]

        student_semesters = set()
        if item.get("current_semester"):
            student_semesters.add(str(item.get("current_semester")))
        for pid in enrolled_papers:
            pdoc = paper_map.get(pid) or {}
            psem = _to_int(pdoc.get("semester"), 0)
            if psem > 0:
                student_semesters.add(str(psem))

        if course_id and item.get("course_id") != course_id:
            continue
        if paper_id and paper_id not in enrolled_papers:
            continue
        if semester and semester not in student_semesters:
            continue
        if academic_session and _as_text(item.get("academic_session")) != academic_session:
            continue
        if q and not (
            q in _as_text(item.get("name")).lower()
            or q in _as_text(item.get("email")).lower()
            or q in _as_text(item.get("reg_number")).lower()
        ):
            continue

        # Don't send raw embeddings to the frontend
        item.pop("face_embeddings", None)
        result.append(item)

    return jsonify(sanitise_many(result))


@admin_bp.route("/students", methods=["POST"])
@role_required("admin")
def add_student(user):
    d = request.get_json(silent=True) or {}
    required_fields = ["name", "email", "course_id"]
    missing = [field for field in required_fields if not _as_text(d.get(field))]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    # Check if email already exists
    existing_user = find_user_by_email(d["email"])
    if existing_user:
        return jsonify({"error": "Email already in use. Please use a different email."}), 409

    course_id = _as_text(d.get("course_id", ""))
    course = _safe_get_course(course_id) if course_id else None
    if not course:
        return jsonify({"error": "Course not found or invalid."}), 404
    
    enrollment_year = _to_int(d.get("enrollment_year"), datetime.utcnow().year)
    course_duration = _to_int((course or {}).get("course_duration"), 1)
    academic_session = _derive_academic_session(enrollment_year, course_duration)

    try:
        temp_pw = generate_temp_password()
        stu = create_user(
            d["name"],
            d["email"],
            temp_pw,
            "student",
            d.get("department", (course or {}).get("department", "")),
            must_change_password=True,
        )
    except Exception as exc:
        current_app.logger.exception("User creation failed")
        return jsonify({"error": f"Failed to create user: {str(exc)}"}), 500

    mobile_no = _as_text(d.get("mobile_no", ""))
    if mobile_no:
        try:
            update_user(str(stu["_id"]), {"mobile_no": mobile_no})
        except Exception as exc:
            current_app.logger.exception("Failed to update mobile number")
            delete_user(str(stu["_id"]))
            return jsonify({"error": f"Failed to update user: {str(exc)}"}), 500

    profile = None
    for attempt in range(5):
        reg_number = d.get("reg_number") or _generate_registration_number(course, academic_session)
        try:
            profile = create_student_profile(str(stu["_id"]), reg_number, course_id, academic_session)
            break
        except DuplicateKeyError:
            if attempt == 4:  # Last attempt
                break
            continue
        except Exception as exc:
            current_app.logger.exception(f"Profile creation attempt {attempt + 1} failed")
            continue

    if not profile:
        delete_user(str(stu["_id"]))
        return jsonify({"error": "Could not generate a unique registration number. Please try again."}), 409

    try:
        update_profile(
            str(stu["_id"]),
            {
                "enrollment_year": enrollment_year,
                "current_semester": 1,
                "academic_session": academic_session,
                "academic_year": academic_session,
                "year": academic_session,
            },
        )
    except Exception as exc:
        current_app.logger.exception("Failed to update student profile")
        delete_user(str(stu["_id"]))
        delete_profile(str(stu["_id"]))
        return jsonify({"error": f"Failed to update profile: {str(exc)}"}), 500

    profile = get_profile_by_user(str(stu["_id"]))

    if d.get("enrolled_papers"):
        enroll_in_papers(str(stu["_id"]), d["enrolled_papers"])

    log_action(
        "CREATE_STUDENT",
        str(user["_id"]),
        target_user=stu["_id"],
        rollback=_rb_batch([
            _rb_delete("academic", "student_profiles", {"user_id": str(stu["_id"])}),
            _rb_delete("auth", "users", {"_id": str(stu["_id"])}),
        ]),
    )
    
    # Sanitize before returning to ensure ObjectId is serializable
    stu_clean = sanitise_mongo_doc(stu)
    profile_clean = sanitise_mongo_doc(profile) if profile else None
    
    return jsonify({**stu_clean, "profile": profile_clean, "temp_password": temp_pw}), 201


@admin_bp.route("/students/<sid>", methods=["PUT"])
@role_required("admin")
def edit_student(user, sid):
    d = request.get_json(silent=True) or {}
    user_id, profile = _resolve_student_identity(sid)
    if not user_id:
        return jsonify({"error": "Student not found"}), 404

    prev_user = find_user_by_id(user_id)
    prev_profile = get_profile_by_user(user_id)

    user_fields = {}
    profile_fields = {}
    for k in ["name", "email", "department", "mobile_no"]:
        if k in d:
            user_fields[k] = d[k]
    for k in ["roll_number", "reg_number", "course_id", "enrolled_papers", "academic_year", "year", "academic_session", "enrollment_year", "current_semester"]:
        if k in d:
            profile_fields[k] = d[k]
    if "year" in profile_fields and "academic_year" not in profile_fields:
        profile_fields["academic_year"] = profile_fields["year"]
    if "academic_session" in profile_fields and "academic_year" not in profile_fields:
        profile_fields["academic_year"] = _as_text(profile_fields["academic_session"])

    if "academic_year" in profile_fields:
        profile_fields["academic_year"] = _as_text(profile_fields["academic_year"])
        profile_fields["year"] = profile_fields["academic_year"]
        profile_fields["academic_session"] = profile_fields["academic_year"]

    current_course_id = (profile or {}).get("course_id")
    next_course_id = profile_fields.get("course_id", current_course_id)
    current_enrollment_year = _to_int((profile or {}).get("enrollment_year"), (profile or {}).get("created_at", datetime.utcnow()).year)
    next_enrollment_year = _to_int(profile_fields.get("enrollment_year"), current_enrollment_year)
    next_course = _safe_get_course(next_course_id) if next_course_id else None
    next_course_duration = _to_int((next_course or {}).get("course_duration"), 1)
    next_session = profile_fields.get("academic_session") or _derive_academic_session(next_enrollment_year, next_course_duration)
    profile_fields["enrollment_year"] = next_enrollment_year
    if "current_semester" in profile_fields:
        profile_fields["current_semester"] = _to_int(profile_fields.get("current_semester"), 0) or None
    profile_fields["academic_session"] = next_session
    profile_fields["academic_year"] = next_session
    profile_fields["year"] = next_session

    if "course_id" in profile_fields or "enrollment_year" in profile_fields or "academic_session" in profile_fields:
        new_reg = _generate_registration_number(next_course, next_session, exclude_user_id=user_id)
        profile_fields["reg_number"] = new_reg
        profile_fields["roll_number"] = new_reg

    if "reg_number" in profile_fields and "roll_number" not in profile_fields:
        profile_fields["roll_number"] = profile_fields["reg_number"]

    if user_fields:
        update_user(user_id, user_fields)
    if profile_fields:
        update_profile(user_id, profile_fields)
    rollback_ops = []
    if prev_user:
        rollback_ops.append(_rb_replace("auth", "users", {"_id": user_id}, prev_user))
    if prev_profile:
        rollback_ops.append(_rb_replace("academic", "student_profiles", {"user_id": user_id}, prev_profile))

    log_action(
        "UPDATE_STUDENT",
        str(user["_id"]),
        target_user=user_id,
        rollback=_rb_batch(rollback_ops) if rollback_ops else None,
    )
    return jsonify({"message": "Updated"})


@admin_bp.route("/students/<sid>", methods=["DELETE"])
@role_required("admin")
def remove_student(user, sid):
    user_id, _ = _resolve_student_identity(sid)
    if not user_id:
        return jsonify({"error": "Student not found"}), 404

    prev_user = find_user_by_id(user_id)
    prev_profile = get_profile_by_user(user_id)

    delete_user(user_id)
    delete_profile(user_id)
    rollback_ops = []
    if prev_user:
        rollback_ops.append(_rb_restore("auth", "users", prev_user))
    if prev_profile:
        rollback_ops.append(_rb_restore("academic", "student_profiles", prev_profile))

    log_action(
        "DELETE_STUDENT",
        str(user["_id"]),
        target_user=user_id,
        rollback=_rb_batch(rollback_ops) if rollback_ops else None,
    )
    return jsonify({"message": "Deleted"}), 200


@admin_bp.route("/students/bulk-promote", methods=["POST"])
@admin_bp.route("/student-bulk-promote", methods=["POST"])
@role_required("admin")
def bulk_promote_students(user):
    """Promote selected students to the next semester."""
    d = request.get_json(silent=True) or {}
    raw_ids = d.get("student_ids") or []
    from_semester = _to_int(d.get("from_semester"), 0)

    student_ids = [sid for sid in raw_ids if _as_text(sid)]
    if not student_ids:
        return jsonify({"error": "student_ids is required"}), 400

    paper_map = {p.get("_id"): p for p in sanitise_many(get_all_papers())}
    course_map = {c.get("_id"): c for c in sanitise_many(get_all_courses())}

    promoted = 0
    skipped = 0
    skipped_max_semester = 0
    removed_papers = 0
    rollback_ops = []
    for sid in student_ids:
        user_id, profile = _resolve_student_identity(_as_text(sid))
        if not user_id or not profile:
            skipped += 1
            continue

        current_sem = _to_int((profile or {}).get("current_semester"), 0)
        if current_sem <= 0:
            current_sem = from_semester if from_semester > 0 else 1

        course_id = _as_text((profile or {}).get("course_id"))
        course = course_map.get(course_id) or {}
        max_semester = max(1, _to_int(course.get("course_duration"), 1) * 2)

        if current_sem >= max_semester:
            skipped_max_semester += 1
            continue

        next_sem = current_sem + 1
        enrolled_papers = list((profile or {}).get("enrolled_papers") or [])
        kept_papers = []
        for pid in enrolled_papers:
            pdoc = paper_map.get(pid) or {}
            psem = _to_int(pdoc.get("semester"), 0)
            # Keep unknown-semester papers and papers in/after the promoted semester.
            if psem == 0 or psem >= next_sem:
                kept_papers.append(pid)

        removed_papers += max(0, len(enrolled_papers) - len(kept_papers))
        rollback_ops.append(_rb_replace("academic", "student_profiles", {"user_id": user_id}, profile))
        update_profile(user_id, {"current_semester": next_sem, "enrolled_papers": kept_papers})
        promoted += 1

    log_action(
        "BULK_PROMOTE_STUDENTS",
        str(user["_id"]),
        details=f"Promoted {promoted}, skipped {skipped}, skipped_max={skipped_max_semester}, removed_papers={removed_papers}, from_semester={from_semester or 'auto'}",
        rollback=_rb_batch(rollback_ops) if rollback_ops else None,
    )

    return jsonify(
        {
            "message": f"Promoted {promoted} students, removed {removed_papers} old-semester paper assignments, skipped {skipped_max_semester} already at max semester",
            "promoted_count": promoted,
            "skipped_count": skipped,
            "skipped_max_semester_count": skipped_max_semester,
            "removed_papers_count": removed_papers,
        }
    )


@admin_bp.route("/students/<sid>/reset-password", methods=["POST"])
@role_required("admin")
def reset_student_password(user, sid):
    user_id, _ = _resolve_student_identity(sid)
    if not user_id:
        return jsonify({"error": "Student not found"}), 404

    temp_pw = reset_user_password(user_id)
    log_action("RESET_PASSWORD", str(user["_id"]), target_user=user_id,
               details="Student password reset")
    return jsonify({"temp_password": temp_pw})


# ─── Student Enrollment (Photo → Embedding) ────────────────────────────────

@admin_bp.route("/students/enroll", methods=["POST"])
@role_required("admin")
def enroll_student_face(user):
    """Accept a student photo, extract FaceNet embedding, and store it."""
    d = request.get_json(silent=True) or {}
    user_id = d.get("user_id")
    photo_b64 = d.get("photo")  # base64 encoded image

    if not user_id or not photo_b64:
        return jsonify({"error": "user_id and photo are required"}), 400

    resolved_user_id, _ = _resolve_student_identity(user_id)
    if not resolved_user_id:
        return jsonify({"error": "Student not found"}), 404

    img = decode_base64_image(photo_b64)
    try:
        detector = get_detector()
        faces = detector.detect_faces(img)
    except Exception as exc:
        current_app.logger.exception("Face detector failed")
        return jsonify({"error": f"Face detector unavailable: {exc}"}), 500

    if not faces:
        return jsonify({"error": "No face detected in the photo"}), 400

    # Use the first (largest confidence) face
    face_crop = faces[0]["crop"]
    try:
        embedding = generate_embedding(face_crop)
    except Exception as exc:
        current_app.logger.exception("Embedding generation failed")
        return jsonify({"error": f"Embedding generation failed: {exc}"}), 500
    add_face_embedding(resolved_user_id, embedding)

    log_action("ENROLL_FACE", str(user["_id"]), target_user=resolved_user_id,
               details="Face embedding added")

    return jsonify({"message": "Face enrolled successfully",
                    "faces_detected": len(faces)}), 200


# ─── Audit Trail ────────────────────────────────────────────────────────────

@admin_bp.route("/audit-logs", methods=["GET"])
@role_required("admin")
def list_audit_logs(user):
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    logs, total = get_audit_logs(page, per_page)

    enriched = []
    for raw in logs:
        item = sanitise_mongo_doc(raw)

        actor = _safe_find_user(item.get("performed_by")) if item.get("performed_by") else None
        target_user = _safe_find_user(item.get("target_user")) if item.get("target_user") else None

        item["actor_name"] = (actor or {}).get("name") or "Unknown User"
        item["actor_email"] = (actor or {}).get("email") or ""
        item["role"] = (actor or {}).get("role") or item.get("role") or "unknown"

        if target_user:
            item["target_type"] = f"{target_user.get('name', 'Unknown')} ({target_user.get('role', 'user')})"
            item["target_user_name"] = target_user.get("name")
            item["target_user_email"] = target_user.get("email")
            item["target_user_role"] = target_user.get("role")
        elif item.get("target_user"):
            item["target_type"] = f"User {item.get('target_user')}"
        else:
            item["target_type"] = item.get("details") or "System"

        item["ip"] = item.get("ip") or ""

        rollback_payload = item.get("rollback")
        ts = item.get("timestamp")
        rollback_until = item.get("rollback_until")
        if rollback_payload and not rollback_until and ts:
            rollback_until = ts + timedelta(days=1)
            item["rollback_until"] = rollback_until

        rolled_back = bool(item.get("rolled_back"))
        now = datetime.utcnow()
        eligible = bool(rollback_payload) and not rolled_back and bool(rollback_until) and now <= rollback_until
        item["rollback_available"] = eligible
        item["rolled_back"] = rolled_back

        # Raw rollback payload may contain nested ObjectIds/documents used internally
        # for rollback execution and is not needed by UI list rendering.
        item.pop("rollback", None)

        enriched.append(item)

    return jsonify({
        "logs": enriched,
        "total": total,
        "page": page,
        "per_page": per_page,
    })


@admin_bp.route("/audit-logs/<log_id>/rollback", methods=["POST"])
@role_required("admin")
def rollback_audit_action(user, log_id):
    audit_log = get_audit_log_by_id(log_id)
    if not audit_log:
        return jsonify({"error": "Audit log not found"}), 404

    if audit_log.get("rolled_back"):
        return jsonify({"error": "This action has already been rolled back"}), 400

    rollback_payload = audit_log.get("rollback")
    if not rollback_payload:
        return jsonify({"error": "Rollback not available for this action"}), 400

    rollback_until = audit_log.get("rollback_until")
    if not rollback_until:
        rollback_until = (audit_log.get("timestamp") or datetime.utcnow()) + timedelta(days=1)

    if datetime.utcnow() > rollback_until:
        return jsonify({"error": "Rollback window expired (1 day)"}), 403

    try:
        _execute_rollback_operation(rollback_payload)
    except Exception as exc:
        current_app.logger.exception("Audit rollback failed")
        return jsonify({"error": f"Rollback failed: {exc}"}), 500

    mark_audit_log_rolled_back(log_id, str(user["_id"]))
    log_action(
        "ROLLBACK_ACTION",
        str(user["_id"]),
        details=f"Rolled back audit log {log_id}",
    )
    return jsonify({"message": "Rollback completed successfully"}), 200


# ─── Attendance Override ────────────────────────────────────────────────────

@admin_bp.route("/attendance/override", methods=["POST"])
@role_required("admin")
def override_attendance(user):
    """Manually add or remove an attendance record (Special Exam Access)."""
    d = request.get_json(silent=True) or {}
    action = d.get("action", "add")  # "add" or "remove"

    if action == "add":
        log = log_attendance(
            d["paper_id"], d["student_id"], str(user["_id"]),
            session_id="manual-override", method="manual",
        )
        log_action("ATTENDANCE_OVERRIDE_ADD", str(user["_id"]),
                   target_user=d["student_id"],
                   details=f"Paper {d['paper_id']}")
        return jsonify({"message": "Attendance added", "log": log}), 201
    else:
        from app.models.attendance import delete_attendance_log
        delete_attendance_log(d["log_id"])
        log_action("ATTENDANCE_OVERRIDE_REMOVE", str(user["_id"]),
                   details=f"Log {d['log_id']}")
        return jsonify({"message": "Attendance removed"}), 200


@admin_bp.route("/exam-eligibility-summary", methods=["GET"])
@role_required("admin")
def exam_eligibility_summary(user):
    """Admin view of exam eligibility with filters and override states."""
    course_id = _as_text(request.args.get("course_id", ""))
    paper_id = _as_text(request.args.get("paper_id", ""))
    academic_year = _normalise_year(request.args.get("academic_year", ""))
    q = _as_text(request.args.get("q", "")).lower()
    final_eligible_filter = _as_text(request.args.get("final_eligible", ""))

    profiles = get_all_profiles()
    courses = sanitise_many(get_all_courses())
    papers = sanitise_many(get_all_papers())
    course_map = {c["_id"]: c for c in courses}
    paper_map = {p["_id"]: p for p in papers}
    overrides_col = get_collection("attendance", "exam_eligibility_overrides")
    sessions_col = get_collection("attendance", "attendance_sessions")

    classes_happened_by_paper = {}
    classes_happened_by_paper_lecturer = {}
    for row in sessions_col.aggregate([
        {
            "$group": {
                "_id": {
                    "paper_id": "$paper_id",
                    "lecturer_id": "$lecturer_id",
                },
                "count": {"$sum": 1},
            }
        }
    ]):
        gid = row.get("_id") or {}
        gid_paper = _as_text(gid.get("paper_id"))
        gid_lecturer = _as_text(gid.get("lecturer_id"))
        count = int(row.get("count", 0) or 0)

        if gid_paper:
            classes_happened_by_paper[gid_paper] = classes_happened_by_paper.get(gid_paper, 0) + count
            if gid_lecturer:
                classes_happened_by_paper_lecturer[(gid_paper, gid_lecturer)] = count

    items = []
    for profile in profiles:
        uid = profile.get("user_id")
        if not uid:
            continue
        student = _safe_find_user(uid)
        if not student:
            continue

        stu_course_id = _as_text(profile.get("course_id", ""))
        course = course_map.get(stu_course_id)
        stu_year = _as_text(profile.get("academic_session") or profile.get("academic_year") or profile.get("year"))

        if course_id and stu_course_id != course_id:
            continue
        if academic_year and stu_year != academic_year:
            continue

        enrolled = profile.get("enrolled_papers", []) or []
        for pid in enrolled:
            if paper_id and pid != paper_id:
                continue

            paper = paper_map.get(pid)
            if not paper:
                continue

            lecturer_id_for_paper = _as_text(paper.get("lecturer_id", ""))
            profile_created_at = profile.get("created_at")

            # Count classes conducted for this subject by the assigned lecturer,
            # scoped to sessions after the student was enrolled.
            session_query = {"paper_id": pid}
            if lecturer_id_for_paper:
                session_query["lecturer_id"] = lecturer_id_for_paper

            if profile_created_at:
                session_query["$or"] = [
                    {"committed_at": {"$gte": profile_created_at}},
                    {
                        "committed_at": {"$exists": False},
                        "last_updated_at": {"$gte": profile_created_at},
                    },
                    {
                        "committed_at": {"$exists": False},
                        "last_updated_at": {"$exists": False},
                        "created_at": {"$gte": profile_created_at},
                    },
                ]
                classes_happened = int(sessions_col.count_documents(session_query) or 0)
            elif lecturer_id_for_paper:
                classes_happened = int(
                    classes_happened_by_paper_lecturer.get((pid, lecturer_id_for_paper), 0) or 0
                )
            else:
                classes_happened = int(classes_happened_by_paper.get(pid, 0) or 0)

            attended = count_attendance(uid, pid)
            pct = round((attended / classes_happened) * 100, 2) if classes_happened > 0 else 0.0
            eligible_by_attendance = pct >= 75.0

            override = overrides_col.find_one({"student_id": uid, "paper_id": pid})
            override_status = None if not override else override.get("override_status")
            override_reason = "" if not override else _as_text(override.get("reason", ""))
            final_eligible = eligible_by_attendance if override_status is None else bool(override_status)

            if final_eligible_filter:
                required = _to_bool(final_eligible_filter)
                if final_eligible != required:
                    continue

            if q and not (
                q in _as_text(student.get("name", "")).lower()
                or q in _as_text(student.get("email", "")).lower()
                or q in _as_text(profile.get("reg_number") or profile.get("roll_number")).lower()
                or q in _as_text(paper.get("name", "")).lower()
                or q in _as_text(paper.get("code", "")).lower()
            ):
                continue

            items.append({
                "student_id": uid,
                "student_name": student.get("name", "Unknown"),
                "student_email": student.get("email", ""),
                "reg_number": profile.get("reg_number") or profile.get("roll_number"),
                "course_id": stu_course_id,
                "course_name": (course or {}).get("name"),
                "paper_id": pid,
                "paper_name": paper.get("name", ""),
                "paper_code": paper.get("code", ""),
                "lecturer_id": lecturer_id_for_paper,
                "academic_year": stu_year,
                "enrolled_since": profile_created_at,
                "attended": attended,
                "total_classes": classes_happened,
                "attended_classes": attended,
                "classes_happened": classes_happened,
                "attendance_percentage": pct,
                "eligible_by_attendance": eligible_by_attendance,
                "override_status": override_status,
                "override_reason": override_reason,
                "final_eligible": final_eligible,
            })

    return jsonify({
        "total": len(items),
        "eligible_count": sum(1 for x in items if x["final_eligible"]),
        "ineligible_count": sum(1 for x in items if not x["final_eligible"]),
        "items": items,
    })


@admin_bp.route("/exam-eligibility-override", methods=["PUT"])
@role_required("admin")
def set_exam_eligibility_override(user):
    """Override final exam eligibility status for a student-paper pair."""
    d = request.get_json(silent=True) or {}
    student_id = _as_text(d.get("student_id", ""))
    paper_id = _as_text(d.get("paper_id", ""))
    reason = _as_text(d.get("reason", ""))

    if not student_id or not paper_id:
        return jsonify({"error": "student_id and paper_id are required"}), 400

    if d.get("override_status", None) is None:
        return jsonify({"error": "override_status must be true or false"}), 400

    override_status = bool(d.get("override_status"))

    overrides_col = get_collection("attendance", "exam_eligibility_overrides")
    overrides_col.update_one(
        {"student_id": student_id, "paper_id": paper_id},
        {
            "$set": {
                "override_status": override_status,
                "reason": reason,
                "updated_by": str(user["_id"]),
                "updated_at": datetime.utcnow(),
            }
        },
        upsert=True,
    )

    log_action(
        "EXAM_ELIGIBILITY_OVERRIDE",
        str(user["_id"]),
        target_user=student_id,
        details=f"Paper {paper_id}, override={override_status}, reason={reason}",
    )
    return jsonify({"message": "Eligibility override updated"}), 200


# ─── Dashboard Stats ────────────────────────────────────────────────────────

@admin_bp.route("/stats", methods=["GET"])
@role_required("admin")
def dashboard_stats(user):
    profiles = get_all_profiles()
    by_course = {}
    by_year = {}
    courses = sanitise_many(get_all_courses())
    course_map = {c["_id"]: c for c in courses}

    for profile in profiles:
        cid = profile.get("course_id")
        course = course_map.get(cid)
        course_key = course.get("name") if course else "Unassigned"
        by_course[course_key] = by_course.get(course_key, 0) + 1

        y = _normalise_year(profile.get("academic_year") or profile.get("year") or (course or {}).get("year")) or "Unknown"
        by_year[y] = by_year.get(y, 0) + 1

    users_col = get_collection("auth", "users")
    courses_col = get_collection("academic", "courses")
    papers_col = get_collection("academic", "papers")
    attendance_col = get_collection("attendance", "attendance_logs")
    audit_col = get_collection("audit", "audit_logs")

    return jsonify({
        "total_students": users_col.count_documents({"role": "student"}),
        "total_lecturers": users_col.count_documents({"role": "lecturer"}),
        "total_courses": courses_col.count_documents({}),
        "total_papers": papers_col.count_documents({}),
        "total_attendance": attendance_col.count_documents({}),
        "total_audit_logs": audit_col.count_documents({}),
        "students_by_course": by_course,
        "students_by_year": by_year,
    })
