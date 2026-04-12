from __future__ import annotations

import time
from datetime import datetime

from app.extensions import get_collection
from migrations import MIGRATIONS


def _history_collection():
    col = get_collection("attendance", "schema_migrations")
    col.create_index("migration_id", unique=True, name="uq_schema_migrations_id")
    col.create_index([("applied_at", -1)], name="ix_schema_migrations_applied_at")
    return col


def list_migrations():
    return sorted(MIGRATIONS, key=lambda m: m.migration_id)


def get_applied_migrations():
    rows = list(_history_collection().find({}, {"_id": 0, "migration_id": 1, "name": 1, "applied_at": 1}))
    return {str(r.get("migration_id")): r for r in rows}


def migration_status():
    applied = get_applied_migrations()
    items = []
    for m in list_migrations():
        row = applied.get(m.migration_id)
        items.append(
            {
                "migration_id": m.migration_id,
                "name": m.name,
                "applied": bool(row),
                "applied_at": row.get("applied_at") if row else None,
            }
        )
    return items


def apply_pending(target_migration_id=None):
    applied = get_applied_migrations()
    history = _history_collection()
    executed = []

    for migration in list_migrations():
        if migration.migration_id in applied:
            if target_migration_id and migration.migration_id == target_migration_id:
                break
            continue

        started = time.perf_counter()
        result = migration.upgrade() or {}
        duration_ms = round((time.perf_counter() - started) * 1000, 2)

        history.insert_one(
            {
                "migration_id": migration.migration_id,
                "name": migration.name,
                "applied_at": datetime.utcnow(),
                "duration_ms": duration_ms,
                "result": result,
            }
        )

        executed.append(
            {
                "migration_id": migration.migration_id,
                "name": migration.name,
                "duration_ms": duration_ms,
                "result": result,
            }
        )

        if target_migration_id and migration.migration_id == target_migration_id:
            break

    return executed
