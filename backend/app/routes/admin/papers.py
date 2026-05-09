from . import admin_bp
from ._helpers import *

@admin_bp.route("/papers", methods=["GET"])
@role_required("super_admin", "department_admin")
def list_papers(user):
    dept_id = None
    if is_super_admin(user):
        dept_id = _as_text(request.args.get("department_id", "")).strip() or None
    else:
        dept_id = _user_dept_id(user)

    # Fetch full sets first; apply scoped filtering with legacy fallback below.
    papers = get_all_papers(["name", "code", "course_id", "lecturer_id", "semester", "total_classes", "created_at", "department_id"], department_id=None)
    courses = sanitise_many(get_all_courses(["name", "code", "status", "department", "course_duration", "year", "department_id"], department_id=None))

    if dept_id:
        selected_dept_id = _as_text(dept_id).strip()
        selected_dept_name = ""
        selected_dept = None
        try:
            selected_dept = get_department_by_id(selected_dept_id)
        except Exception:
            selected_dept = None
        if selected_dept:
            selected_dept_name = _as_text(selected_dept.get("name", "")).strip().lower()

        scoped_course_ids = set()
        scoped_courses = []
        for course in courses:
            course_dept_id = _as_text(course.get("department_id", "")).strip()
            course_dept_name = _as_text(course.get("department", "")).strip().lower()
            if course_dept_id and course_dept_id == selected_dept_id:
                scoped_courses.append(course)
                scoped_course_ids.add(course.get("_id"))
                continue
            # Legacy fallback for old records linked only by department name.
            if selected_dept_name and course_dept_name and course_dept_name == selected_dept_name:
                scoped_courses.append(course)
                scoped_course_ids.add(course.get("_id"))

        courses = scoped_courses
        papers = [paper for paper in papers if paper.get("course_id") in scoped_course_ids]

    lecturers = sanitise_many(get_users_by_role("lecturer", department_id=dept_id))
    course_map = {c["_id"]: c for c in courses}
    lecturer_map = {l["_id"]: l for l in lecturers}

    department_filter = _as_text(request.args.get("department", ""))
    q = _as_text(request.args.get("q", "")).lower()
    course_id = _as_text(request.args.get("course_id", ""))
    lecturer_id = _as_text(request.args.get("lecturer_id", ""))
    semester = _as_text(request.args.get("semester", ""))
    academic_year = _normalise_year(request.args.get("academic_year", ""))

    # Filter by department name on the associated course
    if department_filter:
        dept_course_ids = {
            c["_id"] for c in courses
            if _as_text(c.get("department") or "").lower() == department_filter.lower()
        }
        # Restrict course_map and papers to matching department courses
        course_map = {cid: c for cid, c in course_map.items() if cid in dept_course_ids}
        papers = [p for p in papers if p.get("course_id") in dept_course_ids]

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

    return _paginate_items(sanitise_many(result))


@admin_bp.route("/papers/<pid>", methods=["GET"])
@role_required("department_admin")
@validate_ids("pid")
def get_paper_details(user, pid):
    paper = get_paper_by_id(pid)
    if not paper:
        return jsonify({"error": "Paper not found"}), 404
    return jsonify(sanitise_mongo_doc(paper))


@admin_bp.route("/papers", methods=["POST"])
@role_required("department_admin")
def add_paper(user):
    d = request.get_json(silent=True) or {}
    if not d.get("name") or not d.get("code") or not d.get("course_id") or not d.get("semester"):
        return jsonify({"error": "name, code, course_id and semester are required"}), 400

    course_id, semester, error = _normalise_course_semester(d.get("course_id"), d.get("semester"))
    if error:
        return jsonify({"error": error}), 400

    paper = create_paper(
        d["name"],
        d["code"],
        course_id,
        d.get("lecturer_id") or None,
        semester,
        d.get("total_classes", 0),
        department_id=_user_dept_id(user),
    )
    log_action(
        "CREATE_PAPER",
        str(user["_id"]),
        details=f"Paper {d['code']}",
        rollback=_rb_delete("academic", "papers", {"_id": paper.get("_id")}),
    )
    _clear_query_cache()
    return jsonify(sanitise_mongo_doc(paper)), 201


@admin_bp.route("/papers/<pid>", methods=["PUT"])
@role_required("department_admin")
@validate_ids("pid")
def edit_paper(user, pid):
    d = request.get_json(silent=True) or {}
    fields = dict(d)
    if "lecturer_id" in fields:
        fields["lecturer_id"] = _to_oid(fields["lecturer_id"])

    # Remove immutable fields that MongoDB doesn't allow in $set
    for key in ["_id", "_id_str", "created_at"]:
        fields.pop(key, None)

    previous = get_paper_by_id(pid)
    if not previous:
        return jsonify({"error": "Paper not found"}), 404

    lock_error = _ensure_paper_course_active(previous)
    if lock_error:
        return lock_error

    if "course_id" in fields or "semester" in fields:
        next_course_id = fields.get("course_id", previous.get("course_id"))
        next_semester = fields.get("semester", previous.get("semester"))
        course_id, semester, error = _normalise_course_semester(next_course_id, next_semester)
        if error:
            return jsonify({"error": error}), 400
        fields["course_id"] = course_id
        fields["semester"] = semester

    updated = update_paper(pid, fields)
    log_action(
        "UPDATE_PAPER",
        str(user["_id"]),
        details=f"Paper {pid}",
        rollback=_rb_replace("academic", "papers", {"_id": pid}, previous) if previous else None,
    )
    _clear_query_cache()
    return jsonify(sanitise_mongo_doc(updated))


@admin_bp.route("/papers/<pid>", methods=["DELETE"])
@role_required("department_admin")
@validate_ids("pid")
def remove_paper(user, pid):
    previous = get_paper_by_id(pid)
    if not previous:
        return jsonify({"error": "Paper not found"}), 404

    lock_error = _ensure_paper_course_active(previous)
    if lock_error:
        return lock_error

    delete_paper(pid)
    log_action(
        "DELETE_PAPER",
        str(user["_id"]),
        details=f"Paper {pid}",
        rollback=_rb_restore("academic", "papers", previous) if previous else None,
    )
    _clear_query_cache()
    return jsonify({"message": "Deleted"}), 200


@admin_bp.route("/papers/bulk-assign", methods=["POST"])
@role_required("super_admin", "department_admin")
def bulk_assign(user):
    """Assign multiple papers to a lecturer or course in one click."""
    d = request.get_json(silent=True) or {}

    # Student enrollment flow: assign one paper to many students.
    paper_id = _as_text(d.get("paper_id"))
    user_ids = [_as_text(sid) for sid in (d.get("user_ids") or []) if _as_text(sid)]
    if paper_id and user_ids:
        paper = get_paper_by_id(paper_id)
        if not paper:
            return jsonify({"error": "Paper not found"}), 404

        lock_error = _ensure_paper_course_active(paper)
        if lock_error:
            return lock_error

        updated_count = 0
        for sid in user_ids:
            uid, _ = _resolve_user_identity(sid)
            if not uid:
                continue
            _, student_lock_error = _ensure_student_course_active(uid)
            if student_lock_error:
                continue
            changed = enroll_in_papers(uid, [paper_id])
            if changed > 0:
                updated_count += 1

        if updated_count <= 0:
            return jsonify({"error": "No eligible students could be assigned"}), 400

        log_action(
            "BULK_ENROLL_STUDENTS",
            str(user["_id"]),
            details=f"Paper {paper_id}, students {updated_count}",
        )
        _clear_query_cache()
        return jsonify({"message": "Students enrolled successfully", "updated_count": updated_count, "assigned_paper_count": 1}), 200

    # Student enrollment flow: assign many papers to many students.
    # This branch is intentionally prioritized whenever user_ids are present,
    # even if course_id is also included by the frontend payload.
    paper_ids_for_students = [_as_text(pid) for pid in (d.get("paper_ids") or []) if _as_text(pid)]
    if user_ids and paper_ids_for_students and not d.get("lecturer_id"):
        valid_paper_ids = []
        for pid in paper_ids_for_students:
            paper = get_paper_by_id(pid)
            if not paper:
                continue
            lock_error = _ensure_paper_course_active(paper)
            if lock_error:
                continue
            valid_paper_ids.append(pid)

        if not valid_paper_ids:
            return jsonify({"error": "No active papers found for assignment"}), 400

        updated_count = 0
        for sid in user_ids:
            uid, _ = _resolve_user_identity(sid)
            if not uid:
                continue
            _, student_lock_error = _ensure_student_course_active(uid)
            if student_lock_error:
                continue
            changed = enroll_in_papers(uid, valid_paper_ids)
            if changed > 0:
                updated_count += 1

        if updated_count <= 0:
            return jsonify({"error": "No eligible students could be assigned"}), 400

        log_action(
            "BULK_ENROLL_STUDENTS",
            str(user["_id"]),
            details=f"Papers {len(valid_paper_ids)}, students {updated_count}",
        )
        _clear_query_cache()
        return jsonify(
            {
                "message": "Students enrolled successfully",
                "updated_count": updated_count,
                "assigned_paper_count": len(valid_paper_ids),
            }
        ), 200

    paper_ids = d.get("paper_ids", [])
    lecturer_id = d.get("lecturer_id")
    course_id = d.get("course_id")

    if not paper_ids:
        return jsonify({"error": "paper_ids or (paper_id + user_ids) is required"}), 400

    if lecturer_id:
        for pid in paper_ids:
            paper = get_paper_by_id(pid)
            if not paper:
                continue
            lock_error = _ensure_paper_course_active(paper)
            if lock_error:
                return lock_error

        bulk_assign_lecturer(paper_ids, lecturer_id)
        log_action("BULK_ASSIGN_LECTURER", str(user["_id"]),
                   details=f"Papers {paper_ids} → Lecturer {lecturer_id}")
        _clear_query_cache()
    if course_id:
        course = _safe_get_course(course_id)
        if not course:
            return jsonify({"error": "Course not found"}), 404
        if _course_is_inactive(course):
            return jsonify({"error": "Cannot assign papers to an inactive course"}), 409
        max_sem = max(1, _to_int(course.get("course_duration"), 1) * 2)

        invalid = []
        for paper_id in paper_ids:
            paper = get_paper_by_id(paper_id)
            if not paper:
                continue
            psem = _to_int(paper.get("semester"), 0)
            if psem > max_sem:
                invalid.append({"paper_id": paper_id, "paper_code": paper.get("code", ""), "semester": psem})

        if invalid:
            return jsonify({
                "error": f"One or more papers have semester above course limit (max {max_sem})",
                "invalid_papers": invalid,
            }), 400

        bulk_assign_course(paper_ids, course_id)
        log_action("BULK_ASSIGN_COURSE", str(user["_id"]),
                   details=f"Papers {paper_ids} → Course {course_id}")
        _clear_query_cache()
    return jsonify({"message": "Assigned"}), 200


