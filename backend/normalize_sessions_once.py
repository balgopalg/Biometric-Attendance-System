from flask import Flask
from pymongo import MongoClient

from app.config import Config
from app.extensions import mongo
from migrations.runner import apply_pending, migration_status


def main():
    app = Flask(__name__)
    app.config.from_object(Config)
    mongo.cx = MongoClient(app.config["MONGO_URI"])
    with app.app_context():
        target = "20260413_001"
        status_rows = migration_status()
        target_row = next((row for row in status_rows if row["migration_id"] == target), None)

        if target_row and target_row.get("applied"):
            print(
                "Migration 20260413_001 already applied. "
                "Use 'python migrate.py status' for tracked migration history."
            )
            return

        executed = apply_pending(target_migration_id=target)
        applied = next((row for row in executed if row["migration_id"] == target), None)
        if not applied:
            print("No migration applied. Use 'python migrate.py status' for details.")
            return

        print(
            "Applied migration 20260413_001 normalize_attendance_sessions "
            f"in {applied['duration_ms']}ms result={applied['result']}"
        )


if __name__ == "__main__":
    main()
