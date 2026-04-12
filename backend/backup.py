"""MongoDB backup utility (JSONL per collection)."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from bson import json_util
from flask import Flask
from pymongo import MongoClient

from app.config import Config
from app.extensions import mongo


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backup MongoDB collections into JSONL files")
    parser.add_argument("--output-dir", default="backups", help="Base output directory")
    parser.add_argument("--dry-run", action="store_true", help="Show backup plan without writing files")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    app = Flask(__name__)
    app.config.from_object(Config)
    mongo.cx = MongoClient(app.config["MONGO_URI"])

    with app.app_context():
        cfg = app.config
        db_map = {
            "auth": cfg["MONGO_DB_AUTH"],
            "academic": cfg["MONGO_DB_ACADEMIC"],
            "attendance": cfg["MONGO_DB_ATTENDANCE"],
            "audit": cfg["MONGO_DB_AUDIT"],
        }

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        target_root = Path(args.output_dir) / f"backup-{timestamp}"

        print(f"Backup target: {target_root}")
        if args.dry_run:
            print("Dry run enabled. No files will be written.")

        manifest = {
            "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "databases": db_map,
            "files": [],
        }

        for alias, db_name in db_map.items():
            db = mongo.cx[db_name]
            collection_names = sorted(db.list_collection_names())

            for collection_name in collection_names:
                docs = list(db[collection_name].find({}))
                rel_path = Path(alias) / f"{collection_name}.jsonl"
                manifest["files"].append({
                    "alias": alias,
                    "database": db_name,
                    "collection": collection_name,
                    "path": str(rel_path).replace("\\", "/"),
                    "count": len(docs),
                })

                if args.dry_run:
                    print(f"- {alias}.{collection_name}: {len(docs)} docs")
                    continue

                out_path = target_root / rel_path
                out_path.parent.mkdir(parents=True, exist_ok=True)
                with out_path.open("w", encoding="utf-8") as handle:
                    for doc in docs:
                        handle.write(json_util.dumps(doc))
                        handle.write("\n")
                print(f"- wrote {alias}.{collection_name}: {len(docs)} docs")

        if not args.dry_run:
            target_root.mkdir(parents=True, exist_ok=True)
            manifest_path = target_root / "manifest.json"
            with manifest_path.open("w", encoding="utf-8") as handle:
                json.dump(manifest, handle, indent=2)
            print(f"Manifest written: {manifest_path}")


if __name__ == "__main__":
    main()
