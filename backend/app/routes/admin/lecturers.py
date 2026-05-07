from . import admin_bp
from ._helpers import *

@admin_bp.route("/lecturers/<lid>/papers", methods=["GET"])
@role_required("department_admin")
def get_lecturer_papers(user, lid):
    papers = get_all_papers(["name", "code", "course_id", "lecturer_id", "semester", "total_classes", "created_at"])
    courses = sanitise_many(get_all_courses(["name", "code", "status", "department", "course_duration", "year"]))
    lecturers = sanitise_many(get_users_by_role("lecturer"))
    course_map = {c["_id"]: c for c in courses}
    lecturer_map = {l["_id"]: l for l in lecturers}

    all_papers = [_enrich_paper(p, course_map, lecturer_map) for p in papers]
    assigned = [p for p in all_papers if p.get("lecturer_id") == lid]
    return jsonify({"assigned": assigned, "all": all_papers})


@admin_bp.route("/lecturers/<lid>/papers", methods=["PUT"])
@role_required("department_admin")
def set_lecturer_papers(user, lid):
    d = request.get_json(silent=True) or {}
    paper_ids = set(d.get("paper_ids") or [])
    object_ids = []
    for pid in paper_ids:
        try:
            object_ids.append(ObjectId(pid))
        except Exception:
            continue  # nosec B112

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
    _clear_query_cache()
    return jsonify({"message": "Lecturer paper assignments updated"}), 200


# ─── Lecturers ──────────────────────────────────────────────────────────────

@admin_bp.route("/lecturers", methods=["GET"])
@role_required("super_admin", "department_admin")
def list_lecturers(user):
    dept_id = None
    if is_super_admin(user):
        dept_id = _as_text(request.args.get("department_id", "")).strip() or None
    else:
        dept_id = _user_dept_id(user)

    # Primary filter by department_id with legacy fallback by department name.
    # Some older lecturer records were stored without department_id.
    if dept_id:
        all_lecturers = sanitise_many(get_users_by_role("lecturer"))
        selected_dept_id = _as_text(dept_id).strip()
        selected_dept_name = ""
        selected_dept = None
        try:
            selected_dept = get_department_by_id(selected_dept_id)
        except Exception:
            selected_dept = None
        if selected_dept:
            selected_dept_name = _as_text(selected_dept.get("name", "")).strip().lower()

        lecturers = []
        for lec in all_lecturers:
            lec_dept_id = _as_text(lec.get("department_id", "")).strip()
            lec_dept_name = _as_text(lec.get("department", "")).strip().lower()
            if lec_dept_id and lec_dept_id == selected_dept_id:
                lecturers.append(lec)
                continue
            if selected_dept_name and lec_dept_name and lec_dept_name == selected_dept_name:
                lecturers.append(lec)
    else:
        lecturers = sanitise_many(get_users_by_role("lecturer", department_id=dept_id))

    papers = sanitise_many(get_all_papers(["name", "code", "lecturer_id", "course_id", "semester", "total_classes", "created_at"]))
    courses = sanitise_many(get_all_courses(["name", "code", "status", "department", "course_duration", "year"]))
    course_map = {c["_id"]: c for c in courses}

    department_filter = _as_text(request.args.get("department", ""))
    q = _as_text(request.args.get("q", "")).lower()
    course_id = _as_text(request.args.get("course_id", ""))
    semester = _as_text(request.args.get("semester", ""))
    paper_id = _as_text(request.args.get("paper_id", ""))

    # Filter by department name on courses assigned to the lecturer
    if department_filter:
        dept_course_ids = {
            c["_id"] for c in courses
            if _as_text(c.get("department") or "").lower() == department_filter.lower()
        }
        papers = [p for p in papers if p.get("course_id") in dept_course_ids]
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

    return _paginate_items(sanitise_many(result))


@admin_bp.route("/lecturers", methods=["POST"])
@role_required("department_admin")
def add_lecturer(user):
    d = request.get_json(silent=True) or {}
    initial_password = str(d.get("initial_password", "")).strip()
    if not initial_password:
        return jsonify({"error": "initial_password is required and must be delivered out-of-band."}), 400

    is_strong, msg = validate_password_strength(initial_password)
    if not is_strong:
        return jsonify({"error": msg}), 400

    lec = create_user(d["name"], d["email"], initial_password,
                      "lecturer", d.get("department", ""),
                      must_change_password=True,
                      department_id=_user_dept_id(user))
    log_action(
        "CREATE_LECTURER",
        str(user["_id"]),
        target_user=lec["_id"],
        rollback=_rb_delete("auth", "users", {"_id": lec.get("_id")}),
    )
    _clear_query_cache()
    lec_clean = sanitise_mongo_doc(lec)

    email_delivery_enabled = is_email_delivery_enabled()
    temp_pass_display_enabled = _temp_pass_display_enabled()
    if email_delivery_enabled:
        send_welcome_email(
            to_email=d["email"],
            name=d["name"],
            temp_password=initial_password,
            role="lecturer",
        )
    message = (
        "Lecturer created. Credentials have been emailed."
        if email_delivery_enabled
        else "Lecturer created. Email delivery is not configured; share the initial password securely."
    )

    payload = {
        **lec_clean,
        "message": message,
        "email_delivery_enabled": email_delivery_enabled,
        "temp_pass_display_enabled": temp_pass_display_enabled,
    }
    if temp_pass_display_enabled:
        payload["temp_password"] = initial_password
    return jsonify(payload), 201


@admin_bp.route("/lecturers/<lid>", methods=["PUT"])
@role_required("department_admin")
@validate_ids("lid")
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
    _clear_query_cache()
    return jsonify(sanitise_mongo_doc(updated))


@admin_bp.route("/lecturers/<lid>", methods=["DELETE"])
@role_required("department_admin")
@validate_ids("lid")
def remove_lecturer(user, lid):
    previous = find_user_by_id(lid)
    delete_user(lid)
    log_action(
        "DELETE_LECTURER",
        str(user["_id"]),
        target_user=lid,
        rollback=_rb_restore("auth", "users", previous) if previous else None,
    )
    _clear_query_cache()
    return jsonify({"message": "Deleted"}), 200


@admin_bp.route("/lecturers/<lid>/reset-password", methods=["POST"])
@role_required("department_admin")
def reset_lecturer_password(user, lid):
    d = request.get_json(silent=True) or {}
    temp_password = reset_user_password(lid, temp_password=str(d.get("temp_password", "")).strip() or None)
    log_action("RESET_PASSWORD", str(user["_id"]), target_user=lid,
               details="Lecturer password reset")

    email_delivery_enabled = is_email_delivery_enabled()
    temp_pass_display_enabled = _temp_pass_display_enabled()

    # Send reset email
    lec_user = find_user_by_id(lid)
    if email_delivery_enabled and lec_user and lec_user.get("email"):
        send_password_reset_email(
            to_email=lec_user["email"],
            name=lec_user.get("name", "Lecturer"),
            temp_password=temp_password,
            role="lecturer",
        )
    message = (
        "Lecturer password reset. New credentials have been emailed."
        if email_delivery_enabled
        else "Lecturer password reset. Email delivery is not configured; share the new password securely."
    )

    payload = {
        "message": message,
        "email_delivery_enabled": email_delivery_enabled,
        "temp_pass_display_enabled": temp_pass_display_enabled,
    }
    if temp_pass_display_enabled:
        payload["temp_password"] = temp_password
    return jsonify(payload)


@admin_bp.route("/lecturers/<lid>/reset-pin", methods=["POST"])
@role_required("department_admin")
@validate_ids("lid")
def reset_lecturer_pin(user, lid):
    new_pin = f"{secrets.randbelow(10000):04d}"
    set_user_pin(lid, new_pin)
    log_action("RESET_LECTURER_PIN", str(user["_id"]), target_user=lid,
               details="Admin reset lecturer PIN")
    return jsonify({"pin": new_pin, "message": "Lecturer PIN reset"})


@admin_bp.route("/lecturers/<lid>/pin", methods=["PUT"])
@role_required("department_admin")
@validate_ids("lid")
def update_lecturer_pin(user, lid):
    return jsonify({"error": "Admins cannot set lecturer PIN. Lecturer must manage PIN from dashboard."}), 403


# ─── Students ───────────────────────────────────────────────────────────────

@admin_bp.route("/lecturers/import-excel", methods=["POST"])
@role_required("department_admin")
def import_lecturers_excel(user):
    """Bulk-import lecturers from an uploaded Excel file.

    Expects multipart/form-data with:
      - file : .xlsx file

    Excel columns (case-insensitive):
            Department, Name, Email, Courses, Papers
    """
    uploaded = request.files.get("file")
    if not uploaded:
        return jsonify({"error": "No file uploaded"}), 400
    if not uploaded.filename.lower().endswith((".xlsx", ".xlsm", ".xltx")):
        return jsonify({"error": "Only .xlsx files are supported"}), 400

    try:
        wb = openpyxl.load_workbook(BytesIO(uploaded.read()), read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
    except Exception as exc:
        return jsonify({"error": f"Could not parse Excel file: {str(exc)}"}), 400

    if not rows:
        return jsonify({"error": "Excel file is empty"}), 400

    header_raw = [str(h).strip().lower() if h is not None else "" for h in rows[0]]
    department_idx = next((i for i, h in enumerate(header_raw) if h in ["department", "dept"]), None)
    name_idx = next((i for i, h in enumerate(header_raw) if h in ["name", "full name", "fullname"]), None)
    email_idx = next((i for i, h in enumerate(header_raw) if h in ["email", "email address", "e-mail"]), None)
    courses_idx = next((i for i, h in enumerate(header_raw) if h in ["courses", "course"]), None)
    papers_idx = next((i for i, h in enumerate(header_raw) if h in ["papers", "paper"]), None)

    if department_idx is None or name_idx is None or email_idx is None:
        return jsonify({"error": f"Missing required columns: Department, Name and/or Email. Found headers: {header_raw}"}), 400

    results = []
    created_count = 0
    skipped_count = 0
    error_count = 0
    temp_pass_display_enabled = _temp_pass_display_enabled()
    departments_col = get_collection("academic", "departments")

    def _cell(row, idx):
        value = row[idx] if idx is not None and idx < len(row) else None
        return str(value).strip() if value is not None else ""

    def _parse_csv_list(raw_value):
        if not raw_value:
            return []
        return [item.strip() for item in str(raw_value).split(",") if item and str(item).strip()]

    def _find_department(raw_department):
        if not raw_department:
            return None
        escaped = re.escape(raw_department.strip())
        return departments_col.find_one({
            "$or": [
                {"name": {"$regex": f"^{escaped}$", "$options": "i"}},
                {"code": {"$regex": f"^{escaped}$", "$options": "i"}},
            ]
        })

    def _resolve_courses(raw_courses):
        resolved = []
        seen_ids = set()
        for course_code in _parse_csv_list(raw_courses):
            course = get_course_by_code(course_code)
            if not course:
                continue
            course_id = str(course.get("_id"))
            if course_id in seen_ids:
                continue
            seen_ids.add(course_id)
            resolved.append(course)
        return resolved

    def _resolve_papers(raw_papers):
        resolved = []
        seen_ids = set()
        for paper_code in _parse_csv_list(raw_papers):
            paper = get_paper_by_code(paper_code)
            if not paper:
                continue
            paper_id = str(paper.get("_id"))
            if paper_id in seen_ids:
                continue
            seen_ids.add(paper_id)
            resolved.append(paper)
        return resolved

    for row_num, row in enumerate(rows[1:], start=2):
        department = _cell(row, department_idx)
        name = _cell(row, name_idx)
        email = _cell(row, email_idx)
        raw_courses = _cell(row, courses_idx)
        raw_papers = _cell(row, papers_idx)

        if not department or not name or not email:
            skipped_count += 1
            results.append({"row": row_num, "status": "skipped", "reason": "Missing Department, Name, or Email"})
            continue

        if find_user_by_email(email):
            skipped_count += 1
            results.append({"row": row_num, "name": name, "email": email, "status": "skipped", "reason": "Email already exists"})
            continue

        try:
            department_doc = _find_department(department)
            department_value = department_doc.get("name") if department_doc else department
            department_id_value = department_doc.get("_id") if department_doc else None
            matched_courses = _resolve_courses(raw_courses)
            matched_papers = _resolve_papers(raw_papers)

            initial_password = _generate_import_temp_password()
            lec = create_user(
                name,
                email,
                initial_password,
                "lecturer",
                department_value,
                must_change_password=True,
                department_id=department_id_value,
            )
            log_action(
                "CREATE_LECTURER",
                str(user["_id"]),
                target_user=lec["_id"],
                rollback=_rb_delete("auth", "users", {"_id": lec.get("_id")}),
            )

            assigned_course_ids = []
            assigned_paper_ids = []
            scoped_papers = get_all_papers(["_id", "course_id"], department_id=department_id_value)
            scoped_paper_map = {}
            for paper in scoped_papers:
                scoped_paper_map.setdefault(str(paper.get("course_id") or ""), []).append(str(paper.get("_id")))

            for course in matched_courses:
                course_id = str(course.get("_id"))
                course_paper_ids = scoped_paper_map.get(course_id, [])
                if course_paper_ids:
                    bulk_assign_lecturer(course_paper_ids, lec["_id"])
                    assigned_course_ids.append(course_id)
                    assigned_paper_ids.extend(course_paper_ids)

            direct_paper_ids = [str(paper.get("_id")) for paper in matched_papers]
            if direct_paper_ids:
                bulk_assign_lecturer(direct_paper_ids, lec["_id"])
                assigned_paper_ids.extend(direct_paper_ids)

            assigned_course_ids = sorted(set(assigned_course_ids))
            assigned_paper_ids = sorted(set(assigned_paper_ids))

            created_count += 1
            row_result = {
                "row": row_num,
                "name": name,
                "email": email,
                "status": "created",
                "department": department_value,
                "matched_courses": [course.get("code") for course in matched_courses],
                "matched_papers": [paper.get("code") for paper in matched_papers],
                "assigned_course_count": len(assigned_course_ids),
                "assigned_paper_count": len(assigned_paper_ids),
            }
            if not department_doc:
                row_result["department_warning"] = "Department not found; stored raw department value"
            if temp_pass_display_enabled:
                row_result["temp_password"] = initial_password
            results.append(row_result)

            send_welcome_email(
                to_email=email,
                name=name,
                temp_password=initial_password,
                role="lecturer",
            )
        except DuplicateKeyError:
            skipped_count += 1
            results.append({"row": row_num, "name": name, "email": email, "status": "skipped", "reason": "Duplicate email"})
        except Exception as exc:
            error_count += 1
            results.append({"row": row_num, "name": name, "email": email, "status": "error", "reason": str(exc)})

    _clear_query_cache()
    return jsonify({
        "message": f"Import complete: {created_count} created, {skipped_count} skipped, {error_count} errors",
        "created": created_count,
        "skipped": skipped_count,
        "errors": error_count,
        "email_delivery_enabled": is_email_delivery_enabled(),
        "temp_pass_display_enabled": temp_pass_display_enabled,
        "results": results,
    }), 207 if (skipped_count + error_count) > 0 else 201


def _generate_import_temp_password(length=14):
    """Generate a cryptographically random temporary password for bulk imports."""
    import string
    upper = string.ascii_uppercase.replace("I", "").replace("O", "")
    lower = string.ascii_lowercase.replace("l", "").replace("o", "")
    digits = "23456789"
    symbols = "!@#$%^&*"
    all_chars = upper + lower + digits + symbols
    chars = [
        secrets.choice(upper),
        secrets.choice(lower),
        secrets.choice(digits),
        secrets.choice(symbols),
    ]
    while len(chars) < length:
        chars.append(secrets.choice(all_chars))
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


