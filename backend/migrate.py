from __future__ import annotations

import argparse

from flask import Flask
from pymongo import MongoClient

from app.config import Config
from app.extensions import mongo
from migrations.runner import apply_pending, migration_status


def _print_status(items):
    print("Migration status:")
    for item in items:
        state = "APPLIED" if item["applied"] else "PENDING"
        applied_at = item["applied_at"] or "-"
        print(f"- {item['migration_id']} {item['name']}: {state} (applied_at={applied_at})")


def _print_applied(executed):
    if not executed:
        print("No pending migrations.")
        return
    print("Applied migrations:")
    for row in executed:
        print(
            f"- {row['migration_id']} {row['name']} in {row['duration_ms']}ms "
            f"result={row['result']}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run tracked database migrations")
    parser.add_argument("command", choices=["status", "up"], nargs="?", default="up")
    parser.add_argument("--target", dest="target", default=None, help="Apply up to this migration id")
    args = parser.parse_args()

    app = Flask(__name__)
    app.config.from_object(Config)
    mongo.cx = MongoClient(app.config["MONGO_URI"])
    with app.app_context():
        if args.command == "status":
            _print_status(migration_status())
            return 0

        executed = apply_pending(target_migration_id=args.target)
        _print_applied(executed)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
