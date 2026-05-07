"""Academic calendar routes for OCR extraction and publishing."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from io import BytesIO

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.models.calendar import (
    archive_existing_calendars,
    create_calendar,
    get_current_calendar,
    list_calendars,
    serialize_calendar,
)
from app.models.user import find_user_by_email
from app.services.calendar_ocr import extract_calendar_draft
from app.utils.auth_decorators import role_required


calendar_bp = Blueprint("calendar", __name__)


def _normalize_role(user: dict) -> str:
    role = str(user.get("role") or "").strip().lower()
    return "super_admin" if role == "admin" else role


def _to_text(value):
    return str(value or "").strip()


def _to_year(value):
    text = _to_text(value)
    if not text:
        return None
    try:
        return int(text)
    except Exception:
        return text


def _parse_calendar_date(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()

    text = _to_text(value)
    if not text:
        return None

    # Support both incoming formats from OCR/excel/manual edits.
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except Exception:
            continue
    return None


def _storage_date(value):
    parsed = _parse_calendar_date(value)
    if not parsed:
        return _to_text(value)
    return parsed.strftime("%d-%m-%Y")


def _normalize_holiday_items(items):
    normalized = []
    seen = set()
    for item in (items or []):
        if not isinstance(item, dict):
            continue
        label = _to_text(item.get("label") or item.get("eventName") or item.get("name") or "Holiday")
        date_value = _storage_date(item.get("date") or item.get("startDate"))
        if not date_value:
            continue
        dedupe_key = f"{date_value.lower()}|{label.lower()}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        normalized.append({"label": label, "date": date_value})
    return normalized


def _year_sundays_storage(year):
    try:
        y = int(year)
    except Exception:
        return []

    pointer = datetime(y, 1, 1).date()
    end = datetime(y, 12, 31).date()
    sundays = []
    while pointer <= end:
        if pointer.weekday() == 6:
            sundays.append(pointer.strftime("%d-%m-%Y"))
        pointer += timedelta(days=1)
    return sundays


def _merge_sundays(year, provided):
    values = set(_year_sundays_storage(year))
    for item in (provided or []):
        parsed = _storage_date(item)
        if parsed:
            values.add(parsed)

    def _sort_key(text):
        parsed = _parse_calendar_date(text)
        return parsed or datetime.max.date()

    return sorted(values, key=_sort_key)


def _holiday_bucket_for_type(event_type: str) -> str:
    text = _to_text(event_type).lower()
    return "optional" if "optional" in text else "regular"


def _extract_calendar_draft_from_excel(*, file_bytes: bytes, year_hint=None, source_filename=""):
    try:
        import openpyxl  # lazy import to keep startup light
    except Exception:
        raise RuntimeError("openpyxl is required for Excel extraction. Install backend dependencies.")

    wb = openpyxl.load_workbook(BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise ValueError("Excel file is empty")

    headers = [str(cell or "").strip().lower() for cell in rows[0]]
    index_by_name = {name: idx for idx, name in enumerate(headers) if name}
    required = ("eventname", "startdate", "enddate", "eventtype")
    missing = [name for name in required if name not in index_by_name]
    if missing:
        raise ValueError(f"Missing required Excel columns: {', '.join(missing)}")

    holidays = []
    optional_holidays = []
    all_dates = []

    for row_num, row in enumerate(rows[1:], start=2):
        event_name = _to_text(row[index_by_name["eventname"]] if index_by_name["eventname"] < len(row) else "")
        start_raw = row[index_by_name["startdate"]] if index_by_name["startdate"] < len(row) else None
        end_raw = row[index_by_name["enddate"]] if index_by_name["enddate"] < len(row) else None
        event_type = _to_text(row[index_by_name["eventtype"]] if index_by_name["eventtype"] < len(row) else "")

        if not event_name:
            continue

        start_date = _parse_calendar_date(start_raw)
        end_date = _parse_calendar_date(end_raw) or start_date
        if not start_date or not end_date:
            continue
        if end_date < start_date:
            start_date, end_date = end_date, start_date

        bucket = _holiday_bucket_for_type(event_type)
        pointer = start_date
        while pointer <= end_date:
            date_text = pointer.strftime("%d-%m-%Y")
            all_dates.append(pointer)
            target = optional_holidays if bucket == "optional" else holidays
            target.append({"label": event_name, "date": date_text})
            pointer += timedelta(days=1)

    resolved_year = None
    if year_hint:
        try:
            resolved_year = int(year_hint)
        except Exception:
            resolved_year = None
    if resolved_year is None and all_dates:
        resolved_year = all_dates[0].year
    if resolved_year is None:
        resolved_year = datetime.now().year

    normalized_holidays = _normalize_holiday_items(holidays)
    normalized_optional = _normalize_holiday_items(optional_holidays)
    sundays = _merge_sundays(resolved_year, [])

    return {
        "year": resolved_year,
        "title": f"Academic Calendar {resolved_year}",
        "source_filename": _to_text(source_filename),
        "raw_text": "",
        "holidays": normalized_holidays,
        "optional_holidays": normalized_optional,
        "sundays": sundays,
        "notes": "Imported from Excel",
        "status": "draft",
    }


def _resolved_department_id(user: dict, provided_department_id=None):
    # Academic calendar is global and shared across all departments.
    return None


def _calendar_payload(calendar_doc):
    payload = serialize_calendar(calendar_doc) or {}
    holidays = payload.get("holidays") or []
    optional_holidays = payload.get("optional_holidays") or []
    return {
        **payload,
        "holidays": holidays,
        "optional_holidays": optional_holidays,
        "holiday_count": len(holidays),
        "optional_holiday_count": len(optional_holidays),
    }


@calendar_bp.route("/extract", methods=["POST"])
@role_required("super_admin", "department_admin")
def extract_calendar(user):
    """Extract academic calendar data from an uploaded image via OCR."""
    file = request.files.get("image") or request.files.get("calendar_image")
    if not file or not file.filename:
        return jsonify({"error": "Calendar image is required"}), 400

    resolved_department_id = _resolved_department_id(user)
    json_body = request.get_json(silent=True) or {}
    year_hint = request.form.get("year") or json_body.get("year")
    try:
        draft = extract_calendar_draft(
            file_bytes=file.read(),
            filename=file.filename,
            year_hint=_to_year(year_hint),
        )
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception:
        return jsonify({"error": "Failed to extract calendar text from image"}), 500

    draft["department_id"] = str(resolved_department_id or "")
    draft["uploaded_by"] = str(user.get("_id") or "")
    draft["status"] = "draft"
    return jsonify(draft)


@calendar_bp.route("/extract-excel", methods=["POST"])
@role_required("super_admin", "department_admin")
def extract_calendar_excel(user):
    """Extract holiday data from an uploaded Excel (.xlsx) file."""
    uploaded = request.files.get("file") or request.files.get("excel")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Holiday Excel file is required"}), 400
    if not uploaded.filename.lower().endswith((".xlsx", ".xlsm", ".xltx")):
        return jsonify({"error": "Unsupported file type. Please upload .xlsx, .xlsm or .xltx"}), 400

    year_hint = _to_year(request.form.get("year"))
    try:
        draft = _extract_calendar_draft_from_excel(
            file_bytes=uploaded.read(),
            year_hint=year_hint,
            source_filename=uploaded.filename,
        )
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        return jsonify({"error": "Failed to extract calendar data from Excel"}), 500

    draft["department_id"] = ""
    draft["uploaded_by"] = str(user.get("_id") or "")
    draft["status"] = "draft"
    return jsonify(draft)


@calendar_bp.route("/save", methods=["POST"])
@role_required("super_admin", "department_admin")
def save_calendar(user):
    """Publish an academic calendar with holidays, optional holidays, and auto-detected Sundays."""
    data = request.get_json(silent=True) or {}
    resolved_department_id = _resolved_department_id(user)

    year = _to_year(data.get("year"))
    if not year:
        return jsonify({"error": "Calendar year is required"}), 400

    holidays = data.get("holidays") or []
    optional_holidays = data.get("optional_holidays") or []
    if not isinstance(holidays, list) or not isinstance(optional_holidays, list):
        return jsonify({"error": "Holiday payload must be a list"}), 400

    normalized_holidays = _normalize_holiday_items(holidays)
    normalized_optional = _normalize_holiday_items(optional_holidays)
    merged_sundays = _merge_sundays(year, data.get("sundays") or [])

    archive_existing_calendars(department_id=resolved_department_id, year=year)
    calendar_doc = create_calendar(
        {
            "department_id": resolved_department_id,
            "year": year,
            "title": _to_text(data.get("title")) or f"Academic Calendar {year}",
            "source_filename": _to_text(data.get("source_filename")),
            "raw_text": _to_text(data.get("raw_text")),
            "holidays": normalized_holidays,
            "optional_holidays": normalized_optional,
            "sundays": merged_sundays,
            "notes": _to_text(data.get("notes")),
            "status": "published",
            "published_at": datetime.now(timezone.utc),
            "created_by": user.get("_id"),
            "verified_by": user.get("_id"),
            "verified_at": datetime.now(timezone.utc),
        }
    )

    return jsonify({"message": "Calendar published successfully", "calendar": _calendar_payload(calendar_doc)})


@calendar_bp.route("/current", methods=["GET"])
@jwt_required()
def current_calendar():
    """Fetch the currently published academic calendar for a given year."""
    find_user_by_email(get_jwt_identity())
    year = request.args.get("year")

    calendar_doc = get_current_calendar(department_id=None, year=year)
    return jsonify({"calendar": _calendar_payload(calendar_doc) if calendar_doc else None})


@calendar_bp.route("", methods=["GET"])
@role_required("super_admin", "department_admin")
def list_calendar_records(user):
    """List all calendar records with optional year and status filters."""
    year = request.args.get("year")
    status = request.args.get("status")

    items = [
        _calendar_payload(item)
        for item in list_calendars(department_id=None, year=year, status=status)
    ]
    return jsonify({"items": items})
