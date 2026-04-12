"""Data lifecycle cleanup utility.

Usage:
    python cleanup_data_lifecycle.py --dry-run
    python cleanup_data_lifecycle.py --apply

What it cleans:
- Stale generated classroom uploads
- Aged dataset folders
- Old trainer artifacts (keeps newest canonical trainer)
- Old backup directories
"""

from __future__ import annotations

import argparse
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path

from app.config import Config


@dataclass
class CleanupTarget:
    name: str
    root: Path
    retention_days: int
    mode: str  # "dirs" or "files"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Cleanup stale generated data based on retention policy")
    parser.add_argument("--apply", action="store_true", help="Apply cleanup changes")
    parser.add_argument("--dry-run", action="store_true", help="Preview cleanup changes (default)")
    return parser.parse_args()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _is_stale(path: Path, cutoff: datetime) -> bool:
    try:
        modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    except Exception:
        return False
    return modified < cutoff


def _delete_path(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink(missing_ok=True)


def _collect_paths(target: CleanupTarget):
    if not target.root.exists():
        return []

    if target.mode == "dirs":
        return [p for p in sorted(target.root.iterdir()) if p.is_dir()]

    return [p for p in sorted(target.root.iterdir()) if p.is_file()]


def _cleanup_target(target: CleanupTarget, apply: bool) -> dict:
    cutoff = _utc_now() - timedelta(days=max(1, int(target.retention_days)))
    scanned = 0
    removed = 0
    removed_paths = []

    for candidate in _collect_paths(target):
        scanned += 1
        if not _is_stale(candidate, cutoff):
            continue

        # Preserve git placeholders and canonical latest trainer file.
        if candidate.name == ".gitkeep":
            continue
        if target.name == "trainer_artifacts" and candidate.name == "face_trainer.keras":
            continue

        removed += 1
        removed_paths.append(str(candidate))
        if apply:
            _delete_path(candidate)

    return {
        "target": target.name,
        "root": str(target.root),
        "retention_days": target.retention_days,
        "scanned": scanned,
        "removed": removed,
        "removed_paths": removed_paths,
    }


def main() -> int:
    args = _parse_args()
    apply = bool(args.apply and not args.dry_run)

    backend_root = Path(__file__).resolve().parent
    targets = [
        CleanupTarget(
            name="generated_uploads",
            root=(backend_root / "uploads"),
            retention_days=Config.UPLOAD_RETENTION_DAYS,
            mode="dirs",
        ),
        CleanupTarget(
            name="dataset_folders",
            root=(backend_root / "dataset"),
            retention_days=Config.DATASET_RETENTION_DAYS,
            mode="dirs",
        ),
        CleanupTarget(
            name="trainer_artifacts",
            root=(backend_root / "trainer"),
            retention_days=Config.TRAINER_ARTIFACT_RETENTION_DAYS,
            mode="files",
        ),
        CleanupTarget(
            name="backups",
            root=(backend_root / "backups"),
            retention_days=Config.BACKUP_RETENTION_DAYS,
            mode="dirs",
        ),
    ]

    print("Data lifecycle cleanup")
    print(f"Mode: {'APPLY' if apply else 'DRY-RUN'}")

    summaries = []
    for target in targets:
        result = _cleanup_target(target, apply=apply)
        summaries.append(result)
        print(
            f"- {result['target']}: scanned={result['scanned']} removed={result['removed']} "
            f"retention_days={result['retention_days']} root={result['root']}"
        )

    total_removed = sum(item["removed"] for item in summaries)
    print(f"Total removed: {total_removed}")

    if not apply:
        print("No data deleted. Re-run with --apply to enforce policy.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
