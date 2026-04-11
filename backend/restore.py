"""MongoDB restore utility from JSONL backups created by backup.py."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from bson import json_util

from app import create_app
from app.extensions import mongo


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Restore MongoDB collections from backup JSONL")
    parser.add_argument("--input-dir", required=True, help="Backup directory containing manifest.json")
    parser.add_argument("--drop-existing", action="store_true", help="Drop target collections before restore")
    parser.add_argument("--yes", action="store_true", help="Confirm restore when --drop-existing is used")
    parser.add_argument("--dry-run", action="store_true", help="Show restore plan without writing data")
    return parser.parse_args()


def _load_manifest(root: Path) -> dict:
    manifest_path = root / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest.json not found in {root}")
    with manifest_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    args = parse_args()
    root = Path(args.input_dir)
    manifest = _load_manifest(root)

    if args.drop_existing and not args.yes and not args.dry_run:
        print("Refusing to drop existing data without --yes")
        return

    app = create_app(seed_default_admin=False)

    with app.app_context():
        for entry in manifest.get("files", []):
            db_name = entry.get("database")
            collection_name = entry.get("collection")
            rel_path = entry.get("path")
            src_path = root / rel_path

            if not src_path.exists():
                print(f"[WARN] Missing file: {src_path}")
                continue

            collection = mongo.cx[db_name][collection_name]

            if args.drop_existing:
                if args.dry_run:
                    print(f"[dry-run] would drop {db_name}.{collection_name}")
                else:
                    collection.drop()
                    print(f"Dropped {db_name}.{collection_name}")

            docs = []
            with src_path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    line = line.strip()
                    if not line:
                        continue
                    docs.append(json_util.loads(line))

            if args.dry_run:
                print(f"[dry-run] would restore {len(docs)} docs into {db_name}.{collection_name}")
                continue

            if docs:
                collection.insert_many(docs, ordered=False)
            print(f"Restored {len(docs)} docs into {db_name}.{collection_name}")


if __name__ == "__main__":
    main()
