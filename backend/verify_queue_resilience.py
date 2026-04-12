"""Queue resilience diagnostics for Redis-backed background jobs.

Usage:
    python verify_queue_resilience.py

What it validates:
- Running jobs abandoned by a dead worker are recovered back to queued state.
- Delayed jobs are promoted into the live queue when due (Redis mode only).
"""

from __future__ import annotations

import time
from datetime import timedelta

from flask import Flask
from pymongo import MongoClient

from app.config import Config
from app.extensions import mongo
from app.extensions import get_collection
from app.routes import admin as admin_routes


def _create_stale_running_job():
    jobs = get_collection("attendance", "background_jobs")
    now = admin_routes._utcnow()
    timeout_seconds = max(
        30,
        admin_routes._to_int(
            admin_routes.current_app.config.get("TASK_QUEUE_RUNNING_TIMEOUT_SECONDS", 900),
            900,
        ),
    )
    stale_updated_at = now - timedelta(seconds=timeout_seconds + 30)
    job_id = f"diag-stale-{int(time.time())}"
    jobs.insert_one(
        {
            "job_id": job_id,
            "job_type": "unsupported_diagnostic",
            "status": "running",
            "created_at": now,
            "updated_at": stale_updated_at,
            "next_attempt_at": None,
            "attempts": 1,
            "max_attempts": 3,
            "payload": {},
            "retry_count": 0,
            "retry_in_seconds": None,
            "last_error_at": None,
            "dead_lettered_at": None,
            "error_history": [],
            "cancel_requested": False,
            "cancelled_at": None,
            "training_total_faces": 0,
            "training_processed_faces": 0,
            "training_trained_faces": 0,
            "training_failed_faces": 0,
            "training_stage": "running",
            "training_message": "Diagnostics",
            "training_progress_percent": 0,
        }
    )
    return job_id


def _validate_stale_recovery():
    jobs = get_collection("attendance", "background_jobs")
    job_id = _create_stale_running_job()
    recovered = admin_routes.recover_stuck_background_jobs(max_items=50)
    row = jobs.find_one({"job_id": job_id}) or {}

    ok = bool(recovered >= 1 and str(row.get("status", "")).lower() == "queued")
    print(f"- stale running recovery: {'OK' if ok else 'FAILED'} (job_id={job_id}, recovered={recovered}, status={row.get('status')})")

    jobs.delete_one({"job_id": job_id})
    return ok


def _validate_delayed_promotion():
    client = admin_routes._get_task_queue_client()
    if client is None:
        print("- delayed promotion: SKIPPED (Redis queue not configured/reachable)")
        return True

    queue_name, delayed_queue_name = admin_routes._get_queue_names()
    job_id = f"diag-delayed-{int(time.time())}"

    client.lrem(queue_name, 0, job_id)
    client.zrem(delayed_queue_name, job_id)

    client.zadd(delayed_queue_name, {job_id: int(time.time()) - 5})
    moved = admin_routes.promote_due_delayed_jobs(max_items=20)

    queue_depth = int(client.llen(queue_name) or 0)
    in_queue = bool(client.lpos(queue_name, job_id) is not None)
    still_delayed = bool(client.zscore(delayed_queue_name, job_id) is not None)
    ok = bool(moved >= 1 and in_queue and not still_delayed)

    print(
        "- delayed promotion: "
        f"{'OK' if ok else 'FAILED'} "
        f"(job_id={job_id}, moved={moved}, queue_depth={queue_depth}, still_delayed={still_delayed})"
    )

    client.lrem(queue_name, 0, job_id)
    client.zrem(delayed_queue_name, job_id)
    return ok


def main() -> int:
    app = Flask(__name__)
    app.config.from_object(Config)
    mongo.cx = MongoClient(app.config["MONGO_URI"])

    with app.app_context():
        print("Queue resilience diagnostics:")
        stale_ok = _validate_stale_recovery()
        delayed_ok = _validate_delayed_promotion()

        all_ok = stale_ok and delayed_ok
        print("\nResult:", "PASS" if all_ok else "FAIL")
        return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
