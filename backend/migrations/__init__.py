from .m20260413_001_normalize_attendance_sessions import upgrade as normalize_attendance_sessions_upgrade
from .types import Migration


MIGRATIONS = [
    Migration(
        migration_id="20260413_001",
        name="normalize_attendance_sessions",
        upgrade=normalize_attendance_sessions_upgrade,
    ),
]
