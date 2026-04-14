# CLI Command Runbook

This runbook documents every important command needed to operate, maintain, test, and validate the system.

## 1. Environment setup

### 1.1 Backend Python environment

- Why:
  - Install backend dependencies in isolated environment
- When:
  - First setup, dependency refresh, new machine
- Commands:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 1.2 Frontend Node dependencies

- Why:
  - Install React and tooling dependencies
- When:
  - First setup, package updates
- Commands:

```powershell
cd frontend
npm ci
```

## 2. Run the system

### 2.1 Start backend API

- Why:
  - Serve REST API and business logic
- When:
  - Development, testing, local demos
- Command:

```powershell
cd backend
python run.py
```

### 2.2 Start frontend app

- Why:
  - Serve dashboard UI for all roles
- When:
  - Development and verification
- Command:

```powershell
cd frontend
npm run dev
```

### 2.3 Optional queue worker (Redis mode)

- Why:
  - Process async jobs from Redis queue
- When:
  - TASK_QUEUE_ENABLED=1 and Redis is available
- Command:

```powershell
cd backend
python worker.py
```

## 3. User/account setup commands

### 3.1 Seed initial admin interactively

- Why:
  - Create secure first admin account
- When:
  - Fresh DB, after reset
- Command:

```powershell
cd backend
python seedAdmin.py
```

## 4. Database lifecycle commands

### 4.1 Backup databases

- Why:
  - Capture restorable snapshots
- When:
  - Before major changes, daily operations, pre-release
- Commands:

```powershell
cd backend
python backup.py --output-dir backups
python backup.py --dry-run
```

### 4.2 Restore databases

- Why:
  - Recover from backup snapshots
- When:
  - Disaster recovery, restore drills, migration rollback testing
- Commands:

```powershell
cd backend
python restore.py --input-dir backups\backup-YYYYMMDD-HHMMSS
python restore.py --input-dir backups\backup-YYYYMMDD-HHMMSS --drop-existing --yes
python restore.py --input-dir backups\backup-YYYYMMDD-HHMMSS --dry-run
```

### 4.3 Diagnose DB counts/indexes

- Why:
  - Validate schema/index integrity
- When:
  - After migration, after restore, before release
- Command:

```powershell
cd backend
python db_diagnostics.py
```

### 4.4 Full destructive reset

- Why:
  - Clean environment for fresh test cycles
- When:
  - Integration re-test from zero state
- Commands:

```powershell
cd backend
python delete.py --dry-run
python delete.py --yes
python delete.py --yes --mongo-only
```

## 5. Migration commands

### 5.1 Check migration status

- Why:
  - Confirm applied vs pending migrations
- When:
  - Before and after deploy/migration
- Command:

```powershell
cd backend
python migrate.py status
```

### 5.2 Apply pending migrations

- Why:
  - Move DB schema/state to expected version
- When:
  - Deploys, feature rollout requiring data normalization
- Commands:

```powershell
cd backend
python migrate.py up
python migrate.py up --target m20260413_001_normalize_attendance_sessions
```

### 5.3 Legacy one-off migration wrapper

- Why:
  - Compatibility wrapper for old normalization trigger
- When:
  - Backward compatibility scenario
- Command:

```powershell
cd backend
python normalize_sessions_once.py
```

## 6. Data retention and scheduled maintenance

### 6.1 Lifecycle cleanup

- Why:
  - Enforce retention policies for uploads/datasets/backups
- When:
  - Daily maintenance window
- Commands:

```powershell
cd backend
python cleanup_data_lifecycle.py --dry-run
python cleanup_data_lifecycle.py --apply
```

### 6.2 Daily maintenance runner

- Why:
  - Chain backup + cleanup + diagnostics in one routine
- When:
  - Daily, non-peak hours
- Commands:

```powershell
cd backend
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run_daily_maintenance.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run_daily_maintenance.ps1
```

### 6.3 Register daily scheduled task (Windows)

- Why:
  - Automate daily maintenance
- When:
  - Production-like local operations setup
- Command:

```powershell
cd backend
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register_daily_maintenance_task.ps1 -RunTime "02:30"
```

### 6.4 Weekly restore drill runner

- Why:
  - Validate that backups are usable
- When:
  - Weekly operational readiness checks
- Command:

```powershell
cd backend
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run_weekly_restore_drill.ps1
```

### 6.5 Register weekly restore drill task (Windows)

- Why:
  - Automate recovery-readiness drills
- When:
  - Production-like operations
- Command:

```powershell
cd backend
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register_weekly_restore_drill_task.ps1 -DayOfWeek SUN -RunTime "03:30"
```

## 7. Queue and observability verification commands

### 7.1 Queue resilience verification

- Why:
  - Ensure stale-running and delayed-job recovery logic works
- When:
  - Queue changes, Redis changes, release validation
- Command:

```powershell
cd backend
python verify_queue_resilience.py
```

### 7.2 Observability verification

- Why:
  - Check logging/metrics/health error handling integration
- When:
  - Observability changes or release certification
- Command:

```powershell
cd backend
python verify_observability.py
```

### 7.3 Security verification

- Why:
  - Validate hardening controls and policies
- When:
  - Security release checks, compliance evidence capture
- Command:

```powershell
python verify_security.py
```

## 8. Performance validation commands

### 8.1 Full performance suite

- Why:
  - Validate latency/throughput for critical workflows
- When:
  - Before release, after major performance-sensitive changes
- Command:

```powershell
cd backend
python perf\run_performance_validation.py
```

### 8.2 Performance suite with explicit fixture image

- Why:
  - Run face benchmark with controlled classroom image input
- When:
  - Benchmark reproducibility and comparison runs
- Command:

```powershell
cd backend
python perf\run_performance_validation.py --fixture-image uploads\MCA1_1_20260412_134617\original.jpg
```

Outputs are written to backend/perf/results as timestamped JSON and CSV.

## 9. Frontend quality and E2E commands

### 9.1 Lint and build

- Why:
  - Validate code quality and production build integrity
- When:
  - Pre-merge and pre-release
- Commands:

```powershell
cd frontend
npm run lint
npm run build
```

### 9.2 Playwright setup and E2E

- Why:
  - Browser-level flow verification
- When:
  - Regression testing and release checks
- Commands:

```powershell
cd frontend
npx playwright install chromium
npm run test:e2e
```

## 10. Typical operational command sequence

### 10.1 Fresh local setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python seedAdmin.py
python run.py
```

In new terminal:

```powershell
cd frontend
npm ci
npm run dev
```

### 10.2 Pre-release validation sequence

```powershell
cd backend
python db_diagnostics.py
python migrate.py status
python perf\run_performance_validation.py
```

```powershell
cd frontend
npm run lint
npm run build
npm run test:e2e
```

## 11. Related documents

- API contract: [/docs/openapi.yaml](/docs/openapi.yaml)
- Workflow payloads and validation: [/docs/governance/API_WORKFLOW_GUIDE.md](/docs/governance/API_WORKFLOW_GUIDE.md)
- Full operations manual: [/docs/operations/SYSTEM_OPERATIONS_MANUAL.md](/docs/operations/SYSTEM_OPERATIONS_MANUAL.md)