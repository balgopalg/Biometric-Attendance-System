"""Full reset utility for the Biometric Attendance project.

Usage:
    python delete.py --yes

What it does:
- Drops all project MongoDB databases configured in app Config.
- Clears generated runtime folders (uploads/dataset) from project root and backend.

Safety:
- Requires explicit --yes flag.
"""

from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path

from app import create_app
from app.extensions import mongo


def _clear_directory(path: Path) -> tuple[int, int]:
    """Remove all children under a directory and recreate it.

    Returns:
        (removed_files, removed_dirs)
    """
    removed_files = 0
    removed_dirs = 0

    if not path.exists():
        path.mkdir(parents=True, exist_ok=True)
        return removed_files, removed_dirs

    for child in path.iterdir():
        try:
            if child.is_dir():
                shutil.rmtree(child)
                removed_dirs += 1
            else:
                child.unlink(missing_ok=True)
                removed_files += 1
        except Exception as exc:
            print(f"[WARN] Failed to remove {child}: {exc}")

    path.mkdir(parents=True, exist_ok=True)
    return removed_files, removed_dirs


def _drop_project_databases(app) -> list[str]:
    db_names = [
        app.config["MONGO_DB_AUTH"],
        app.config["MONGO_DB_ACADEMIC"],
        app.config["MONGO_DB_ATTENDANCE"],
        app.config["MONGO_DB_AUDIT"],
    ]

    dropped = []
    for db_name in db_names:
        mongo.cx.drop_database(db_name)
        dropped.append(db_name)
    return dropped


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reset project database and runtime files")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Confirm destructive reset (required)",
    )
    parser.add_argument(
        "--mongo-only",
        action="store_true",
        help="Only drop MongoDB databases; keep local uploads/dataset folders",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not args.yes:
        print("Refusing to run without --yes.")
        print("Example: python delete.py --yes")
        return

    # Disable automatic default-admin seed while running reset.
    app = create_app(seed_default_admin=False)

    with app.app_context():
        dropped_dbs = _drop_project_databases(app)

    print("Dropped MongoDB databases:")
    for name in dropped_dbs:
        print(f"- {name}")

    if args.mongo_only:
        print("Mongo reset complete. Local files were not touched (--mongo-only).")
        return

    backend_dir = Path(__file__).resolve().parent
    project_root = backend_dir.parent

    candidate_dirs = [
        project_root / "uploads",
        project_root / "dataset",
        backend_dir / "uploads",
        backend_dir / "dataset",
        backend_dir / "instance",
    ]

    total_files = 0
    total_dirs = 0
    for folder in candidate_dirs:
        files, dirs = _clear_directory(folder)
        total_files += files
        total_dirs += dirs
        print(f"Cleared: {folder}")

    print("Reset complete.")
    print(f"Removed {total_files} files and {total_dirs} subfolders.")
    print("Next steps:")
    print("1) python seedAdmin.py")
    print("2) python run.py")


if __name__ == "__main__":
    main()
