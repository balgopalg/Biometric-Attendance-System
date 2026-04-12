# Data Lifecycle Management

This document defines retention rules, cleanup policy, and backup/restore operations for generated data.

## Retention rules

Configured via environment values in `.env`:

- `UPLOAD_RETENTION_DAYS` (default `14`)
  - Applies to generated classroom upload bundles in `backend/uploads/`
- `DATASET_RETENTION_DAYS` (default `365`)
  - Applies to student dataset folders in `backend/dataset/`
- `TRAINER_ARTIFACT_RETENTION_DAYS` (default `30`)
  - Applies to stale trainer artifacts in `backend/trainer/`
  - Canonical `face_trainer.keras` is preserved
- `BACKUP_RETENTION_DAYS` (default `30`)
  - Applies to backup folders in `backend/backups/`

## Cleanup policy

Use `cleanup_data_lifecycle.py` to enforce retention:

```bash
# Preview only
python cleanup_data_lifecycle.py --dry-run

# Apply deletions
python cleanup_data_lifecycle.py --apply
```

Policy behavior:

- Deletes stale directories/files older than retention cutoff based on mtime
- Preserves `.gitkeep`
- Preserves `trainer/face_trainer.keras`

Recommended schedule:

- Run daily at off-peak time (for example 02:30 local server time)
- Run dry-run first in newly deployed environments

## Windows Task Scheduler automation

Ready-to-run scripts:

- backend/scripts/run_daily_maintenance.ps1
- backend/scripts/register_daily_maintenance_task.ps1

Register a daily task (default 02:30):

  powershell -ExecutionPolicy Bypass -File scripts/register_daily_maintenance_task.ps1

Register with custom time:

  powershell -ExecutionPolicy Bypass -File scripts/register_daily_maintenance_task.ps1 -RunTime 01:45

Manual dry-run of maintenance pipeline:

  powershell -ExecutionPolicy Bypass -File scripts/run_daily_maintenance.ps1 -DryRun

Manual full run:

  powershell -ExecutionPolicy Bypass -File scripts/run_daily_maintenance.ps1

Logs are written to:

- backend/logs/maintenance-YYYYMMDD-HHMMSS.log

## Backup frequency

Use `backup.py` to create JSONL snapshots:

```bash
python backup.py --output-dir backups
```

Recommended frequency:

- Daily full backup at 02:00
- Keep minimum 30 days on local disk
- Replicate critical backups to off-host storage (object storage or secondary server)
- Use Windows Task Scheduler to run backup and cleanup in one daily job

Recommended restore drill:

- Weekly restore drill in a non-production environment
- Validate auth, student, lecturer, attendance, and audit collections are readable

### Weekly restore-drill automation (Windows)

Ready-to-run scripts:

- backend/scripts/run_weekly_restore_drill.ps1
- backend/scripts/register_weekly_restore_drill_task.ps1

Register weekly drill task (default Sunday 03:30):

  powershell -ExecutionPolicy Bypass -File scripts/register_weekly_restore_drill_task.ps1

Register with custom day/time:

  powershell -ExecutionPolicy Bypass -File scripts/register_weekly_restore_drill_task.ps1 -DayOfWeek SAT -RunTime 04:00

Manual run:

  powershell -ExecutionPolicy Bypass -File scripts/run_weekly_restore_drill.ps1

Drill behavior:

- Picks latest backup folder under `backend/backups/backup-*`
- Runs restore in `--dry-run` mode (non-destructive)
- Runs migration status and diagnostics checks
- Writes logs to `backend/logs/restore-drill-YYYYMMDD-HHMMSS.log`

## Restore procedures

Restore from a backup folder that contains `manifest.json`:

```bash
# Preview restore
python restore.py --input-dir backups/backup-YYYYMMDD-HHMMSS --dry-run

# Restore into existing collections (append)
python restore.py --input-dir backups/backup-YYYYMMDD-HHMMSS

# Destructive restore (drop then restore)
python restore.py --input-dir backups/backup-YYYYMMDD-HHMMSS --drop-existing --yes
```

Post-restore validation checklist:

- Run index and collection checks:
  - `python db_diagnostics.py`
- Verify migration state:
  - `python migrate.py status`
- Smoke test API startup and login flow

## Ownership and audit

- Backup and cleanup jobs should run under controlled service account credentials
- Capture stdout/stderr logs for every scheduled run
- Alert on non-zero exit codes for backup, restore drills, or cleanup

## Performance validation

Run the integrated backend performance suite:

    python perf/run_performance_validation.py

What it validates:

- Bulk admin operations:
  - bulk student create
  - bulk paper assignment
  - bulk semester promotion

Optional: use a specific classroom image fixture for face benchmarks:

```bash
python perf/run_performance_validation.py --fixture-image uploads/MCA1_1_20260412_134617/original.jpg
```

Each run also writes timestamped artifacts to `backend/perf/results/`:
- `performance_validation_*.json`
- `performance_validation_*.csv`
- Face pipeline and training jobs:
  - lecturer session start
  - frame recognition median latency
  - image recognition median latency
  - bulk training queue request latency
- Large attendance export:
  - matrix JSON build
  - Excel export
  - CSV export

Safety notes:

- The script creates synthetic benchmark data with unique tags and cleans it up after run.
- Existing production entities are not deleted.
