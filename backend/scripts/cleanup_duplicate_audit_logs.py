#!/usr/bin/env python
"""One-time cleanup for duplicate biometric read audit logs.

By default this runs in dry-run mode and prints how many records would be
removed. Use --apply to actually delete duplicate rows.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import timedelta

from pymongo import MongoClient

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.config import Config


DEDUPED_ACTIONS = {
    "student_profile_read",
    "student_profile_read_by_id",
    "student_profiles_bulk_read",
}


def _normalize_details(details):
    data = details if isinstance(details, dict) else {}
    return {
        "path": str(data.get("path") or ""),
        "method": str(data.get("method") or ""),
        "remote_addr": str(data.get("remote_addr") or ""),
    }


def _dedupe_key(doc):
    details = _normalize_details(doc.get("details"))
    return (
        str(doc.get("action") or ""),
        str(doc.get("performed_by") or "system"),
        str(doc.get("target_user") or ""),
        str(doc.get("ip_address") or details["remote_addr"]),
        details["path"],
        details["method"],
    )


def find_duplicate_ids(window_seconds: int):
    client = MongoClient(Config.MONGO_URI)
    logs = client[Config.MONGO_DB_AUDIT]["audit_logs"]

    cursor = logs.find(
        {"action": {"$in": sorted(DEDUPED_ACTIONS)}},
        {
            "action": 1,
            "performed_by": 1,
            "target_user": 1,
            "details": 1,
            "ip_address": 1,
            "timestamp": 1,
        },
    ).sort("timestamp", 1)

    duplicates = []
    last_seen = {}
    window = timedelta(seconds=max(1, int(window_seconds)))

    for doc in cursor:
        ts = doc.get("timestamp")
        if ts is None:
            continue

        key = _dedupe_key(doc)
        previous_ts = last_seen.get(key)
        if previous_ts is not None and (ts - previous_ts) <= window:
            duplicates.append(doc["_id"])
            continue

        last_seen[key] = ts

    return duplicates


def main():
    parser = argparse.ArgumentParser(description="Cleanup duplicate biometric read audit logs")
    parser.add_argument("--window-seconds", type=int, default=3, help="Deduplication window in seconds")
    parser.add_argument("--apply", action="store_true", help="Delete duplicates (default is dry-run)")
    args = parser.parse_args()

    duplicates = find_duplicate_ids(args.window_seconds)
    total = len(duplicates)

    if not args.apply:
        print(f"[DRY-RUN] Duplicate audit rows found: {total}")
        if total:
            print("Run with --apply to delete these rows.")
        return 0

    if not duplicates:
        print("No duplicate audit rows found. Nothing to delete.")
        return 0

    client = MongoClient(Config.MONGO_URI)
    logs = client[Config.MONGO_DB_AUDIT]["audit_logs"]
    result = logs.delete_many({"_id": {"$in": duplicates}})
    print(f"Deleted duplicate audit rows: {int(result.deleted_count)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
