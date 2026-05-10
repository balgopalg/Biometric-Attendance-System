from . import admin_bp
from ._helpers import *


@admin_bp.route("/courses", methods=["GET"])
@role_required("super_admin", "department_admin")
def list_courses(user):
    # Unified department filter logic
    dept_id = None
    if is_super_admin(user):
        dept_id = (
            _as_text(request.args.get("department_id", "")).strip() or None
        )
    else:
        dept_id = _user_dept_id(user)

    # Fetch all courses first; apply scoped filtering with legacy fallback below.
    courses = sanitise_many(
        get_all_courses(
            [
                "name",
                "code",
                "department",
                "course_duration",
                "status",
                "department_id",
            ],
            department_id=None,
        )
    )

    if dept_id:
        selected_dept_id = _as_text(dept_id).strip()
        selected_dept_name = ""
        selected_dept = None
        try:
            selected_dept = get_department_by_id(selected_dept_id)
        except Exception:
            selected_dept = None
        if selected_dept:
            selected_dept_name = (
                _as_text(selected_dept.get("name", "")).strip().lower()
            )

        scoped_courses = []
        for course in courses:
            course_dept_id = _as_text(course.get("department_id", "")).strip()
            course_dept_name = (
                _as_text(course.get("department", "")).strip().lower()
            )
            if course_dept_id and course_dept_id == selected_dept_id:
                scoped_courses.append(course)
                continue
            # Legacy fallback for old course records that only stored department name.
            if (
                selected_dept_name
                and course_dept_name
                and course_dept_name == selected_dept_name
            ):
                scoped_courses.append(course)
        courses = scoped_courses

    q = _as_text(request.args.get("q", "")).lower()
    course_duration = _as_text(request.args.get("course_duration", ""))
    status = _as_text(request.args.get("status", "")).lower()

    filtered = []
    for c in courses:
        c["status"] = _as_text(c.get("status") or "active").lower() or "active"
        if (
            course_duration
            and str(c.get("course_duration", "")) != course_duration
        ):
            continue
        if status and c.get("status") != status:
            continue
        if q and not (
            q in _as_text(c.get("name")).lower()
            or q in _as_text(c.get("code")).lower()
            or q in _as_text(c.get("department")).lower()
        ):
            continue
        filtered.append(c)

    return _paginate_items(filtered)


@admin_bp.route("/courses", methods=["POST"])
@role_required("super_admin", "department_admin")
def add_course(user):
    d = request.get_json(silent=True) or {}
    if not d.get("name") or not d.get("code") or not d.get("course_duration"):
        return (
            jsonify({"error": "name, code and course_duration are required"}),
            400,
        )
    # Resolve department_id: dept admins use their own, super admins may pass in body
    dept_id = None
    body_dept_id = _as_text(d.get("department_id", "")).strip()
    if is_super_admin(user):
        dept_id = body_dept_id or None
    else:
        dept_id = _user_dept_id(user)
    course = create_course(
        d["name"],
        d["code"],
        d.get("department", ""),
        _to_int(d.get("course_duration"), 0),
        department_id=dept_id,
    )
    log_action(
        "CREATE_COURSE",
        str(user["_id"]),
        details=f"Course {d['code']}",
        rollback=_rb_delete("academic", "courses", {"_id": course.get("_id")}),
    )
    _clear_query_cache()
    return jsonify(sanitise_mongo_doc(course)), 201


@admin_bp.route("/courses/<cid>/semesters", methods=["GET"])
@role_required("super_admin", "department_admin")
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


@admin_bp.route("/courses/<cid>", methods=["GET"])
@role_required("department_admin")
@validate_ids("cid")
def get_course_details(user, cid):
    course = get_course_by_id(cid)
    if not course:
        return jsonify({"error": "Course not found"}), 404
    return jsonify(sanitise_mongo_doc(course))


@admin_bp.route("/courses/<cid>/sessions", methods=["GET"])
@role_required("department_admin")
def list_course_sessions(user, cid):
    """Return distinct academic sessions for a course."""
    course = _safe_get_course(cid)
    if not course:
        return jsonify({"error": "Course not found"}), 404

    profiles = get_collection("academic", "student_profiles")
    sessions = set()
    course_duration = max(1, _to_int(course.get("course_duration"), 1))
    for row in profiles.aggregate(
        [
            {"$match": {"course_id": cid}},
            {
                "$project": {
                    "session": {
                        "$ifNull": [
                            "$academic_session",
                            {
                                "$ifNull": [
                                    "$academic_year",
                                    {
                                        "$ifNull": [
                                            "$year",
                                            {
                                                "$toString": {
                                                    "$year": "$created_at"
                                                }
                                            },
                                        ]
                                    },
                                ]
                            },
                        ]
                    }
                }
            },
            {"$group": {"_id": "$session"}},
        ]
    ):
        session = _as_text(row.get("_id"))
        if session:
            sessions.add(session)

    # Ensure at least current derived session appears when course has active profiles but no stored session field.
    if not sessions and profiles.count_documents({"course_id": cid}) > 0:
        now_year = datetime.now(timezone.utc).year
        sessions.add(_derive_academic_session(now_year, course_duration))

    return jsonify(sorted(sessions))


@admin_bp.route("/courses/<cid>", methods=["PUT"])
@role_required("department_admin")
@validate_ids("cid")
def edit_course(user, cid):
    d = request.get_json(silent=True) or {}
    allowed = {"name", "code", "department", "course_duration", "status"}
    fields = {k: v for k, v in d.items() if k in allowed}
    if "course_duration" in fields:
        fields["course_duration"] = _to_int(fields.get("course_duration"), 0)
    if "status" in fields:
        next_status = _as_text(fields.get("status")).lower()
        if next_status not in {"active", "inactive"}:
            return jsonify({"error": "status must be active or inactive"}), 400
        fields["status"] = next_status

    previous = get_course_by_id(cid)
    if not previous:
        return jsonify({"error": "Course not found"}), 404

    prev_status = (
        _as_text(previous.get("status") or "active").lower() or "active"
    )
    next_status = (
        _as_text(fields.get("status") or prev_status).lower() or "active"
    )

    detached_count = 0
    detached_papers = []
    if prev_status == "active" and next_status == "inactive":
        detached_count, detached_papers = _detach_lecturers_from_course_papers(
            cid
        )

    updated = update_course(cid, fields)

    rollback_ops = [
        _rb_replace("academic", "courses", {"_id": cid}, previous),
    ]
    for doc in detached_papers:
        rollback_ops.append(
            _rb_replace("academic", "papers", {"_id": doc.get("_id")}, doc)
        )

    details = f"Course {cid}"
    if detached_count > 0:
        details = (
            f"Course {cid}; detached lecturers from {detached_count} paper(s)"
        )

    log_action(
        "UPDATE_COURSE",
        str(user["_id"]),
        details=details,
        rollback=_rb_batch(rollback_ops),
    )
    _clear_query_cache()
    return jsonify(sanitise_mongo_doc(updated))


@admin_bp.route("/courses/<cid>", methods=["DELETE"])
@role_required("department_admin")
@validate_ids("cid")
def remove_course(user, cid):
    previous = get_course_by_id(cid)
    if not previous:
        return jsonify({"error": "Course not found"}), 404

    detached_count, detached_papers = _detach_lecturers_from_course_papers(cid)
    delete_course(cid)

    rollback_ops = [_rb_restore("academic", "courses", previous)]
    for doc in detached_papers:
        rollback_ops.append(
            _rb_replace("academic", "papers", {"_id": doc.get("_id")}, doc)
        )

    details = f"Course {cid}"
    if detached_count > 0:
        details = (
            f"Course {cid}; detached lecturers from {detached_count} paper(s)"
        )

    log_action(
        "DEACTIVATE_COURSE",
        str(user["_id"]),
        details=details,
        rollback=_rb_batch(rollback_ops),
    )
    _clear_query_cache()
    return (
        jsonify(
            {
                "message": "Course marked inactive",
                "detached_lecturer_assignments": detached_count,
            }
        ),
        200,
    )


# ─── Papers ─────────────────────────────────────────────────────────────────
