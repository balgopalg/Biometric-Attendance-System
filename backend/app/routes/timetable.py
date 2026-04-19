"""Timetable management and timetable-view APIs."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from flask import Blueprint, jsonify, request

from app.extensions import get_collection
from app.models.course import get_course_by_id
from app.models.enrollment import get_profile_by_user
from app.models.paper import get_papers_by_course
from app.models.timetable import (
    clear_active_timetable_for_scope,
    create_timeslots,
    create_timetable,
    delete_timeslots_for_timetable,
    get_timeslot_by_id,
    get_timetable_by_id,
    list_timeslots_for_timetable,
    list_timetables,
    serialize_slot,
    serialize_timetable,
    update_timeslot,
    update_timetable,
)
from app.services.timetable_generator import WEEKDAYS, generate_timetable_slots
from app.utils.auth_decorators import role_required
from app.utils.helpers import sanitise_many


timetable_bp = Blueprint("timetable", __name__)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return _text(value).lower() in {"1", "true", "yes", "y"}


def _to_oid(value: Any) -> Optional[ObjectId]:
    if isinstance(value, ObjectId):
        return value
    text = _text(value)
    if not text:
        return None
    try:
        return ObjectId(text)
    except Exception:
        return None


def _normalize_user_role(user: dict) -> str:
    role = _text(user.get("role"))
    return "super_admin" if role == "admin" else role


def _normalize_department_scope(user: dict, payload_department_id: Any, *, required_for_super_admin: bool = True) -> Optional[ObjectId]:
    user_role = _normalize_user_role(user)
    user_department_id = _to_oid(user.get("department_id"))

    if user_role == "department_admin":
        if not user_department_id:
            raise ValueError("Department admin is not linked to any department")
        payload_dep_oid = _to_oid(payload_department_id)
        if payload_dep_oid and payload_dep_oid != user_department_id:
            raise PermissionError("department_id does not match your assigned department")
        return user_department_id

    dep_oid = _to_oid(payload_department_id)
    if user_role == "super_admin":
        if not dep_oid and required_for_super_admin:
            raise ValueError("department_id is required")
        return dep_oid

    return user_department_id


def _get_papers_for_generation(*, department_id: ObjectId, course_id: ObjectId, semester: int) -> List[dict]:
    papers = []
    for paper in get_papers_by_course(str(course_id)):
        sem = paper.get("semester")
        try:
            sem_val = int(sem)
        except Exception:
            sem_val = None

        paper_dep = _to_oid(paper.get("department_id"))
        if sem_val != semester:
            continue
        if paper_dep and paper_dep != department_id:
            continue
        papers.append(paper)

    return papers


def _enrich_slots(slots: List[dict]) -> List[dict]:
    paper_ids = []
    lecturer_ids = []
    for slot in slots:
        pid = _to_oid(slot.get("paper_id"))
        lid = _to_oid(slot.get("lecturer_id"))
        if pid:
            paper_ids.append(pid)
        if lid:
            lecturer_ids.append(lid)

    papers_map = {}
    users_map = {}

    if paper_ids:
        papers_col = get_collection("academic", "papers")
        for doc in papers_col.find({"_id": {"$in": list({pid for pid in paper_ids})}}):
            papers_map[str(doc.get("_id"))] = doc

    if lecturer_ids:
        users_col = get_collection("auth", "users")
        for doc in users_col.find({"_id": {"$in": list({lid for lid in lecturer_ids})}}):
            users_map[str(doc.get("_id"))] = doc

    enriched = []
    for raw in slots:
        slot = serialize_slot(raw) or {}
        paper = papers_map.get(_text(slot.get("paper_id")))
        lecturer = users_map.get(_text(slot.get("lecturer_id")))
        slot["paper_name"] = (paper or {}).get("name") or slot.get("paper_name") or ""
        slot["paper_code"] = (paper or {}).get("code") or slot.get("paper_code") or ""
        slot["lecturer_name"] = (lecturer or {}).get("name") or ""
        enriched.append(slot)

    return enriched


def _build_timetable_payload(doc: dict, include_slots: bool = True) -> dict:
    payload = serialize_timetable(doc) or {}

    dep = None
    course = None
    if payload.get("department_id"):
        dep = get_collection("academic", "departments").find_one({"_id": _to_oid(payload.get("department_id"))})
    if payload.get("course_id"):
        course = get_course_by_id(payload.get("course_id"))

    payload["department_name"] = (dep or {}).get("name") or ""
    payload["course_name"] = (course or {}).get("name") or ""
    payload["course_code"] = (course or {}).get("code") or ""

    if include_slots:
        slots = list_timeslots_for_timetable(payload.get("_id"))
        payload["slots"] = _enrich_slots(slots)
    else:
        payload["slots"] = []

    return payload


def _slot_overlaps(a: dict, b: dict) -> bool:
    return (
        int(a.get("start_minutes") or -1) < int(b.get("end_minutes") or -1)
        and int(a.get("end_minutes") or -1) > int(b.get("start_minutes") or -1)
    )


def _time_to_minutes(value: Any) -> Optional[int]:
    text = _text(value)
    if not text or ":" not in text:
        return None
    parts = text.split(":", 1)
    try:
        hh = int(parts[0])
        mm = int(parts[1])
    except Exception:
        return None
    if hh < 0 or hh > 23 or mm < 0 or mm > 59:
        return None
    return (hh * 60) + mm


def _day_to_index(day_name: Any) -> Optional[int]:
    text = _text(day_name).lower()
    if not text:
        return None
    for idx, day in enumerate(WEEKDAYS):
        if _text(day).lower() == text:
            return idx
    return None


def _normalize_slot_for_conflict(slot: dict) -> Optional[dict]:
    lecturer_id = _to_oid(slot.get("lecturer_id"))
    if not lecturer_id:
        return None

    day_index = slot.get("day_index")
    start_minutes = slot.get("start_minutes")
    end_minutes = slot.get("end_minutes")
    if day_index is None or start_minutes is None or end_minutes is None:
        return None

    try:
        day_index = int(day_index)
        start_minutes = int(start_minutes)
        end_minutes = int(end_minutes)
    except Exception:
        return None

    if end_minutes <= start_minutes:
        return None

    return {
        **slot,
        "lecturer_id": lecturer_id,
        "day_index": day_index,
        "start_minutes": start_minutes,
        "end_minutes": end_minutes,
    }


def _derive_academic_session(start_year: int, course_duration: Any) -> str:
    try:
        duration_years = max(1, int(course_duration or 1))
    except Exception:
        duration_years = 1
    end_year_short = str(start_year + duration_years)[-2:]
    return f"{start_year}-{end_year_short}"


def _intra_conflicts(slots: List[dict]) -> List[dict]:
    normalized = [item for item in (_normalize_slot_for_conflict(slot) for slot in slots) if item]
    conflicts: List[dict] = []

    for i in range(len(normalized)):
        left = normalized[i]
        for j in range(i + 1, len(normalized)):
            right = normalized[j]
            if left.get("lecturer_id") != right.get("lecturer_id"):
                continue
            if left.get("day_index") != right.get("day_index"):
                continue
            if not _slot_overlaps(left, right):
                continue

            conflicts.append(
                {
                    "type": "intra_timetable",
                    "lecturer_id": str(left.get("lecturer_id")),
                    "day_index": left.get("day_index"),
                    "slot_a": {
                        "slot_id": _text(left.get("_id") or left.get("slot_id")),
                        "day": left.get("day"),
                        "start_time": left.get("start_time"),
                        "end_time": left.get("end_time"),
                    },
                    "slot_b": {
                        "slot_id": _text(right.get("_id") or right.get("slot_id")),
                        "day": right.get("day"),
                        "start_time": right.get("start_time"),
                        "end_time": right.get("end_time"),
                    },
                }
            )

    return conflicts


def _active_conflicts(slots: List[dict], *, exclude_timetable_id: Optional[Any] = None) -> List[dict]:
    normalized = [item for item in (_normalize_slot_for_conflict(slot) for slot in slots) if item]
    if not normalized:
        return []

    lecturer_ids = list({item.get("lecturer_id") for item in normalized})
    day_indexes = list({item.get("day_index") for item in normalized})

    timetables_col = get_collection("academic", "timetables")
    active_filter: Dict[str, Any] = {"status": "active"}
    if exclude_timetable_id:
        exclude_oid = _to_oid(exclude_timetable_id)
        if exclude_oid:
            active_filter["_id"] = {"$ne": exclude_oid}

    active_timetable_ids = [doc.get("_id") for doc in timetables_col.find(active_filter, {"_id": 1})]
    if not active_timetable_ids:
        return []

    slots_col = get_collection("academic", "timetable_slots")
    existing_slots = list(
        slots_col.find(
            {
                "timetable_id": {"$in": active_timetable_ids},
                "lecturer_id": {"$in": lecturer_ids},
                "day_index": {"$in": day_indexes},
            }
        )
    )

    conflicts: List[dict] = []
    for candidate in normalized:
        for existing in existing_slots:
            existing_norm = _normalize_slot_for_conflict(existing)
            if not existing_norm:
                continue
            if existing_norm.get("lecturer_id") != candidate.get("lecturer_id"):
                continue
            if existing_norm.get("day_index") != candidate.get("day_index"):
                continue
            if not _slot_overlaps(existing_norm, candidate):
                continue

            conflicts.append(
                {
                    "type": "active_timetable",
                    "lecturer_id": str(candidate.get("lecturer_id")),
                    "day_index": candidate.get("day_index"),
                    "candidate_slot": {
                        "slot_id": _text(candidate.get("_id") or candidate.get("slot_id")),
                        "day": candidate.get("day"),
                        "start_time": candidate.get("start_time"),
                        "end_time": candidate.get("end_time"),
                    },
                    "existing_slot": {
                        "slot_id": _text(existing_norm.get("_id") or existing_norm.get("slot_id")),
                        "timetable_id": _text(existing_norm.get("timetable_id")),
                        "day": existing_norm.get("day"),
                        "start_time": existing_norm.get("start_time"),
                        "end_time": existing_norm.get("end_time"),
                    },
                }
            )

    return conflicts


def _assert_no_conflicts(slots: List[dict], *, check_active_conflicts: bool, exclude_timetable_id: Optional[Any] = None) -> Optional[dict]:
    intra = _intra_conflicts(slots)
    active = _active_conflicts(slots, exclude_timetable_id=exclude_timetable_id) if check_active_conflicts else []
    if not intra and not active:
        return None

    return {
        "error": "Timetable conflict detected for lecturer schedule",
        "conflicts": {
            "intra_timetable": intra,
            "active_timetable": active,
        },
    }


def _build_conflict_context(*, papers: List[dict], exclude_timetable_id: Optional[Any] = None) -> Dict[str, Any]:
    lecturer_ids = sorted({str(_to_oid(p.get("lecturer_id")) or "") for p in papers if _to_oid(p.get("lecturer_id"))})
    if not lecturer_ids:
        return {"lecturer_busy_slots": {}}

    timetables_col = get_collection("academic", "timetables")
    active_filter: Dict[str, Any] = {"status": "active"}
    if exclude_timetable_id:
        exclude_oid = _to_oid(exclude_timetable_id)
        if exclude_oid:
            active_filter["_id"] = {"$ne": exclude_oid}

    active_timetable_ids = [doc.get("_id") for doc in timetables_col.find(active_filter, {"_id": 1})]
    if not active_timetable_ids:
        return {"lecturer_busy_slots": {}}

    slots_col = get_collection("academic", "timetable_slots")
    lecturer_oid_map = {ObjectId(lecturer_id): lecturer_id for lecturer_id in lecturer_ids}
    busy_slots: Dict[str, List[dict]] = {lecturer_id: [] for lecturer_id in lecturer_ids}

    for slot in slots_col.find(
        {
            "timetable_id": {"$in": active_timetable_ids},
            "lecturer_id": {"$in": list(lecturer_oid_map.keys())},
        }
    ):
        normalized = _normalize_slot_for_conflict(slot)
        if not normalized:
            continue
        lecturer_id = str(normalized.get("lecturer_id") or "")
        if lecturer_id in busy_slots:
            busy_slots[lecturer_id].append(normalized)

    return {"lecturer_busy_slots": busy_slots}


def _build_generated_slot_docs(
    generated_slots: List[dict],
    *,
    department_id: ObjectId,
    course_id: ObjectId,
    semester: int,
    timetable_id: Optional[ObjectId] = None,
) -> List[dict]:
    docs: List[dict] = []
    for slot in generated_slots:
        row: Dict[str, Any] = {
            "department_id": department_id,
            "course_id": course_id,
            "semester": semester,
            "day": slot.get("day"),
            "day_index": slot.get("day_index"),
            "start_time": slot.get("start_time"),
            "end_time": slot.get("end_time"),
            "start_minutes": slot.get("start_minutes"),
            "end_minutes": slot.get("end_minutes"),
            "paper_id": _to_oid(slot.get("paper_id")),
            "lecturer_id": _to_oid(slot.get("lecturer_id")),
            "location": _text(slot.get("location")),
            "generated": True,
        }
        if timetable_id:
            row["timetable_id"] = timetable_id
        docs.append(row)
    return docs


def _plan_generation_with_conflict_retries(
    *,
    papers: List[dict],
    class_duration_minutes: int,
    class_start_time: str,
    class_end_time: str,
    recess_start_time: str,
    recess_end_time: str,
    weekdays: List[str],
    max_classes_per_day: Optional[int],
    department_id: ObjectId,
    course_id: ObjectId,
    semester: int,
    check_active_conflicts: bool,
    exclude_timetable_id: Optional[Any] = None,
    retry_on_conflict: bool = False,
    retry_attempts: int = 8,
    randomize_seed: Optional[int] = None,
    conflict_context: Optional[Dict[str, Any]] = None,
) -> tuple[Optional[List[dict]], Optional[dict], Optional[dict]]:
    attempts = 1
    if retry_on_conflict:
        attempts = max(2, min(int(retry_attempts or 8), 20))

    base_seed = randomize_seed
    if retry_on_conflict and base_seed is None:
        base_seed = int(datetime.now(timezone.utc).timestamp() * 1000)

    last_conflict_payload: Optional[dict] = None
    for attempt_idx in range(attempts):
        use_randomized_order = retry_on_conflict
        seed_for_attempt = (base_seed + attempt_idx) if (use_randomized_order and base_seed is not None) else None

        generated_slots, generation_meta = generate_timetable_slots(
            papers=papers,
            class_duration_minutes=class_duration_minutes,
            class_start_time=class_start_time,
            class_end_time=class_end_time,
            recess_start_time=recess_start_time or None,
            recess_end_time=recess_end_time or None,
            weekdays=weekdays,
            max_classes_per_day=max_classes_per_day,
            randomize_paper_order=use_randomized_order,
            random_seed=seed_for_attempt,
            conflict_context=conflict_context,
        )

        candidate_slots = _build_generated_slot_docs(
            generated_slots,
            department_id=department_id,
            course_id=course_id,
            semester=semester,
        )

        conflict_payload = _assert_no_conflicts(
            candidate_slots,
            check_active_conflicts=check_active_conflicts,
            exclude_timetable_id=exclude_timetable_id,
        )

        if not conflict_payload:
            generation_meta = {
                **(generation_meta or {}),
                "generation_attempt": attempt_idx + 1,
                "generation_attempts_total": attempts,
            }
            return generated_slots, generation_meta, None

        last_conflict_payload = conflict_payload

    if last_conflict_payload is not None:
        last_conflict_payload["retry_context"] = {
            "retry_on_conflict": bool(retry_on_conflict),
            "attempts": attempts,
        }
    return None, None, last_conflict_payload


@timetable_bp.route("/academic-sessions", methods=["GET"])
@role_required("department_admin")
def list_academic_sessions_for_scope(user):
    try:
        department_id = _normalize_department_scope(user, request.args.get("department_id"))
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    course_id = _to_oid(request.args.get("course_id"))
    if not course_id:
        return jsonify({"academic_sessions": [], "semester_options": []})

    profiles_col = get_collection("academic", "student_profiles")
    query: Dict[str, Any] = {"course_id": str(course_id)}
    if department_id:
        query["department_id"] = department_id

    sessions = set()
    for profile in profiles_col.find(query, {"academic_session": 1, "academic_year": 1}):
        value = _text(profile.get("academic_session") or profile.get("academic_year"))
        if value:
            sessions.add(value)

    course_doc = get_course_by_id(str(course_id)) or {}

    # Include sessions from generated timetables for this scope.
    timetable_query: Dict[str, Any] = {"course_id": str(course_id)}
    if department_id:
        timetable_query["department_id"] = str(department_id)
    tt_col = get_collection("academic", "timetables")
    for row in tt_col.find(timetable_query, {"academic_session": 1}):
        value = _text(row.get("academic_session"))
        if value:
            sessions.add(value)

    try:
        duration_years = max(1, int(course_doc.get("course_duration") or 1))
    except Exception:
        duration_years = 1

    # Fallback for newly created courses without students/timetables yet.
    current_year = datetime.now(timezone.utc).year
    sessions.add(_derive_academic_session(current_year, duration_years))

    semester_options = [idx + 1 for idx in range(duration_years * 2)]

    return jsonify(
        {
            "academic_sessions": sorted(list(sessions), reverse=True),
            "semester_options": semester_options,
        }
    )


@timetable_bp.route("/papers", methods=["GET"])
@role_required("department_admin")
def list_papers_for_timetable(user):
    try:
        department_id = _normalize_department_scope(user, request.args.get("department_id"))
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    course_id = _to_oid(request.args.get("course_id"))
    if not course_id:
        return jsonify([])

    semester_text = _text(request.args.get("semester"))
    try:
        semester = int(semester_text)
    except Exception:
        return jsonify({"error": "semester is required and must be numeric"}), 400

    papers = _get_papers_for_generation(
        department_id=department_id,
        course_id=course_id,
        semester=semester,
    )

    return jsonify(sanitise_many(papers))


@timetable_bp.route("/admin", methods=["GET"])
@role_required("department_admin")
def list_admin_timetables(user):
    try:
        department_id = _normalize_department_scope(user, request.args.get("department_id"), required_for_super_admin=False)
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    course_id = _to_oid(request.args.get("course_id"))
    semester = _text(request.args.get("semester"))
    status = _text(request.args.get("status")).lower()
    academic_session = _text(request.args.get("academic_session"))
    include_slots = _to_bool(request.args.get("include_slots", "true"))

    docs = list_timetables(
        department_id=department_id,
        course_id=course_id,
        semester=semester,
        status=status,
        academic_session=academic_session,
    )

    return jsonify([_build_timetable_payload(doc, include_slots=include_slots) for doc in docs])


@timetable_bp.route("/admin/generate", methods=["POST"])
@role_required("department_admin")
def generate_admin_timetable(user):
    payload = request.get_json(silent=True) or {}

    try:
        department_id = _normalize_department_scope(user, payload.get("department_id"))
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    course_id = _to_oid(payload.get("course_id"))
    if not course_id:
        return jsonify({"error": "course_id is required"}), 400

    try:
        semester = int(payload.get("semester"))
    except Exception:
        return jsonify({"error": "semester is required and must be numeric"}), 400

    try:
        class_duration_minutes = int(payload.get("class_duration_minutes", 60))
    except Exception:
        return jsonify({"error": "class_duration_minutes must be numeric"}), 400

    class_start_time = _text(payload.get("class_start_time"))
    class_end_time = _text(payload.get("class_end_time"))
    recess_start_time = _text(payload.get("recess_start_time"))
    recess_end_time = _text(payload.get("recess_end_time"))
    max_classes_per_day_raw = payload.get("max_classes_per_day")
    max_classes_per_day = None
    if max_classes_per_day_raw not in (None, ""):
        try:
            max_classes_per_day = int(max_classes_per_day_raw)
        except Exception:
            return jsonify({"error": "max_classes_per_day must be numeric"}), 400
        if max_classes_per_day <= 0:
            return jsonify({"error": "max_classes_per_day must be greater than 0"}), 400
    status = _text(payload.get("status")).lower() or "draft"
    academic_session = _text(payload.get("academic_session"))
    retry_on_conflict = _to_bool(payload.get("retry_on_conflict"))
    retry_attempts_raw = payload.get("retry_attempts", 8)
    randomize_seed_raw = payload.get("randomize_seed")

    try:
        retry_attempts = int(retry_attempts_raw)
    except Exception:
        retry_attempts = 8

    randomize_seed = None
    if randomize_seed_raw not in (None, ""):
        try:
            randomize_seed = int(randomize_seed_raw)
        except Exception:
            return jsonify({"error": "randomize_seed must be numeric"}), 400

    if not class_start_time or not class_end_time:
        return jsonify({"error": "class_start_time and class_end_time are required"}), 400

    weekdays = payload.get("weekdays") if isinstance(payload.get("weekdays"), list) else WEEKDAYS

    papers = _get_papers_for_generation(
        department_id=department_id,
        course_id=course_id,
        semester=semester,
    )
    if not papers:
        return jsonify({"error": "No papers found for selected department, course, and semester"}), 400

    conflict_context = _build_conflict_context(papers=papers)

    try:
        generated_slots, generation_meta, conflict_payload = _plan_generation_with_conflict_retries(
            papers=papers,
            class_duration_minutes=class_duration_minutes,
            class_start_time=class_start_time,
            class_end_time=class_end_time,
            recess_start_time=recess_start_time,
            recess_end_time=recess_end_time,
            weekdays=weekdays,
            max_classes_per_day=max_classes_per_day,
            department_id=department_id,
            course_id=course_id,
            semester=semester,
            check_active_conflicts=(status == "active"),
            retry_on_conflict=retry_on_conflict,
            retry_attempts=retry_attempts,
            randomize_seed=randomize_seed,
            conflict_context=conflict_context,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if conflict_payload:
        return jsonify(conflict_payload), 409

    if status == "active":
        clear_active_timetable_for_scope(
            department_id=department_id,
            course_id=course_id,
            semester=semester,
            academic_session=academic_session,
        )

    now = datetime.now(timezone.utc)
    creator_id = _to_oid(user.get("_id"))
    timetable_doc = create_timetable(
        {
            "department_id": department_id,
            "course_id": course_id,
            "semester": semester,
            "academic_session": academic_session,
            "status": status,
            "class_duration_minutes": class_duration_minutes,
            "class_start_time": class_start_time,
            "class_end_time": class_end_time,
            "recess_start_time": recess_start_time,
            "recess_end_time": recess_end_time,
            "max_classes_per_day": max_classes_per_day,
            "weekdays": weekdays,
            "generated_at": now,
            "generated_by": creator_id,
            "created_by": creator_id,
            "updated_by": creator_id,
            "generation_meta": generation_meta,
        }
    )

    timetable_oid = timetable_doc.get("_id")
    slot_docs = _build_generated_slot_docs(
        generated_slots,
        department_id=department_id,
        course_id=course_id,
        semester=semester,
        timetable_id=timetable_oid,
    )

    create_timeslots(slot_docs)

    return jsonify(_build_timetable_payload(timetable_doc, include_slots=True)), 201


@timetable_bp.route("/admin/<timetable_id>/slots", methods=["PUT"])
@role_required("department_admin")
def update_admin_timetable_slots(user, timetable_id):
    timetable = get_timetable_by_id(timetable_id)
    if not timetable:
        return jsonify({"error": "Timetable not found"}), 404

    try:
        scoped_department_id = _normalize_department_scope(user, timetable.get("department_id"))
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if _to_oid(timetable.get("department_id")) != scoped_department_id:
        return jsonify({"error": "Access denied for this timetable"}), 403

    payload = request.get_json(silent=True) or {}
    slot_updates = payload.get("slots") if isinstance(payload.get("slots"), list) else []
    status_update = _text(payload.get("status")).lower()

    if not slot_updates and not status_update:
        return jsonify({"error": "No updates provided"}), 400

    current_slots = list_timeslots_for_timetable(timetable_id)
    slots_by_id = {str(slot.get("_id")): dict(slot) for slot in current_slots}
    slots_by_period = {
        (_text(slot.get("day")), _text(slot.get("start_time")), _text(slot.get("end_time"))): dict(slot)
        for slot in current_slots
    }
    resolved_updates: Dict[str, Dict[str, Any]] = {}

    for item in slot_updates:
        slot_id = _text(item.get("slot_id"))
        existing_slot = None

        if slot_id:
            existing_slot = slots_by_id.get(slot_id)
            if not existing_slot or str(existing_slot.get("timetable_id")) != str(timetable.get("_id")):
                return jsonify({"error": f"Invalid slot_id: {slot_id}"}), 400
        else:
            day = _text(item.get("day"))
            start_time = _text(item.get("start_time"))
            end_time = _text(item.get("end_time"))
            if not day or not start_time or not end_time:
                continue

            existing_slot = slots_by_period.get((day, start_time, end_time))
            if existing_slot:
                slot_id = str(existing_slot.get("_id"))
            else:
                day_index = item.get("day_index")
                try:
                    day_index = int(day_index)
                except Exception:
                    day_index = _day_to_index(day)

                start_minutes = item.get("start_minutes")
                end_minutes = item.get("end_minutes")
                try:
                    start_minutes = int(start_minutes)
                except Exception:
                    start_minutes = _time_to_minutes(start_time)
                try:
                    end_minutes = int(end_minutes)
                except Exception:
                    end_minutes = _time_to_minutes(end_time)

                if day_index is None or start_minutes is None or end_minutes is None or end_minutes <= start_minutes:
                    return jsonify({"error": "Unable to resolve timetable slot for edit"}), 400

                slot_id = f"__new__{len(slots_by_id)}"
                existing_slot = {
                    "timetable_id": _to_oid(timetable.get("_id")),
                    "department_id": _to_oid(timetable.get("department_id")),
                    "course_id": _to_oid(timetable.get("course_id")),
                    "semester": int(timetable.get("semester") or 0),
                    "day": day,
                    "day_index": day_index,
                    "start_time": start_time,
                    "end_time": end_time,
                    "start_minutes": start_minutes,
                    "end_minutes": end_minutes,
                    "paper_id": None,
                    "lecturer_id": None,
                    "location": "",
                    "generated": True,
                }
                slots_by_id[slot_id] = existing_slot

        updates: Dict[str, Any] = {}
        if "paper_id" in item:
            updates["paper_id"] = _to_oid(item.get("paper_id"))
            if updates["paper_id"]:
                paper_doc = get_collection("academic", "papers").find_one({"_id": updates["paper_id"]})
                updates["lecturer_id"] = _to_oid((paper_doc or {}).get("lecturer_id"))
            else:
                updates["lecturer_id"] = None
        if "lecturer_id" in item:
            updates["lecturer_id"] = _to_oid(item.get("lecturer_id"))
        if "location" in item:
            updates["location"] = _text(item.get("location"))

        if updates:
            slots_by_id[slot_id] = {**existing_slot, **updates}
            resolved_updates[slot_id] = updates

    prospective_slots = list(slots_by_id.values())
    check_active_conflicts = str(timetable.get("status") or "").lower() == "active" or status_update == "active"
    conflict_payload = _assert_no_conflicts(
        prospective_slots,
        check_active_conflicts=check_active_conflicts,
        exclude_timetable_id=timetable.get("_id"),
    )
    if conflict_payload:
        return jsonify(conflict_payload), 409

    new_slot_docs: List[Dict[str, Any]] = []
    for slot_id, updates in resolved_updates.items():
        if slot_id.startswith("__new__"):
            slot_doc = dict(slots_by_id.get(slot_id) or {})
            slot_doc.pop("_id", None)
            new_slot_docs.append(slot_doc)
            continue
        update_timeslot(slot_id, updates)

    if new_slot_docs:
        create_timeslots(new_slot_docs)

    timetable_updates: Dict[str, Any] = {"updated_by": _to_oid(user.get("_id"))}
    if status_update in {"draft", "active", "archived"}:
        if status_update == "active":
            clear_active_timetable_for_scope(
                department_id=timetable.get("department_id"),
                course_id=timetable.get("course_id"),
                semester=timetable.get("semester"),
                academic_session=timetable.get("academic_session"),
            )
        timetable_updates["status"] = status_update

    update_timetable(timetable_id, timetable_updates)
    updated = get_timetable_by_id(timetable_id)
    return jsonify(_build_timetable_payload(updated, include_slots=True))


@timetable_bp.route("/admin/<timetable_id>/regenerate", methods=["POST"])
@role_required("department_admin")
def regenerate_admin_timetable(user, timetable_id):
    timetable = get_timetable_by_id(timetable_id)
    if not timetable:
        return jsonify({"error": "Timetable not found"}), 404

    try:
        scoped_department_id = _normalize_department_scope(user, timetable.get("department_id"))
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if _to_oid(timetable.get("department_id")) != scoped_department_id:
        return jsonify({"error": "Access denied for this timetable"}), 403

    payload = request.get_json(silent=True) or {}

    class_duration_minutes = int(payload.get("class_duration_minutes") or timetable.get("class_duration_minutes") or 60)
    class_start_time = _text(payload.get("class_start_time") or timetable.get("class_start_time"))
    class_end_time = _text(payload.get("class_end_time") or timetable.get("class_end_time"))
    recess_start_time = _text(payload.get("recess_start_time") or timetable.get("recess_start_time"))
    recess_end_time = _text(payload.get("recess_end_time") or timetable.get("recess_end_time"))
    max_classes_per_day_raw = payload.get("max_classes_per_day")
    if max_classes_per_day_raw in (None, ""):
        max_classes_per_day_raw = timetable.get("max_classes_per_day")
    max_classes_per_day = None
    if max_classes_per_day_raw not in (None, ""):
        try:
            max_classes_per_day = int(max_classes_per_day_raw)
        except Exception:
            return jsonify({"error": "max_classes_per_day must be numeric"}), 400
        if max_classes_per_day <= 0:
            return jsonify({"error": "max_classes_per_day must be greater than 0"}), 400
    weekdays = payload.get("weekdays") if isinstance(payload.get("weekdays"), list) else (timetable.get("weekdays") or WEEKDAYS)
    retry_on_conflict = _to_bool(payload.get("retry_on_conflict"))
    retry_attempts_raw = payload.get("retry_attempts", 8)
    randomize_seed_raw = payload.get("randomize_seed")

    try:
        retry_attempts = int(retry_attempts_raw)
    except Exception:
        retry_attempts = 8

    randomize_seed = None
    if randomize_seed_raw not in (None, ""):
        try:
            randomize_seed = int(randomize_seed_raw)
        except Exception:
            return jsonify({"error": "randomize_seed must be numeric"}), 400

    papers = _get_papers_for_generation(
        department_id=_to_oid(timetable.get("department_id")),
        course_id=_to_oid(timetable.get("course_id")),
        semester=int(timetable.get("semester") or 0),
    )
    if not papers:
        return jsonify({"error": "No papers found for selected course and semester"}), 400

    conflict_context = _build_conflict_context(papers=papers, exclude_timetable_id=timetable.get("_id"))

    check_active_conflicts = str(timetable.get("status") or "").lower() == "active"
    try:
        generated_slots, generation_meta, conflict_payload = _plan_generation_with_conflict_retries(
            papers=papers,
            class_duration_minutes=class_duration_minutes,
            class_start_time=class_start_time,
            class_end_time=class_end_time,
            recess_start_time=recess_start_time,
            recess_end_time=recess_end_time,
            weekdays=weekdays,
            max_classes_per_day=max_classes_per_day,
            department_id=_to_oid(timetable.get("department_id")),
            course_id=_to_oid(timetable.get("course_id")),
            semester=int(timetable.get("semester") or 0),
            check_active_conflicts=check_active_conflicts,
            exclude_timetable_id=timetable.get("_id"),
            retry_on_conflict=retry_on_conflict,
            retry_attempts=retry_attempts,
            randomize_seed=randomize_seed,
            conflict_context=conflict_context,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if conflict_payload:
        return jsonify(conflict_payload), 409

    delete_timeslots_for_timetable(timetable_id)

    slot_docs = _build_generated_slot_docs(
        generated_slots,
        department_id=_to_oid(timetable.get("department_id")),
        course_id=_to_oid(timetable.get("course_id")),
        semester=int(timetable.get("semester") or 0),
        timetable_id=_to_oid(timetable.get("_id")),
    )

    create_timeslots(slot_docs)

    update_timetable(
        timetable_id,
        {
            "class_duration_minutes": class_duration_minutes,
            "class_start_time": class_start_time,
            "class_end_time": class_end_time,
            "recess_start_time": recess_start_time,
            "recess_end_time": recess_end_time,
            "max_classes_per_day": max_classes_per_day,
            "weekdays": weekdays,
            "generation_meta": generation_meta,
            "updated_by": _to_oid(user.get("_id")),
            "regenerated_at": datetime.now(timezone.utc),
        },
    )

    updated = get_timetable_by_id(timetable_id)
    return jsonify(_build_timetable_payload(updated, include_slots=True))


@timetable_bp.route("/admin/<timetable_id>/status", methods=["PATCH"])
@role_required("department_admin")
def set_timetable_status(user, timetable_id):
    timetable = get_timetable_by_id(timetable_id)
    if not timetable:
        return jsonify({"error": "Timetable not found"}), 404

    try:
        scoped_department_id = _normalize_department_scope(user, timetable.get("department_id"))
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if _to_oid(timetable.get("department_id")) != scoped_department_id:
        return jsonify({"error": "Access denied for this timetable"}), 403

    payload = request.get_json(silent=True) or {}
    status = _text(payload.get("status")).lower()
    if status not in {"draft", "active", "archived"}:
        return jsonify({"error": "status must be one of: draft, active, archived"}), 400

    if status == "active":
        existing_slots = list_timeslots_for_timetable(timetable_id)
        conflict_payload = _assert_no_conflicts(
            existing_slots,
            check_active_conflicts=True,
            exclude_timetable_id=timetable.get("_id"),
        )
        if conflict_payload:
            return jsonify(conflict_payload), 409

        clear_active_timetable_for_scope(
            department_id=timetable.get("department_id"),
            course_id=timetable.get("course_id"),
            semester=timetable.get("semester"),
            academic_session=timetable.get("academic_session"),
        )

    updated = update_timetable(timetable_id, {"status": status, "updated_by": _to_oid(user.get("_id"))})
    return jsonify(_build_timetable_payload(updated, include_slots=True))


@timetable_bp.route("/admin/<timetable_id>", methods=["DELETE"])
@role_required("department_admin")
def delete_admin_timetable(user, timetable_id):
    timetable = get_timetable_by_id(timetable_id)
    if not timetable:
        return jsonify({"error": "Timetable not found"}), 404

    try:
        scoped_department_id = _normalize_department_scope(user, timetable.get("department_id"))
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if _to_oid(timetable.get("department_id")) != scoped_department_id:
        return jsonify({"error": "Access denied for this timetable"}), 403

    status = _text(timetable.get("status")).lower()
    if status not in {"draft", "active"}:
        return jsonify({"error": "Only draft or active timetables can be deleted"}), 400

    delete_timeslots_for_timetable(timetable_id)
    timetables_col = get_collection("academic", "timetables")
    timetables_col.delete_one({"_id": _to_oid(timetable_id)})

    return jsonify({"message": "Timetable deleted successfully"})


@timetable_bp.route("/lecturer/my", methods=["GET"])
@role_required("lecturer")
def lecturer_my_timetable(user):
    lecturer_id = _to_oid(user.get("_id"))
    if not lecturer_id:
        return jsonify({"items": []})

    slots_col = get_collection("academic", "timetable_slots")
    timetables_col = get_collection("academic", "timetables")

    status_filter = _text(request.args.get("status")).lower() or "active"
    timetable_filter = {"status": status_filter} if status_filter in {"active", "draft", "archived"} else {}

    timetable_docs = list(timetables_col.find(timetable_filter, {"_id": 1}))
    timetable_ids = [doc.get("_id") for doc in timetable_docs]
    if not timetable_ids:
        return jsonify({"items": []})

    slots = list(
        slots_col.find({"timetable_id": {"$in": timetable_ids}, "lecturer_id": lecturer_id}).sort(
            [("day_index", 1), ("start_minutes", 1)]
        )
    )

    items = _enrich_slots(slots)
    return jsonify({"items": items})


@timetable_bp.route("/student/my", methods=["GET"])
@role_required("student")
def student_my_timetable(user):
    profile = get_profile_by_user(str(user.get("_id")))
    if not profile:
        return jsonify({"error": "Student profile not found"}), 404

    course_id = _to_oid(profile.get("course_id"))
    if not course_id:
        return jsonify({"error": "Student course is not assigned"}), 400

    semester = profile.get("current_semester")
    try:
        semester = int(semester)
    except Exception:
        return jsonify({"error": "Student semester is not configured"}), 400

    academic_session = _text(profile.get("academic_session") or profile.get("academic_year"))

    docs = list_timetables(
        course_id=course_id,
        semester=semester,
        status="active",
        academic_session=academic_session,
    )
    if not docs:
        docs = list_timetables(course_id=course_id, semester=semester, status="active")

    if not docs:
        return jsonify({"items": [], "semester": semester, "course_id": str(course_id)})

    timetable = docs[0]
    slots = list_timeslots_for_timetable(str(timetable.get("_id")))
    items = _enrich_slots(slots)

    return jsonify(
        {
            "course_id": str(course_id),
            "semester": semester,
            "academic_session": academic_session,
            "timetable": _build_timetable_payload(timetable, include_slots=False),
            "items": items,
        }
    )
