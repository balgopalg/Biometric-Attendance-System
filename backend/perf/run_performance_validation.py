"""Performance validation suite for backend critical operations.

Coverage:
1) Bulk admin operations load test
2) Face recognition and training endpoint benchmarks
3) Large attendance export performance checks

Run:
    python perf/run_performance_validation.py
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import os
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path
from statistics import median

from bson import ObjectId

_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from app import create_app
from app.extensions import get_collection
from app.models.user import create_user

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2s4WQAAAAASUVORK5CYII="
)


@dataclass
class Sample:
    name: str
    ms: float
    ok: bool
    detail: str = ""


def _now_ms():
    return time.perf_counter() * 1000.0


def _elapsed_ms(start_ms: float) -> float:
    return round(_now_ms() - start_ms, 2)


def _safe_json(resp):
    try:
        return resp.get_json(silent=True)
    except Exception:
        return None


def _csrf_headers(client):
    cookie = client.get_cookie("csrf_access_token")
    if not cookie:
        return {}
    return {"X-CSRF-TOKEN": cookie.value}


def _login(client, email="admin@system.com", password="admin123"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        raise RuntimeError(f"Login failed: {r.status_code} {_safe_json(r)}")


def _discover_default_fixture_path() -> str | None:
    uploads_dir = os.path.join(_BACKEND_ROOT, "uploads")
    if not os.path.isdir(uploads_dir):
        return None

    preferred = sorted(Path(uploads_dir).rglob("original.jpg"))
    if preferred:
        return str(preferred[0])

    fallback = sorted(p for p in Path(uploads_dir).rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
    if fallback:
        return str(fallback[0])

    return None


def _resolve_fixture_bytes(explicit_fixture_path: str | None) -> tuple[bytes, str, str]:
    fixture_path = explicit_fixture_path or _discover_default_fixture_path()
    if fixture_path and os.path.isfile(fixture_path):
        with open(fixture_path, "rb") as f:
            image_bytes = f.read()
        return image_bytes, os.path.basename(fixture_path), fixture_path
    return PNG_1X1, "synthetic_1x1.png", "embedded_synthetic"


def _frame_data_url(image_bytes: bytes, file_name: str) -> str:
    ext = Path(file_name).suffix.lower()
    mime = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }.get(ext, "image/jpeg")
    return f"data:{mime};base64," + base64.b64encode(image_bytes).decode("ascii")


def _ensure_perf_lecturer_for_paper(paper_id: str):
    users = get_collection("auth", "users")
    papers = get_collection("academic", "papers")

    email = "perf.lecturer@example.com"
    password = "PerfLecturer123"
    lecturer = users.find_one({"email": email})
    if not lecturer:
        created = create_user(
            name="Performance Lecturer",
            email=email,
            password=password,
            role="lecturer",
            department="Computing",
        )
        lecturer_id = str(created.get("_id"))
    else:
        lecturer_id = str(lecturer.get("_id"))

    if ObjectId.is_valid(paper_id):
        papers.update_one({"_id": ObjectId(paper_id)}, {"$set": {"lecturer_id": lecturer_id}})
    else:
        papers.update_one({"_id": paper_id}, {"$set": {"lecturer_id": lecturer_id}})

    return email, password


def _require_seed_course_and_paper():
    courses = get_collection("academic", "courses")
    papers = get_collection("academic", "papers")

    course = courses.find_one({})
    if not course:
        cid = courses.insert_one(
            {
                "name": "Performance Course",
                "code": "PERF-COURSE",
                "department": "Computing",
                "course_duration": 2,
                "status": "active",
                "year": str(datetime.utcnow().year),
            }
        ).inserted_id
        course = courses.find_one({"_id": cid})

    paper = papers.find_one({"course_id": str(course.get("_id"))}) or papers.find_one({})
    if not paper:
        pid = papers.insert_one(
            {
                "name": "Performance Paper",
                "code": "PERF-101",
                "course_id": str(course.get("_id")),
                "semester": 1,
                "total_classes": 0,
                "lecturer_id": "",
            }
        ).inserted_id
        paper = papers.find_one({"_id": pid})

    return str(course.get("_id")), str(paper.get("_id"))


def _create_bulk_students(client, csrf, course_id: str, count: int, prefix: str):
    created_ids = []
    for i in range(count):
        email = f"{prefix}.student{i}@example.com"
        payload = {
            "name": f"Perf Student {i}",
            "email": email,
            "course_id": course_id,
            "department": "Computing",
        }
        r = client.post("/api/admin/students", json=payload, headers=csrf)
        if r.status_code not in (201, 409):
            raise RuntimeError(f"Create student failed: {r.status_code} {_safe_json(r)}")
        body = _safe_json(r) or {}
        sid = body.get("_id") or body.get("user_id")
        if sid:
            created_ids.append(str(sid))
    return created_ids


def _cleanup_students(student_ids):
    if not student_ids:
        return
    users = get_collection("auth", "users")
    profiles = get_collection("academic", "student_profiles")
    attendance_logs = get_collection("attendance", "attendance_logs")
    attendance_sessions = get_collection("attendance", "attendance_sessions")

    users.delete_many({"_id": {"$in": [ObjectId(s) for s in student_ids if ObjectId.is_valid(s)]}})
    profiles.delete_many({"user_id": {"$in": student_ids}})
    attendance_logs.delete_many({"student_id": {"$in": student_ids}})

    # Sessions are tagged separately in export benchmark; keep cleanup isolated there.
    attendance_sessions.delete_many({"source": "perf-validation-bulk"})


def benchmark_bulk_admin_operations(client, csrf, course_id, paper_id):
    samples = []
    run_id = str(uuid.uuid4())[:8]
    prefix = f"perf{run_id}"

    start = _now_ms()
    student_ids = _create_bulk_students(client, csrf, course_id, count=30, prefix=prefix)
    samples.append(Sample("bulk_create_students_30", _elapsed_ms(start), True, f"created={len(student_ids)}"))

    if student_ids:
        start = _now_ms()
        r = client.post(
            "/api/admin/papers/bulk-assign",
            json={"paper_id": paper_id, "student_ids": student_ids},
            headers=csrf,
        )
        ok = r.status_code == 200
        samples.append(Sample("bulk_assign_paper_to_students", _elapsed_ms(start), ok, str(_safe_json(r))))

        start = _now_ms()
        r2 = client.post(
            "/api/admin/students/bulk-promote",
            json={"student_ids": student_ids, "from_semester": 1},
            headers=csrf,
        )
        ok2 = r2.status_code == 200
        samples.append(Sample("bulk_promote_students", _elapsed_ms(start), ok2, str(_safe_json(r2))))

    _cleanup_students(student_ids)
    return samples


def benchmark_face_endpoints(client, paper_id, fixture_bytes: bytes, fixture_name: str, fixture_source: str):
    samples = []
    lecturer_email, lecturer_password = _ensure_perf_lecturer_for_paper(paper_id)

    # Lecturer-only endpoints must run under a lecturer session.
    _login(client, lecturer_email, lecturer_password)
    lecturer_csrf = _csrf_headers(client)

    start = _now_ms()
    r = client.post("/api/lecturer/session/start", json={"paper_id": paper_id}, headers=lecturer_csrf)
    ok = r.status_code == 200
    body = _safe_json(r) or {}
    session_id = body.get("session_id")
    samples.append(Sample("lecturer_session_start", _elapsed_ms(start), ok, str(body)))

    if session_id:
        # frame benchmark
        frame_b64 = _frame_data_url(fixture_bytes, fixture_name)
        latencies = []
        for _ in range(10):
            t0 = _now_ms()
            rr = client.post(
                "/api/lecturer/session/recognize",
                json={"session_id": session_id, "frame": frame_b64},
                headers=lecturer_csrf,
            )
            latencies.append((_elapsed_ms(t0), rr.status_code == 200))
        ok_all = all(flag for _, flag in latencies)
        median_ms = round(median(ms for ms, _ in latencies), 2)
        samples.append(Sample("lecturer_recognize_frame_x10_median", median_ms, ok_all))

        # image endpoint benchmark
        latencies_img = []
        status_codes = []
        for _ in range(5):
            t1 = _now_ms()
            ri = client.post(
                "/api/lecturer/session/recognize-image",
                data={"session_id": session_id, "image": (BytesIO(fixture_bytes), fixture_name)},
                content_type="multipart/form-data",
                headers=lecturer_csrf,
            )
            status_codes.append(ri.status_code)
            # For this micro-benchmark, accept validation-level rejections (4xx) and fail only on server errors.
            latencies_img.append((_elapsed_ms(t1), ri.status_code < 500))
        ok_img = all(flag for _, flag in latencies_img)
        samples.append(
            Sample(
                "lecturer_recognize_image_x5_median",
                round(median(ms for ms, _ in latencies_img), 2),
                ok_img,
                f"status_codes={status_codes}",
            )
        )
        samples.append(Sample("face_fixture_source", 0.0, True, fixture_source))

        # training queue benchmark (bulk endpoint with async)
        _login(client)
        admin_csrf = _csrf_headers(client)

        students_opts = client.get("/api/admin/students/options", headers=admin_csrf)
        students_body = _safe_json(students_opts) or []
        student_ids = [str(x.get("user_id") or x.get("_id")) for x in students_body[:10] if (x.get("user_id") or x.get("_id"))]
        if student_ids:
            t2 = _now_ms()
            tb = client.post(
                "/api/admin/students/train-face/bulk",
                json={"student_ids": student_ids, "async": True},
                headers=admin_csrf,
            )
            samples.append(Sample("bulk_train_face_queue_request", _elapsed_ms(t2), tb.status_code == 202, str(_safe_json(tb))))

        _login(client, lecturer_email, lecturer_password)
        lecturer_csrf = _csrf_headers(client)
        client.post("/api/lecturer/session/stop", json={"session_id": session_id}, headers=lecturer_csrf)

    return samples


def benchmark_export_large_dataset(client, csrf, course_id, paper_id):
    samples = []
    users = get_collection("auth", "users")
    profiles = get_collection("academic", "student_profiles")
    logs = get_collection("attendance", "attendance_logs")
    sessions = get_collection("attendance", "attendance_sessions")
    papers = get_collection("academic", "papers")

    tag = f"perf-export-{uuid.uuid4().hex[:8]}"
    now = datetime.utcnow()

    # Ensure paper has a lecturer for matrix pipeline stability.
    paper_doc = papers.find_one({"_id": ObjectId(paper_id)}) if ObjectId.is_valid(paper_id) else papers.find_one({"_id": paper_id})
    lecturer_id = str(paper_doc.get("lecturer_id")) if paper_doc and paper_doc.get("lecturer_id") else ""
    if not lecturer_id:
        lecturer = users.find_one({"role": "lecturer"})
        if lecturer:
            lecturer_id = str(lecturer.get("_id"))
            papers.update_one({"_id": paper_doc.get("_id")}, {"$set": {"lecturer_id": lecturer_id}})

    student_ids = []
    session_ids = []

    # Create synthetic students + profiles.
    for i in range(120):
        uid = ObjectId()
        sid = str(uid)
        student_ids.append(sid)
        users.insert_one(
            {
                "_id": uid,
                "name": f"Export Perf Student {i}",
                "email": f"{tag}.{i}@example.com",
                "password_hash": "x",
                "role": "student",
                "department": "Computing",
                "must_change_password": False,
            }
        )
        profiles.insert_one(
            {
                "user_id": sid,
                "course_id": course_id,
                "academic_session": str(now.year),
                "academic_year": str(now.year),
                "year": str(now.year),
                "current_semester": 1,
                "reg_number": f"{tag.upper()}-{i:04d}",
                "roll_number": f"{tag.upper()}-{i:04d}",
                "enrolled_papers": [paper_id],
                "face_embeddings": [],
                "name": f"Export Perf Student {i}",
                "email": f"{tag}.{i}@example.com",
            }
        )

    # Create 30 sessions and logs.
    for d in range(30):
        dt = now - timedelta(days=d)
        sess_id = f"{tag}-sess-{d}"
        session_ids.append(sess_id)
        present_subset = student_ids[: 80 + (d % 40)]
        sessions.insert_one(
            {
                "session_id": sess_id,
                "paper_id": paper_id,
                "lecturer_id": lecturer_id,
                "student_ids": present_subset,
                "academic_session": str(now.year),
                "academic_year": str(now.year),
                "committed_at": dt,
                "rollback_until": dt + timedelta(minutes=30),
                "finalized": True,
                "last_updated_at": dt,
                "source": "perf-validation-export",
            }
        )

        for sid in present_subset:
            logs.insert_one(
                {
                    "paper_id": paper_id,
                    "student_id": sid,
                    "lecturer_id": lecturer_id,
                    "session_id": sess_id,
                    "method": "biometric",
                    "timestamp": dt,
                    "source": "perf-validation-export",
                }
            )

    try:
        params = {"course_id": course_id, "paper_id": paper_id}

        t0 = _now_ms()
        r_json = client.get("/api/admin/attendance-matrix", query_string=params, headers=csrf)
        samples.append(Sample("attendance_matrix_json", _elapsed_ms(t0), r_json.status_code == 200, f"status={r_json.status_code}"))

        t1 = _now_ms()
        r_xlsx = client.get("/api/admin/attendance-matrix/export", query_string=params, headers=csrf)
        samples.append(Sample("attendance_matrix_export_xlsx", _elapsed_ms(t1), r_xlsx.status_code == 200, f"bytes={len(r_xlsx.data)}"))

        t2 = _now_ms()
        r_csv = client.get("/api/admin/attendance-matrix/export-csv", query_string=params, headers=csrf)
        samples.append(Sample("attendance_matrix_export_csv", _elapsed_ms(t2), r_csv.status_code == 200, f"bytes={len(r_csv.data)}"))

    finally:
        logs.delete_many({"source": "perf-validation-export"})
        sessions.delete_many({"source": "perf-validation-export"})
        profiles.delete_many({"email": {"$regex": f"^{tag}"}})
        users.delete_many({"email": {"$regex": f"^{tag}"}})

    return samples


def _print_section(title, samples):
    print(f"\n== {title} ==")
    for s in samples:
        mark = "OK" if s.ok else "FAIL"
        extra = f" | {s.detail}" if s.detail else ""
        print(f"- {s.name}: {s.ms} ms [{mark}]{extra}")


def _write_results_artifacts(all_samples, fixture_source: str):
    results_dir = os.path.join(_BACKEND_ROOT, "perf", "results")
    os.makedirs(results_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_id = str(uuid.uuid4())[:8]
    base_name = f"performance_validation_{ts}_{run_id}"
    json_path = os.path.join(results_dir, base_name + ".json")
    csv_path = os.path.join(results_dir, base_name + ".csv")

    payload = {
        "generated_at": datetime.now().isoformat(),
        "fixture_source": fixture_source,
        "total_checks": len(all_samples),
        "failed_checks": len([s for s in all_samples if not s.ok]),
        "samples": [
            {"name": s.name, "ms": s.ms, "ok": s.ok, "detail": s.detail}
            for s in all_samples
        ],
    }
    with open(json_path, "w", encoding="utf-8") as jf:
        json.dump(payload, jf, indent=2)

    with open(csv_path, "w", newline="", encoding="utf-8") as cf:
        writer = csv.DictWriter(cf, fieldnames=["name", "ms", "ok", "detail"])
        writer.writeheader()
        for s in all_samples:
            writer.writerow({"name": s.name, "ms": s.ms, "ok": s.ok, "detail": s.detail})

    return json_path, csv_path


def _parse_args():
    parser = argparse.ArgumentParser(description="Run backend performance validation suite")
    parser.add_argument(
        "--fixture-image",
        dest="fixture_image",
        default=None,
        help="Optional path to classroom image fixture for recognize-image benchmark.",
    )
    return parser.parse_args()


def main():
    args = _parse_args()
    fixture_bytes, fixture_name, fixture_source = _resolve_fixture_bytes(args.fixture_image)

    app = create_app(seed_default_admin=False)
    with app.app_context():
        client = app.test_client()
        _login(client)
        csrf = _csrf_headers(client)
        course_id, paper_id = _require_seed_course_and_paper()

        bulk_samples = benchmark_bulk_admin_operations(client, csrf, course_id, paper_id)
        face_samples = benchmark_face_endpoints(client, paper_id, fixture_bytes, fixture_name, fixture_source)
        _login(client)
        csrf = _csrf_headers(client)
        export_samples = benchmark_export_large_dataset(client, csrf, course_id, paper_id)

        _print_section("Bulk Admin Operations", bulk_samples)
        _print_section("Face Recognition + Training", face_samples)
        _print_section("Large Attendance Export", export_samples)

        all_samples = bulk_samples + face_samples + export_samples
        failed = [s for s in all_samples if not s.ok]
        json_path, csv_path = _write_results_artifacts(all_samples, fixture_source)
        print("\nSummary:")
        print(f"- total checks: {len(all_samples)}")
        print(f"- failed checks: {len(failed)}")
        print(f"- results_json: {json_path}")
        print(f"- results_csv: {csv_path}")
        if failed:
            return 1
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
