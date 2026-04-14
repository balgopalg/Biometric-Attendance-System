"""Background worker for Redis-backed admin jobs.

Run with:
    python worker.py
"""

import signal
from threading import Event

from app import create_app
from app.routes import admin as admin_routes


def main() -> int:
    app = create_app(seed_default_admin=False)
    stop_requested = Event()

    def _request_shutdown(signum, _frame):
        if not stop_requested.is_set():
            app.logger.info("Received signal %s. Worker will stop after the current job.", signum)
        stop_requested.set()

    signal.signal(signal.SIGTERM, _request_shutdown)
    signal.signal(signal.SIGINT, _request_shutdown)

    with app.app_context():
        client = admin_routes._get_task_queue_client()
        if client is None:
            app.logger.error("Redis queue client unavailable. Check TASK_QUEUE_REDIS_URL and redis dependency.")
            return 1
        queue_name = app.config.get("TASK_QUEUE_NAME", "biometric:jobs")

    app.logger.info("Worker listening on queue: %s", queue_name)

    while not stop_requested.is_set():
        with app.app_context():
            admin_routes.recover_stuck_background_jobs(max_items=100)
            admin_routes.promote_due_delayed_jobs(max_items=200)

        item = client.brpop(queue_name, timeout=5)
        if not item:
            continue

        if stop_requested.is_set():
            break

        _, job_id = item
        job_id = str(job_id or "").strip()
        if not job_id:
            continue

        with app.app_context():
            admin_routes.process_background_job(job_id)

    app.logger.info("Worker shutdown complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
