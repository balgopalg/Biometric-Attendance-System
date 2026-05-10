import os
import shutil

from flask import send_from_directory

from . import admin_bp
from ._helpers import *


@admin_bp.route("/students", methods=["GET"])
@role_required("super_admin", "department_admin")
def list_students(user):
    page = max(1, _to_int(request.args.get("page", 1), 1))
    per_page = max(1, min(_to_int(request.args.get("per_page", 20), 20), 100))
    skip = (page - 1) * per_page

    # Scope courses to department for department admins
    dept_id = None
    dept_filter_id = _as_text(
        request.args.get("department_id", "")
    )  # from super admin filter
    if is_super_admin(user):
        dept_id = dept_filter_id or None
    else:
        dept_id = _user_dept_id(user)

    # Fetch all courses first; then apply department scoping with legacy fallback
    # so old records without department_id still appear under the correct department.
    courses = sanitise_many(
        get_all_courses(
            [
                "name",
                "code",
                "status",
                "department",
                "course_duration",
                "year",
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
        scoped_course_ids = set()
        for course in courses:
            course_dept_id = _as_text(course.get("department_id", "")).strip()
            course_dept_name = (
                _as_text(course.get("department", "")).strip().lower()
            )
            if course_dept_id and course_dept_id == selected_dept_id:
                scoped_courses.append(course)
                scoped_course_ids.update(_id_variants(course.get("_id")))
                continue
            # Legacy fallback for old course records linked only by department name.
            if (
                selected_dept_name
                and course_dept_name
                and course_dept_name == selected_dept_name
            ):
                scoped_courses.append(course)
                scoped_course_ids.update(_id_variants(course.get("_id")))

        courses = scoped_courses
    papers = sanitise_many(
        get_all_papers(
            ["name", "code", "semester", "course_id", "lecturer_id"]
        )
    )
    if dept_id:
        papers = [
            paper
            for paper in papers
            if _as_text(paper.get("course_id"))
            in {_as_text(cid) for cid in scoped_course_ids if _as_text(cid)}
        ]
    course_map = {c.get("_id"): c for c in courses}
    paper_map = {p.get("_id"): p for p in papers}

    # Set of course IDs visible to this user (enforces dept isolation)
    visible_course_ids = set()
    for cid in course_map.keys():
        visible_course_ids.update(_id_variants(cid))

    department_filter = _as_text(request.args.get("department", ""))
    q = _as_text(request.args.get("q", "")).lower()
    course_id = _as_text(request.args.get("course_id", ""))
    paper_id = _as_text(request.args.get("paper_id", ""))
    academic_session = _as_text(
        request.args.get("academic_session", "")
    ) or _normalise_year(request.args.get("academic_year", ""))
    semester = _as_text(request.args.get("semester", ""))
    include_inactive = _to_bool(request.args.get("include_inactive", False))

    student_profiles = get_collection("academic", "student_profiles")
    users_col = get_collection("auth", "users")

    filters = []

    # Always restrict to courses visible to this user (dept admin isolation)
    filters.append({"course_id": {"$in": list(visible_course_ids)}})

    # Optional legacy department-name filter (only when department_id is not supplied).
    if department_filter and not dept_filter_id:
        dept_course_ids = [
            variant
            for c in courses
            if _as_text(c.get("department") or "").lower()
            == department_filter.lower()
            for variant in _id_variants(c.get("_id"))
        ]
        if dept_course_ids:
            filters.append({"course_id": {"$in": dept_course_ids}})
        else:
            filters.append({"course_id": "never_match"})
    if course_id:
        filters.append({"course_id": {"$in": _id_variants(course_id)}})
    if paper_id:
        filters.append({"enrolled_papers": {"$in": _id_variants(paper_id)}})
    if academic_session:
        filters.append(
            {
                "$or": [
                    {"academic_session": academic_session},
                    {"academic_year": academic_session},
                    {"year": academic_session},
                ]
            }
        )

    if semester:
        semester_int = _to_int(semester, 0)
        if semester_int > 0:
            semester_paper_ids = [
                variant
                for p in papers
                if _to_int(p.get("semester"), 0) == semester_int
                for variant in _id_variants(p.get("_id"))
            ]
            semester_or = [{"current_semester": semester_int}]
            if semester_paper_ids:
                semester_or.append(
                    {"enrolled_papers": {"$in": semester_paper_ids}}
                )
            filters.append({"$or": semester_or})

    if not include_inactive:
        active_course_ids = {
            variant
            for c in courses
            if _as_text(c.get("status") or "active").lower() == "active"
            for variant in _id_variants(c.get("_id"))
        }
        filters.append({"course_id": {"$in": list(active_course_ids)}})

    if q:
        regex = {"$regex": re.escape(q), "$options": "i"}
        matching_user_ids = {
            _as_text(row.get("_id"))
            for row in users_col.find(
                {"$or": [{"name": regex}, {"email": regex}]}, {"_id": 1}
            )
        }
        q_filters = [{"reg_number": regex}, {"roll_number": regex}]
        if matching_user_ids:
            q_filters.append({"user_id": {"$in": list(matching_user_ids)}})
        filters.append({"$or": q_filters})

    query = {"$and": filters} if filters else {}
    projection = {
        "user_id": 1,
        "course_id": 1,
        "enrolled_papers": 1,
        "reg_number": 1,
        "roll_number": 1,
        "academic_session": 1,
        "academic_year": 1,
        "year": 1,
        "enrollment_year": 1,
        "current_semester": 1,
        "face_embeddings": 1,
        "created_at": 1,
    }

    paginated = _get_paginated_data(
        student_profiles,
        query,
        page=page,
        per_page=per_page,
        sort=[("created_at", -1)],
        project=projection,
    )
    profiles = paginated["data"]
    total = paginated["total"]
    total_pages = paginated["total_pages"]
    user_map = get_users_by_ids(p.get("user_id") for p in profiles)

    result = []
    for p in profiles:
        u = user_map.get(_as_text(p.get("user_id", "")))
        course = course_map.get(_as_text(p.get("course_id", "")))
        enrolled_papers = p.get("enrolled_papers", [])

        item = sanitise_mongo_doc(p)
        if u:
            item["name"] = u["name"]
            item["email"] = u["email"]

        item["reg_number"] = (
            item.get("reg_number")
            or item.get("roll_number")
            or item.get("reg_number")
        )
        enrollment_year = (
            item.get("enrollment_year")
            or (p.get("created_at") or datetime.now(timezone.utc)).year
        )
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
        item["profile_picture_file"] = (u or {}).get(
            "profile_picture_file", ""
        )
        item["course_name"] = (course or {}).get("name")
        item["course_code"] = (course or {}).get("code")
        item["course_status"] = (
            _as_text((course or {}).get("status") or "active").lower()
            or "active"
        )
        item["is_course_inactive"] = item["course_status"] != "active"
        item["course_department"] = (course or {}).get("department")
        item["course_duration"] = (course or {}).get("course_duration")
        item["current_semester"] = (
            _to_int(item.get("current_semester"), 0) or None
        )
        item["has_face"] = bool(item.get("face_embeddings"))
        item["enrolled_papers"] = [
            {
                "paper_id": pid,
                "paper_name": (paper_map.get(pid) or {}).get(
                    "name", "Unknown"
                ),
                "paper_code": (paper_map.get(pid) or {}).get("code", ""),
            }
            for pid in enrolled_papers
        ]

        # Don't send raw embeddings to the frontend
        item.pop("face_embeddings", None)
        result.append(item)

    return jsonify(
        {
            "items": sanitise_many(result),
            "total": total,
            "page": page,
            "per_page": per_page,
        }
    )


@admin_bp.route("/students/options", methods=["GET"])
@role_required("super_admin", "department_admin")
def student_options(user):
    """Return a lightweight student list for select inputs and lookups."""
    course_id = _as_text(request.args.get("course_id", ""))
    department_filter = _as_text(request.args.get("department", ""))
    department_id_filter = _as_text(request.args.get("department_id", ""))
    academic_session = _as_text(
        request.args.get("academic_session", "")
    ) or _normalise_year(request.args.get("academic_year", ""))
    semester = _as_text(request.args.get("semester", ""))
    q = _as_text(request.args.get("q", "")).lower()
    limit = max(1, min(_to_int(request.args.get("limit", 200), 200), 500))
    include_inactive = _to_bool(request.args.get("include_inactive", False))

    # Build dept scope for isolation
    if is_super_admin(user):
        dept_scope_id = department_id_filter or None
    else:
        dept_scope_id = _user_dept_id(user)

    scoped_courses = sanitise_many(
        get_all_courses(["department"], department_id=dept_scope_id)
    )
    visible_course_ids = [_as_text(c.get("_id")) for c in scoped_courses]

    profiles_col = get_collection("academic", "student_profiles")
    query = {}

    # Always restrict to visible courses (enforces dept isolation)
    query["course_id"] = {"$in": visible_course_ids}

    if department_filter:
        dept_course_ids = [
            _as_text(c.get("_id"))
            for c in scoped_courses
            if _as_text(c.get("department") or "").lower()
            == department_filter.lower()
        ]
        query["course_id"] = (
            {"$in": dept_course_ids} if dept_course_ids else "never_match"
        )

    if course_id:
        if (
            "course_id" in query
            and isinstance(query["course_id"], dict)
            and "$in" in query["course_id"]
        ):
            if course_id in query["course_id"]["$in"]:
                query["course_id"] = course_id
            else:
                query["course_id"] = "never_match"
        else:
            query["course_id"] = course_id
    if academic_session:
        query["$or"] = [
            {"academic_session": academic_session},
            {"academic_year": academic_session},
            {"year": academic_session},
        ]
    semester_int = _to_int(semester, 0)
    if semester_int > 0:
        query["current_semester"] = semester_int

    cursor = profiles_col.find(
        query,
        {
            "user_id": 1,
            "course_id": 1,
            "academic_session": 1,
            "academic_year": 1,
            "year": 1,
            "current_semester": 1,
            "reg_number": 1,
            "roll_number": 1,
            "created_at": 1,
        },
    )
    # When searching by q (name/email/reg no), apply limit only after matching,
    # otherwise valid students outside the first N profiles are never considered.
    profiles = list(cursor if q else cursor.limit(limit))

    course_map = {}
    if profiles:
        course_ids = {
            str(p.get("course_id", "")) for p in profiles if p.get("course_id")
        }
        if course_ids:
            course_map = {
                c["_id"]: c
                for c in sanitise_many(
                    get_all_courses(
                        ["name", "code", "status", "course_duration"]
                    )
                )
                if c.get("_id") in course_ids
            }

    user_map = get_users_by_ids(profile.get("user_id") for profile in profiles)
    result = []

    for profile in profiles:
        uid = _as_text(profile.get("user_id", ""))
        student = user_map.get(uid)
        if not student:
            continue

        course = course_map.get(_as_text(profile.get("course_id", "")))
        is_course_inactive = (
            _as_text((course or {}).get("status") or "active").lower()
            != "active"
        )
        if is_course_inactive and not include_inactive:
            continue
        enrollment_year = _to_int(
            (
                (profile.get("created_at") or datetime.now(timezone.utc)).year
                if hasattr(profile.get("created_at"), "year")
                else None
            ),
            0,
        )
        duration_years = _to_int((course or {}).get("course_duration"), 1)
        resolved_session = (
            _as_text(profile.get("academic_session"))
            or _as_text(profile.get("academic_year"))
            or _as_text(profile.get("year"))
            or _derive_academic_session(
                enrollment_year or datetime.now(timezone.utc).year,
                duration_years,
            )
        )
        current_semester = _to_int(profile.get("current_semester"), 0)

        reg_number = _as_text(
            profile.get("reg_number") or profile.get("roll_number")
        )
        name = _as_text(student.get("name"))
        email = _as_text(student.get("email"))
        if q and not (
            q in name.lower() or q in email.lower() or q in reg_number.lower()
        ):
            continue

        result.append(
            {
                "_id": uid,
                "user_id": uid,
                "name": student.get("name"),
                "email": student.get("email"),
                "reg_number": reg_number,
                "roll_number": _as_text(profile.get("roll_number")),
                "academic_session": resolved_session,
                "course_id": _as_text(profile.get("course_id", "")),
                "current_semester": current_semester or None,
                "course_name": (course or {}).get("name"),
                "is_course_inactive": is_course_inactive,
            }
        )

        if q and len(result) >= limit:
            break

    return jsonify(sanitise_many(result))


@admin_bp.route("/students", methods=["POST"])
@role_required("super_admin", "department_admin")
def add_student(user):
    d = request.get_json(silent=True) or {}
    required_fields = ["name", "email", "course_id"]
    missing = [
        field for field in required_fields if not _as_text(d.get(field))
    ]
    if missing:
        return (
            jsonify(
                {"error": f"Missing required fields: {', '.join(missing)}"}
            ),
            400,
        )

    # Check if email already exists
    existing_user = find_user_by_email(d["email"])
    if existing_user:
        return (
            jsonify(
                {
                    "error": "Email already in use. Please use a different email."
                }
            ),
            409,
        )

    course_id = _as_text(d.get("course_id", ""))
    course = _safe_get_course(course_id) if course_id else None
    if not course:
        return jsonify({"error": "Course not found or invalid."}), 404
    if _course_is_inactive(course):
        return (
            jsonify({"error": "Cannot create student under inactive course"}),
            409,
        )

    enrollment_year = _to_int(
        d.get("enrollment_year"), datetime.now(timezone.utc).year
    )
    course_duration = _to_int((course or {}).get("course_duration"), 1)
    academic_session = _derive_academic_session(
        enrollment_year, course_duration
    )

    try:
        initial_password = str(d.get("initial_password", "")).strip()
        if not initial_password:
            return (
                jsonify(
                    {
                        "error": "initial_password is required and must be delivered out-of-band."
                    }
                ),
                400,
            )

        is_strong, msg = validate_password_strength(initial_password)
        if not is_strong:
            return jsonify({"error": msg}), 400

        stu = create_user(
            d["name"],
            d["email"],
            initial_password,
            "student",
            d.get("department", (course or {}).get("department", "")),
            must_change_password=True,
            department_id=_user_dept_id(user)
            or (course or {}).get("department_id"),
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
            return (
                jsonify({"error": f"Failed to update user: {str(exc)}"}),
                500,
            )

    profile = None
    for attempt in range(5):
        reg_number = d.get("reg_number") or _generate_registration_number(
            course, academic_session
        )
        try:
            profile = create_student_profile(
                str(stu["_id"]), reg_number, course_id, academic_session
            )
            break
        except DuplicateKeyError:
            if attempt == 4:  # Last attempt
                break
            continue
        except Exception as exc:
            current_app.logger.exception(
                f"Profile creation attempt {attempt + 1} failed"
            )
            continue

    if not profile:
        delete_user(str(stu["_id"]))
        return (
            jsonify(
                {
                    "error": "Could not generate a unique registration number. Please try again."
                }
            ),
            409,
        )

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
        delete_profile(str(stu["_id"]), user=stu)
        return jsonify({"error": f"Failed to update profile: {str(exc)}"}), 500

    profile = get_profile_by_user(str(stu["_id"]))

    if d.get("enrolled_papers"):
        enroll_in_papers(str(stu["_id"]), d["enrolled_papers"])

    log_action(
        "CREATE_STUDENT",
        str(user["_id"]),
        target_user=stu["_id"],
        rollback=_rb_batch(
            [
                _rb_delete(
                    "academic",
                    "student_profiles",
                    {"user_id": str(stu["_id"])},
                ),
                _rb_delete("auth", "users", {"_id": str(stu["_id"])}),
            ]
        ),
    )
    _clear_query_cache()

    # Sanitize before returning to ensure ObjectId is serializable
    stu_clean = sanitise_mongo_doc(stu)
    profile_clean = sanitise_mongo_doc(profile) if profile else None

    email_delivery_enabled = is_email_delivery_enabled()
    temp_pass_display_enabled = _temp_pass_display_enabled()
    if email_delivery_enabled:
        send_welcome_email(
            to_email=d["email"],
            name=d["name"],
            temp_password=initial_password,
            role="student",
        )
    message = (
        "Student created. Credentials have been emailed."
        if email_delivery_enabled
        else "Student created. Email delivery is not configured; share the initial password securely."
    )

    payload = {
        **stu_clean,
        "profile": profile_clean,
        "message": message,
        "email_delivery_enabled": email_delivery_enabled,
        "temp_pass_display_enabled": temp_pass_display_enabled,
    }
    if temp_pass_display_enabled:
        payload["temp_password"] = initial_password
    return jsonify(payload), 201


@admin_bp.route("/students/<sid>", methods=["PUT"])
@role_required("super_admin", "department_admin")
@validate_ids("sid")
def edit_student(user, sid):
    d = request.get_json(silent=True) or {}
    user_id, profile = _resolve_user_identity(sid)
    if not user_id:
        return jsonify({"error": "Student not found"}), 404

    _, student_lock_error = _ensure_student_course_active(user_id)
    if student_lock_error:
        return student_lock_error

    prev_user = find_user_by_id(user_id)
    prev_profile = get_profile_by_user(user_id)

    user_fields = {}
    profile_fields = {}
    for k in ["name", "email", "department", "mobile_no"]:
        if k in d:
            user_fields[k] = d[k]
    for k in [
        "roll_number",
        "reg_number",
        "course_id",
        "enrolled_papers",
        "academic_year",
        "year",
        "academic_session",
        "enrollment_year",
        "current_semester",
    ]:
        if k in d:
            profile_fields[k] = d[k]
    if "year" in profile_fields and "academic_year" not in profile_fields:
        profile_fields["academic_year"] = profile_fields["year"]
    if (
        "academic_session" in profile_fields
        and "academic_year" not in profile_fields
    ):
        profile_fields["academic_year"] = _as_text(
            profile_fields["academic_session"]
        )

    if "academic_year" in profile_fields:
        profile_fields["academic_year"] = _as_text(
            profile_fields["academic_year"]
        )
        profile_fields["year"] = profile_fields["academic_year"]
        profile_fields["academic_session"] = profile_fields["academic_year"]

    if "roll_number" in profile_fields:
        profile_fields["roll_number"] = _as_text(
            profile_fields.get("roll_number")
        )
    if "reg_number" in profile_fields:
        profile_fields["reg_number"] = _as_text(
            profile_fields.get("reg_number")
        )
    if "roll_number" in d and not profile_fields.get("roll_number"):
        return jsonify({"error": "Roll number cannot be empty"}), 400
    if "reg_number" in d and not profile_fields.get("reg_number"):
        return jsonify({"error": "Registration number cannot be empty"}), 400

    current_course_id = (profile or {}).get("course_id")
    next_course_id = profile_fields.get("course_id", current_course_id)
    current_enrollment_year = _to_int(
        (profile or {}).get("enrollment_year"),
        (profile or {}).get("created_at", datetime.now(timezone.utc)).year,
    )
    next_enrollment_year = _to_int(
        profile_fields.get("enrollment_year"), current_enrollment_year
    )
    next_course = _safe_get_course(next_course_id) if next_course_id else None
    if next_course_id and _course_is_inactive(next_course):
        return (
            jsonify({"error": "Cannot move student to an inactive course"}),
            409,
        )
    next_course_duration = _to_int(
        (next_course or {}).get("course_duration"), 1
    )
    next_session = profile_fields.get(
        "academic_session"
    ) or _derive_academic_session(next_enrollment_year, next_course_duration)
    profile_fields["enrollment_year"] = next_enrollment_year
    if "current_semester" in profile_fields:
        profile_fields["current_semester"] = (
            _to_int(profile_fields.get("current_semester"), 0) or None
        )
    profile_fields["academic_session"] = next_session
    profile_fields["academic_year"] = next_session
    profile_fields["year"] = next_session

    current_session = _as_text(
        (profile or {}).get("academic_session")
        or (profile or {}).get("academic_year")
        or (profile or {}).get("year")
    )
    requested_reg_update = "reg_number" in d
    requested_roll_update = "roll_number" in d
    course_changed = "course_id" in d and _as_text(
        current_course_id
    ) != _as_text(next_course_id)
    enrollment_changed = (
        "enrollment_year" in d
        and next_enrollment_year != current_enrollment_year
    )
    session_changed = (
        any(k in d for k in ["academic_session", "academic_year", "year"])
        and _as_text(next_session) != current_session
    )

    if (course_changed or enrollment_changed or session_changed) and not (
        requested_reg_update or requested_roll_update
    ):
        new_reg = _generate_registration_number(
            next_course, next_session, exclude_user_id=user_id
        )
        profile_fields["reg_number"] = new_reg
        profile_fields["roll_number"] = new_reg

    if "reg_number" in profile_fields and "roll_number" not in profile_fields:
        profile_fields["roll_number"] = profile_fields["reg_number"]
    if "roll_number" in profile_fields and "reg_number" not in profile_fields:
        profile_fields["reg_number"] = profile_fields["roll_number"]

    if user_fields:
        update_user(user_id, user_fields)
    if profile_fields:
        try:
            update_profile(user_id, profile_fields)
        except DuplicateKeyError:
            return (
                jsonify(
                    {
                        "error": "Registration number already exists. Please use a unique value."
                    }
                ),
                409,
            )
    rollback_ops = []
    if prev_user:
        rollback_ops.append(
            _rb_replace("auth", "users", {"_id": user_id}, prev_user)
        )
    if prev_profile:
        rollback_ops.append(
            _rb_replace(
                "academic",
                "student_profiles",
                {"user_id": user_id},
                prev_profile,
            )
        )

    log_action(
        "UPDATE_STUDENT",
        str(user["_id"]),
        target_user=user_id,
        rollback=_rb_batch(rollback_ops) if rollback_ops else None,
    )
    _clear_query_cache()
    return jsonify({"message": "Updated"})


@admin_bp.route("/students/<sid>", methods=["DELETE"])
@role_required("super_admin", "department_admin")
@validate_ids("sid")
def remove_student(user, sid):
    user_id, _ = _resolve_user_identity(sid)
    if not user_id:
        return jsonify({"error": "Student not found"}), 404

    _, student_lock_error = _ensure_student_course_active(user_id)
    if student_lock_error:
        return student_lock_error

    prev_user = find_user_by_id(user_id)
    prev_profile = get_profile_by_user(user_id)

    attendance_logs = get_collection("attendance", "attendance_logs")
    attendance_logs.delete_many({"user_id": {"$in": _id_variants(user_id)}})

    delete_user(user_id)
    delete_profile(user_id, user=prev_user)
    rollback_ops = []
    if prev_user:
        rollback_ops.append(_rb_restore("auth", "users", prev_user))
    if prev_profile:
        rollback_ops.append(
            _rb_restore("academic", "student_profiles", prev_profile)
        )

    log_action(
        "DELETE_STUDENT",
        str(user["_id"]),
        target_user=user_id,
        rollback=_rb_batch(rollback_ops) if rollback_ops else None,
    )
    _clear_query_cache()
    return jsonify({"message": "Deleted"}), 200


@admin_bp.route("/students/<sid>/face", methods=["DELETE"])
@role_required("super_admin", "department_admin")
@validate_ids("sid")
def remove_student_face(user, sid):
    user_id, profile = _resolve_user_identity(sid)
    if not user_id:
        return jsonify({"error": "Student not found"}), 404

    if profile:
        profiles_col = get_collection("academic", "student_profiles")
        profiles_col.update_one(
            {"user_id": user_id}, {"$set": {"face_embeddings": []}}
        )

    log_action(
        "DELETE_STUDENT_FACE",
        str(user["_id"]),
        target_user=user_id,
        details="Deleted face embeddings",
    )
    _clear_query_cache()

    # Delete dataset if exists
    dataset_dir = _resolve_dataset_dir_for_user(user_id)
    if os.path.isdir(dataset_dir):
        shutil.rmtree(dataset_dir, ignore_errors=True)

    return jsonify({"message": "Face profile deleted successfully"}), 200


@admin_bp.route("/students/bulk-promote", methods=["POST"])
@admin_bp.route("/student-bulk-promote", methods=["POST"])
@role_required("department_admin")
def bulk_promote_students(user):
    """Promote selected students to the next semester or an optional target semester."""
    d = request.get_json(silent=True) or {}
    raw_ids = d.get("user_ids") or []
    from_semester = _to_int(d.get("from_semester"), 0)
    target_semester = _to_int(d.get("target_semester"), 0)

    if d.get("target_semester") is not None and target_semester <= 0:
        return (
            jsonify({"error": "target_semester must be a positive integer"}),
            400,
        )

    user_ids = [sid for sid in raw_ids if _as_text(sid)]
    if not user_ids:
        return jsonify({"error": "user_ids is required"}), 400

    paper_map = {
        p.get("_id"): p
        for p in sanitise_many(
            get_all_papers(
                ["name", "code", "semester", "course_id", "lecturer_id"]
            )
        )
    }
    course_map = {
        c.get("_id"): c
        for c in sanitise_many(
            get_all_courses(
                [
                    "name",
                    "code",
                    "status",
                    "department",
                    "course_duration",
                    "year",
                ]
            )
        )
    }

    promoted = 0
    skipped = 0
    skipped_max_semester = 0
    skipped_target_semester = 0
    removed_papers = 0
    rollback_ops = []
    for sid in user_ids:
        user_id, profile = _resolve_user_identity(_as_text(sid))
        if not user_id or not profile:
            skipped += 1
            continue

        course_for_lock = _safe_get_course((profile or {}).get("course_id"))
        if _course_is_inactive(course_for_lock):
            skipped += 1
            continue

        current_sem = _to_int((profile or {}).get("current_semester"), 0)
        if current_sem <= 0:
            current_sem = from_semester if from_semester > 0 else 1

        course_id = _as_text((profile or {}).get("course_id"))
        course = course_map.get(course_id) or {}
        max_semester = max(1, _to_int(course.get("course_duration"), 1) * 2)

        if target_semester > 0:
            if target_semester > max_semester:
                skipped_max_semester += 1
                continue
            # Temporary rule: allow selecting semester 1 to force reset/demotion to first semester.
            if target_semester == 1:
                next_sem = 1
            elif target_semester <= current_sem:
                skipped_target_semester += 1
                continue
            else:
                next_sem = target_semester
        else:
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
        rollback_ops.append(
            _rb_replace(
                "academic", "student_profiles", {"user_id": user_id}, profile
            )
        )
        update_profile(
            user_id,
            {"current_semester": next_sem, "enrolled_papers": kept_papers},
        )
        promoted += 1

    log_action(
        "BULK_PROMOTE_STUDENTS",
        str(user["_id"]),
        details=(
            f"Promoted {promoted}, skipped {skipped}, skipped_max={skipped_max_semester}, "
            f"skipped_target={skipped_target_semester}, removed_papers={removed_papers}, "
            f"from_semester={from_semester or 'auto'}, target_semester={target_semester or 'auto'}"
        ),
        rollback=_rb_batch(rollback_ops) if rollback_ops else None,
    )
    _clear_query_cache()

    return jsonify(
        {
            "message": f"Promoted {promoted} students, removed {removed_papers} old-semester paper assignments, skipped {skipped_max_semester} already at max semester",
            "promoted_count": promoted,
            "skipped_count": skipped,
            "skipped_max_semester_count": skipped_max_semester,
            "skipped_target_semester_count": skipped_target_semester,
            "removed_papers_count": removed_papers,
            "target_semester": target_semester or None,
        }
    )


# ─── Excel Import ────────────────────────────────────────────────────────────


@admin_bp.route("/students/import-excel", methods=["POST"])
@role_required("department_admin")
def import_students_excel(user):
    """Bulk-import students from an uploaded Excel file.

    Expects multipart/form-data with:
      - file    : .xlsx file
      - course_id : required
      - semester  : required (integer)

    Excel columns (case-insensitive, stripped):
      Name, RollNo / Roll No, RegdNo / Regd No / Regd. No., Email, PhoneNo / Phone No (optional)
    """
    course_id = _as_text(request.form.get("course_id"))
    semester = _to_int(request.form.get("semester"), 0)

    if not course_id:
        return jsonify({"error": "course_id is required"}), 400
    if semester <= 0:
        return (
            jsonify(
                {
                    "error": "semester is required and must be a positive integer"
                }
            ),
            400,
        )

    course, err = _get_active_course_or_error(course_id)
    if err:
        return err

    uploaded = request.files.get("file")
    if not uploaded:
        return jsonify({"error": "No file uploaded"}), 400
    if not uploaded.filename.lower().endswith((".xlsx", ".xlsm", ".xltx")):
        return jsonify({"error": "Only .xlsx files are supported"}), 400

    try:
        wb = openpyxl.load_workbook(
            BytesIO(uploaded.read()), read_only=True, data_only=True
        )
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
    except Exception as exc:
        return (
            jsonify({"error": f"Could not parse Excel file: {str(exc)}"}),
            400,
        )

    if not rows:
        return jsonify({"error": "Excel file is empty"}), 400

    # Normalise header row
    header_raw = [
        str(h).strip().lower() if h is not None else "" for h in rows[0]
    ]

    COL_ALIASES = {
        "name": ["name"],
        "roll_number": ["rollno", "roll no", "roll_no", "roll number"],
        "reg_number": [
            "regdno",
            "regd no",
            "regd. no.",
            "regd.no.",
            "reg no",
            "reg_no",
            "reg number",
            "regno",
        ],
        "email": ["email"],
        "mobile_no": [
            "phoneno",
            "phone no",
            "phone_no",
            "phone number",
            "mobile",
            "mobile_no",
            "mobileno",
        ],
    }

    col_idx = {}
    for field, aliases in COL_ALIASES.items():
        for idx, h in enumerate(header_raw):
            if h in aliases:
                col_idx[field] = idx
                break

    required_cols = ["name", "email", "reg_number"]
    missing_cols = [c for c in required_cols if c not in col_idx]
    if missing_cols:
        return (
            jsonify(
                {
                    "error": f"Missing required columns: {', '.join(missing_cols)}. Found headers: {header_raw}"
                }
            ),
            400,
        )

    enrollment_year = datetime.now(timezone.utc).year
    course_duration = _to_int((course or {}).get("course_duration"), 1)
    academic_session = _derive_academic_session(
        enrollment_year, course_duration
    )

    results = []
    created_count = 0
    skipped_count = 0
    error_count = 0
    temp_pass_display_enabled = _temp_pass_display_enabled()

    for row_num, row in enumerate(rows[1:], start=2):

        def _cell(field):
            idx = col_idx.get(field)
            if idx is None:
                return ""
            val = row[idx] if idx < len(row) else None
            return str(val).strip() if val is not None else ""

        name = _cell("name")
        email = _cell("email")
        reg_number = _cell("reg_number")
        roll_number = _cell("roll_number") or reg_number
        mobile_no = _cell("mobile_no")

        if not name or not email or not reg_number:
            skipped_count += 1
            results.append(
                {
                    "row": row_num,
                    "status": "skipped",
                    "reason": "Missing required field (Name, Email, or RegdNo)",
                }
            )
            continue

        if find_user_by_email(email):
            skipped_count += 1
            results.append(
                {
                    "row": row_num,
                    "name": name,
                    "email": email,
                    "status": "skipped",
                    "reason": "Email already exists",
                }
            )
            continue

        try:
            initial_password = _generate_import_temp_password()

            stu = create_user(
                name,
                email,
                initial_password,
                "student",
                (course or {}).get("department", ""),
                must_change_password=True,
            )

            if mobile_no:
                try:
                    update_user(str(stu["_id"]), {"mobile_no": mobile_no})
                except Exception:
                    pass  # nosec B110

            profile = None
            for attempt in range(3):
                try:
                    use_reg = (
                        reg_number
                        if attempt == 0
                        else _generate_registration_number(
                            course, academic_session
                        )
                    )
                    profile = create_student_profile(
                        str(stu["_id"]), use_reg, course_id, academic_session
                    )
                    break
                except DuplicateKeyError:
                    continue
                except Exception:
                    break

            if not profile:
                delete_user(str(stu["_id"]))
                error_count += 1
                results.append(
                    {
                        "row": row_num,
                        "name": name,
                        "email": email,
                        "status": "error",
                        "reason": "Could not create profile (duplicate reg number?)",
                    }
                )
                continue

            update_profile(
                str(stu["_id"]),
                {
                    "enrollment_year": enrollment_year,
                    "current_semester": semester,
                    "roll_number": roll_number,
                    "reg_number": reg_number,
                    "academic_session": academic_session,
                    "academic_year": academic_session,
                    "year": academic_session,
                },
            )

            log_action(
                "CREATE_STUDENT",
                str(user["_id"]),
                target_user=stu["_id"],
                rollback=_rb_batch(
                    [
                        _rb_delete(
                            "academic",
                            "student_profiles",
                            {"user_id": str(stu["_id"])},
                        ),
                        _rb_delete("auth", "users", {"_id": str(stu["_id"])}),
                    ]
                ),
            )
            created_count += 1
            row_result = {
                "row": row_num,
                "name": name,
                "email": email,
                "status": "created",
            }
            if temp_pass_display_enabled:
                row_result["temp_password"] = initial_password
            results.append(row_result)

            # Send welcome email (fire-and-forget)
            send_welcome_email(
                to_email=email,
                name=name,
                temp_password=initial_password,
                role="student",
            )
        except DuplicateKeyError:
            skipped_count += 1
            results.append(
                {
                    "row": row_num,
                    "name": name,
                    "email": email,
                    "status": "skipped",
                    "reason": "Duplicate email or registration number",
                }
            )
        except Exception as exc:
            error_count += 1
            results.append(
                {
                    "row": row_num,
                    "name": name,
                    "email": email,
                    "status": "error",
                    "reason": str(exc),
                }
            )

    _clear_query_cache()
    return jsonify(
        {
            "message": f"Import complete: {created_count} created, {skipped_count} skipped, {error_count} errors",
            "created": created_count,
            "skipped": skipped_count,
            "errors": error_count,
            "email_delivery_enabled": is_email_delivery_enabled(),
            "temp_pass_display_enabled": temp_pass_display_enabled,
            "results": results,
        }
    ), (207 if (skipped_count + error_count) > 0 else 201)


@admin_bp.route("/students/<sid>/reset-password", methods=["POST"])
@role_required("department_admin")
@validate_ids("sid")
def reset_student_password(user, sid):
    user_id, _ = _resolve_user_identity(sid)
    if not user_id:
        return jsonify({"error": "Student not found"}), 404

    d = request.get_json(silent=True) or {}
    temp_password = reset_user_password(
        user_id, temp_password=str(d.get("temp_password", "")).strip() or None
    )
    log_action(
        "RESET_PASSWORD",
        str(user["_id"]),
        target_user=user_id,
        details="Student password reset",
    )

    email_delivery_enabled = is_email_delivery_enabled()
    temp_pass_display_enabled = _temp_pass_display_enabled()

    # Send reset email
    stu_user = find_user_by_id(user_id)
    if email_delivery_enabled and stu_user and stu_user.get("email"):
        send_password_reset_email(
            to_email=stu_user["email"],
            name=stu_user.get("name", "Student"),
            temp_password=temp_password,
            role="student",
        )
    message = (
        "Student password reset. New credentials have been emailed."
        if email_delivery_enabled
        else "Student password reset. Email delivery is not configured; share the new password securely."
    )

    payload = {
        "message": message,
        "email_delivery_enabled": email_delivery_enabled,
        "temp_pass_display_enabled": temp_pass_display_enabled,
    }
    if temp_pass_display_enabled:
        payload["temp_password"] = temp_password
    return jsonify(payload)


# ─── Student Enrollment (Photo → Embedding) ────────────────────────────────


@admin_bp.route("/students/profile-picture/<path:file_name>", methods=["GET"])
@role_required("super_admin", "department_admin")
def get_student_profile_picture(user, file_name):
    """Serve student profile pictures for administrators.

    Enforces department-level tenant isolation:
    - super_admin can access any student's profile picture
    - department_admin can only access students in their department
    """
    safe_name = os.path.basename(file_name or "")
    if not safe_name:
        return jsonify({"error": "Profile picture not found"}), 404

    # Resolve folder from auth module's internal helper logic
    from app.security.rbac import get_user_department_id, is_super_admin

    from ..auth import _safe_profile_upload_folder

    profile_dir = _safe_profile_upload_folder()
    file_path = os.path.join(profile_dir, safe_name)

    if not os.path.isfile(file_path):
        return jsonify({"error": "Profile picture not found"}), 404

    # Department isolation: verify the file belongs to a student in the requester's department
    if not is_super_admin(user):
        requester_dept = get_user_department_id(user)

        # Find which student owns this profile picture
        users_col = get_collection("auth", "users")
        owner = users_col.find_one({"profile_picture_file": safe_name})

        if not owner:
            return jsonify({"error": "Profile picture not found"}), 404

        # For department_admin, enforce same-department access
        owner_dept = (
            get_user_department_id(owner) if isinstance(owner, dict) else None
        )
        if requester_dept != owner_dept:
            return (
                jsonify({"error": "Unauthorized to access this resource"}),
                403,
            )

    return send_from_directory(profile_dir, safe_name)
