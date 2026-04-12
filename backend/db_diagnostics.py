"""Database diagnostics for the Biometric Attendance project.

Usage:
    python db_diagnostics.py

What it checks:
- Database document counts by domain collection
- Presence of key indexes on critical collections
"""

from __future__ import annotations

from collections import OrderedDict
from flask import Flask
from pymongo import MongoClient

from app.config import Config
from app import _ensure_indexes
from app.extensions import get_collection

EXPECTED_INDEXES = OrderedDict(
    {
        ("auth", "users"): {"uq_users_email", "ix_users_role"},
        ("academic", "courses"): {"uq_courses_code"},
        ("academic", "papers"): {"uq_papers_code", "ix_papers_course", "ix_papers_lecturers"},
        ("academic", "student_profiles"): {"uq_profiles_user", "uq_profiles_reg", "ix_profiles_course", "ix_profiles_year"},
        ("attendance", "attendance_logs"): {"uq_attendance_session_paper_student", "ix_attendance_timestamp", "ix_attendance_paper_student"},
        ("attendance", "attendance_sessions"): {"uq_sessions_id", "ix_sessions_lecturer_created", "ix_sessions_rollback_until"},
        ("attendance", "active_sessions"): {
            "uq_active_sessions_id",
            "ix_active_sessions_lecturer_updated",
            "ix_active_sessions_expires_at",
        },
        ("attendance", "background_jobs"): {"uq_jobs_id", "ix_jobs_status_created", "ix_jobs_status_next_attempt", "ix_jobs_updated"},
        ("attendance", "schema_migrations"): {"uq_schema_migrations_id", "ix_schema_migrations_applied_at"},
        ("attendance", "exam_eligibility_overrides"): {"uq_overrides_student_paper"},
        ("audit", "audit_logs"): {"ix_audit_timestamp", "ix_audit_action"},
    }
)

COUNT_TARGETS = [
    ("auth", "users"),
    ("academic", "courses"),
    ("academic", "papers"),
    ("academic", "student_profiles"),
    ("attendance", "attendance_logs"),
    ("attendance", "attendance_sessions"),
    ("attendance", "active_sessions"),
    ("attendance", "background_jobs"),
    ("attendance", "schema_migrations"),
    ("attendance", "exam_eligibility_overrides"),
    ("audit", "audit_logs"),
]


def main() -> int:
    app = Flask(__name__)
    app.config.from_object(Config)
    from app.extensions import mongo
    mongo.cx = MongoClient(app.config["MONGO_URI"])
    with app.app_context():
        _ensure_indexes(mongo, app.config)
        print("Database counts:")
        for alias, collection_name in COUNT_TARGETS:
            collection = get_collection(alias, collection_name)
            print(f"- {alias}.{collection_name}: {collection.count_documents({})}")

        print("\nIndex check:")
        problems = []
        for alias, collection_name in EXPECTED_INDEXES:
            collection = get_collection(alias, collection_name)
            actual = set(collection.index_information().keys())
            expected = EXPECTED_INDEXES[(alias, collection_name)]
            missing = sorted(expected - actual)
            if missing:
                problems.append((alias, collection_name, missing))
                print(f"- {alias}.{collection_name}: missing {', '.join(missing)}")
            else:
                print(f"- {alias}.{collection_name}: OK")

        if problems:
            print("\nDiagnostics finished with issues.")
            return 1

        print("\nDiagnostics finished successfully.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
