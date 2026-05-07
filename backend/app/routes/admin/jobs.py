from . import admin_bp
from ._helpers import *

@admin_bp.route("/jobs/<job_id>", methods=["GET"])
@role_required("department_admin")
def get_job_status(user, job_id):
    job = _get_background_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(sanitise_mongo_doc(job))

@admin_bp.route("/jobs/<job_id>/cancel", methods=["POST"])
@role_required("department_admin")
def cancel_background_job(user, job_id):
    job = _get_background_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    status = _as_text(job.get("status")).lower()
    if status in {"completed", "dead_letter", "cancelled"}:
        return jsonify({"error": f"Cannot cancel job in '{status}' state"}), 400

    now = _utcnow()
    if status == "queued":
        _update_background_job(
            job_id,
            status="cancelled",
            cancel_requested=True,
            cancelled_at=now,
            finished_at=now,
            training_stage="cancelled",
            training_message="Cancelled by user",
        )
    else:
        _update_background_job(
            job_id,
            cancel_requested=True,
            training_stage="cancelling",
            training_message="Cancellation requested",
        )

    log_action(
        "CANCEL_BACKGROUND_JOB",
        str(user["_id"]),
        details=f"job_id={job_id}, previous_status={status}",
    )

    updated = _get_background_job(job_id)
    return jsonify(
        {
            "message": "Cancellation requested",
            "job": sanitise_mongo_doc(updated) if updated else {"job_id": job_id},
        }
    ), 202


@admin_bp.route("/jobs/<job_id>/replay", methods=["POST"])
@role_required("department_admin")
def replay_dead_letter_job(user, job_id):
    jobs = get_collection("attendance", "background_jobs")
    job = jobs.find_one({"job_id": job_id})
    if not job:
        return jsonify({"error": "Job not found"}), 404

    status = _as_text(job.get("status")).lower()
    if status != "dead_letter":
        return jsonify({"error": "Only dead-letter jobs can be replayed"}), 400

    if not _requeue_dead_letter_job_by_id(job_id):
        return jsonify({"error": "Job replay failed due to concurrent update"}), 409

    log_action(
        "REPLAY_DEAD_LETTER_JOB",
        str(user["_id"]),
        details=f"job_id={job_id}, job_type={_as_text(job.get('job_type'))}",
    )

    return jsonify(
        {
            "message": "Job replay queued",
            "job_id": job_id,
            "status_url": f"/api/admin/jobs/{job_id}",
        }
    ), 202


def _requeue_dead_letter_job_by_id(job_id):
    jobs = get_collection("attendance", "background_jobs")
    now = _utcnow()
    updated = jobs.update_one(
        {"job_id": job_id, "status": "dead_letter"},
        {
            "$set": {
                "status": "queued",
                "attempts": 0,
                "error": None,
                "next_attempt_at": now,
                "updated_at": now,
                "started_at": None,
                "finished_at": None,
                "retry_count": 0,
                "retry_in_seconds": None,
                "last_error_at": None,
                "dead_lettered_at": None,
            }
        },
    )
    if not updated.modified_count:
        return False

    try:
        enqueued = _enqueue_background_job(job_id)
    except Exception:
        current_app.logger.exception("Replay enqueue failed for job %s", job_id)
        enqueued = False

    if not enqueued:
        _schedule_local_retry(job_id, 1)

    return True


def _fetch_dead_letter_rows(filters=None, include_pagination=True):
    filters = filters or {}
    q = _as_text(filters.get("q", "")).lower()
    job_type = _as_text(filters.get("job_type", "")).lower()
    from_raw = _as_text(filters.get("from", ""))
    to_raw = _as_text(filters.get("to", ""))
    sort_by = _as_text(filters.get("sort_by", "updated_at")).lower()
    sort_dir = _as_text(filters.get("sort_dir", "desc")).lower()
    tz_offset_minutes = _to_int(filters.get("tz_offset_minutes", 0), 0)

    allowed_sort_by = {"updated_at", "created_at", "attempts", "job_type"}
    if sort_by not in allowed_sort_by:
        raise ValueError("Invalid sort_by value")
    if sort_dir not in {"asc", "desc"}:
        raise ValueError("Invalid sort_dir value")

    query = {"status": "dead_letter"}
    if job_type:
        query["job_type"] = job_type

    ts_filter = {}
    from_local = _parse_iso_date(from_raw)
    to_local = _parse_iso_date(to_raw)
    if from_raw and not from_local:
        raise ValueError("Invalid from date format")
    if to_raw and not to_local:
        raise ValueError("Invalid to date format")

    if from_local:
        ts_filter["$gte"] = _local_midnight_to_utc(from_local, tz_offset_minutes)
    if to_local:
        to_local_exclusive = to_local + timedelta(days=1)
        ts_filter["$lt"] = _local_midnight_to_utc(to_local_exclusive, tz_offset_minutes)
    if ts_filter:
        query["updated_at"] = ts_filter

    sort_order = -1 if sort_dir == "desc" else 1
    jobs = get_collection("attendance", "background_jobs")
    rows = list(
        jobs.find(
            query,
            {
                "_id": 0,
                "job_id": 1,
                "job_type": 1,
                "error": 1,
                "payload": 1,
                "attempts": 1,
                "max_attempts": 1,
                "retry_count": 1,
                "last_error_at": 1,
                "dead_lettered_at": 1,
                "error_history": 1,
                "created_at": 1,
                "updated_at": 1,
            },
        ).sort(sort_by, sort_order)
    )

    if q:
        filtered = []
        for row in rows:
            if (
                q in _as_text(row.get("job_id")).lower()
                or q in _as_text(row.get("job_type")).lower()
                or q in _as_text(row.get("error")).lower()
            ):
                filtered.append(row)
        rows = filtered

    if not include_pagination:
        return rows, len(rows)

    page = max(1, _to_int(filters.get("page", 1), 1))
    per_page = max(1, min(_to_int(filters.get("per_page", 20), 20), 100))
    total = len(rows)
    start = (page - 1) * per_page
    end = start + per_page
    return rows[start:end], total


@admin_bp.route("/jobs/dead-letter", methods=["GET"])
@role_required("department_admin")
def list_dead_letter_jobs(user):
    filters = {
        "q": request.args.get("q", ""),
        "job_type": request.args.get("job_type", ""),
        "from": request.args.get("from", ""),
        "to": request.args.get("to", ""),
        "sort_by": request.args.get("sort_by", "updated_at"),
        "sort_dir": request.args.get("sort_dir", "desc"),
        "tz_offset_minutes": request.args.get("tz_offset_minutes", 0),
        "page": request.args.get("page", 1),
        "per_page": request.args.get("per_page", 20),
    }
    try:
        rows, total = _fetch_dead_letter_rows(filters, include_pagination=True)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    page = max(1, _to_int(filters.get("page", 1), 1))
    per_page = max(1, min(_to_int(filters.get("per_page", 20), 20), 100))
    return jsonify(
        {
            "items": sanitise_many(rows),
            "total": total,
            "page": page,
            "per_page": per_page,
        }
    )


@admin_bp.route("/jobs/dead-letter/replay-bulk", methods=["POST"])
@role_required("department_admin")
def replay_dead_letter_jobs_bulk(user):
    d = request.get_json(silent=True) or {}
    raw_ids = d.get("job_ids") or []
    job_ids = [_as_text(x) for x in raw_ids if _as_text(x)]
    if not job_ids:
        return jsonify({"error": "job_ids is required"}), 400

    replayed = 0
    skipped = 0
    for job_id in job_ids:
        if _requeue_dead_letter_job_by_id(job_id):
            replayed += 1
        else:
            skipped += 1

    log_action(
        "REPLAY_DEAD_LETTER_JOB_BULK",
        str(user["_id"]),
        details=f"requested={len(job_ids)}, replayed={replayed}, skipped={skipped}",
    )

    return jsonify(
        {
            "message": "Bulk dead-letter replay processed",
            "requested": len(job_ids),
            "replayed": replayed,
            "skipped": skipped,
        }
    ), 200


@admin_bp.route("/jobs/dead-letter/replay-filtered", methods=["POST"])
@role_required("department_admin")
def replay_dead_letter_jobs_filtered(user):
    d = request.get_json(silent=True) or {}
    filters = {
        "q": d.get("q", ""),
        "job_type": d.get("job_type", ""),
        "from": d.get("from", ""),
        "to": d.get("to", ""),
        "sort_by": d.get("sort_by", "updated_at"),
        "sort_dir": d.get("sort_dir", "desc"),
        "tz_offset_minutes": d.get("tz_offset_minutes", 0),
    }
    limit = max(1, min(_to_int(d.get("limit", 500), 500), 1000))

    try:
        rows, total_matched = _fetch_dead_letter_rows(filters, include_pagination=False)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    replayed = 0
    skipped = 0
    requested_rows = rows[:limit]
    for row in requested_rows:
        job_id = _as_text(row.get("job_id"))
        if not job_id:
            skipped += 1
            continue
        if _requeue_dead_letter_job_by_id(job_id):
            replayed += 1
        else:
            skipped += 1

    log_action(
        "REPLAY_DEAD_LETTER_JOB_FILTERED",
        str(user["_id"]),
        details=(
            f"matched={total_matched}, limit={limit}, requested={len(requested_rows)}, "
            f"replayed={replayed}, skipped={skipped}"
        ),
    )

    return jsonify(
        {
            "message": "Filtered dead-letter replay processed",
            "matched": total_matched,
            "limit": limit,
            "requested": len(requested_rows),
            "replayed": replayed,
            "skipped": skipped,
        }
    ), 200


@admin_bp.route("/jobs/metrics", methods=["GET"])
@role_required("department_admin")
def get_job_metrics(user):
    jobs = get_collection("attendance", "background_jobs")
    summary = {
        "queued": 0,
        "running": 0,
        "completed": 0,
        "dead_letter": 0,
    }

    for row in jobs.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]):
        status = _as_text(row.get("_id")).lower()
        if status in summary:
            summary[status] = int(row.get("count", 0) or 0)

    queue_depth = None
    delayed_queue_depth = None
    due_delayed_count = None
    client = _get_task_queue_client()
    if client is not None:
        try:
            queue_name, delayed_queue_name = _get_queue_names()
            queue_depth = int(client.llen(queue_name) or 0)
            delayed_queue_depth = int(client.zcard(delayed_queue_name) or 0)
            due_delayed_count = int(client.zcount(delayed_queue_name, 0, int(time.time())) or 0)
        except Exception:
            current_app.logger.exception("Unable to read queue metrics")

    running_timeout_seconds = max(30, _to_int(current_app.config.get("TASK_QUEUE_RUNNING_TIMEOUT_SECONDS", 900), 900))
    stale_cutoff = _utcnow() - timedelta(seconds=running_timeout_seconds)
    stale_running_count = int(
        jobs.count_documents({"status": "running", "updated_at": {"$lte": stale_cutoff}})
    )
    queued_retry_count = int(
        jobs.count_documents({
            "status": "queued",
            "retry_count": {"$gt": 0},
            "next_attempt_at": {"$ne": None},
        })
    )
    next_retry_candidates = list(
        jobs.find(
            {
                "status": "queued",
                "retry_count": {"$gt": 0},
                "next_attempt_at": {"$ne": None},
            },
            {
                "_id": 0,
                "job_id": 1,
                "job_type": 1,
                "next_attempt_at": 1,
                "retry_count": 1,
                "error": 1,
            },
        )
    )
    next_retry_candidates.sort(key=lambda row: row.get("next_attempt_at") or datetime.max)
    next_retry_job = next_retry_candidates[0] if next_retry_candidates else None
    dead_letter_last_24h = int(
        jobs.count_documents({"status": "dead_letter", "updated_at": {"$gte": _utcnow() - timedelta(hours=24)}})
    )
    recent_dead_letter_jobs = sanitise_many(
        list(
            jobs.find(
                {"status": "dead_letter"},
                {
                    "_id": 0,
                    "job_id": 1,
                    "job_type": 1,
                    "error": 1,
                    "updated_at": 1,
                    "attempts": 1,
                    "max_attempts": 1,
                },
            )
            .sort("updated_at", -1)
            .limit(5)
        )
    )

    return jsonify(
        {
            "jobs": {
                "total": int(sum(summary.values())),
                **summary,
                "stale_running": stale_running_count,
                "queued_retries": queued_retry_count,
                "next_retry_job": sanitise_mongo_doc(next_retry_job) if next_retry_job else None,
                "dead_letter_last_24h": dead_letter_last_24h,
                "recent_dead_letter_jobs": recent_dead_letter_jobs,
            },
            "queue": {
                "enabled": bool(current_app.config.get("TASK_QUEUE_ENABLED", False)),
                "depth": queue_depth,
                "delayed_depth": delayed_queue_depth,
                "due_delayed": due_delayed_count,
                "running_timeout_seconds": running_timeout_seconds,
            },
        }
    )


