# Database Migration Strategy

This project now uses tracked, versioned migrations instead of one-off scripts.

## How migrations are tracked

- Migration files live in `backend/migrations/`.
- Applied migrations are stored in Mongo collection:
  - `attendance.schema_migrations`
- History record fields:
  - `migration_id`
  - `name`
  - `applied_at`
  - `duration_ms`
  - `result`

## Commands

Run from `backend/`:

```bash
python migrate.py status
python migrate.py up
python migrate.py up --target m20260413_001_normalize_attendance_sessions
```

## Current migration history

- `m20260413_001_normalize_attendance_sessions`
  - Replaces legacy one-off normalization run for `attendance_sessions`
  - Normalizes IDs and `academic_session`/`academic_year` consistency

## Schema evolution notes

### Attendance domain

- `attendance.attendance_sessions`
  - Durable committed attendance records with rollback metadata
- `attendance.active_sessions`
  - Durable in-progress lecturer sessions (replaces in-memory active sessions)
- `attendance.background_jobs`
  - Retry/dead-letter metadata includes:
    - `retry_count`
    - `retry_in_seconds`
    - `last_error_at`
    - `dead_lettered_at`
    - `error_history`
- `attendance.schema_migrations`
  - Migration history tracking

## Expected indexes

These are expected and checked by diagnostics:

- `auth.users`: `uq_users_email`, `ix_users_role`
- `academic.courses`: `uq_courses_code`
- `academic.papers`: `uq_papers_code`, `ix_papers_course`, `ix_papers_lecturers`
- `academic.student_profiles`: `uq_profiles_user`, `uq_profiles_reg`, `ix_profiles_course`, `ix_profiles_year`
- `attendance.attendance_logs`: `uq_attendance_session_paper_student`, `ix_attendance_timestamp`, `ix_attendance_paper_student`
- `attendance.attendance_sessions`: `uq_sessions_id`, `ix_sessions_lecturer_created`, `ix_sessions_rollback_until`
- `attendance.active_sessions`: `uq_active_sessions_id`, `ix_active_sessions_lecturer_updated`, `ix_active_sessions_expires_at`
- `attendance.background_jobs`: `uq_jobs_id`, `ix_jobs_status_created`, `ix_jobs_status_next_attempt`, `ix_jobs_updated`
- `attendance.exam_eligibility_overrides`: `uq_overrides_student_paper`
- `attendance.schema_migrations`: `uq_schema_migrations_id`, `ix_schema_migrations_applied_at`
- `audit.audit_logs`: `ix_audit_timestamp`, `ix_audit_action`

## Replacing one-off scripts

- Legacy: `normalize_sessions_once.py`
- New: tracked migration `m20260413_001_normalize_attendance_sessions` via `migrate.py`

Use one-off scripts only for temporary diagnostics, not schema/data evolution.
