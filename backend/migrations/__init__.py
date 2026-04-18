from .m20260413_001_normalize_attendance_sessions import upgrade as normalize_attendance_sessions_upgrade
from .m20260417_002_rbac_department_migration import upgrade as rbac_department_migration_upgrade
from .types import Migration


MIGRATIONS = [
    Migration(
        migration_id="20260413_001",
        name="normalize_attendance_sessions",
        upgrade=normalize_attendance_sessions_upgrade,
    ),
    Migration(
        migration_id="20260417_002",
        name="rbac_department_migration",
        upgrade=rbac_department_migration_upgrade,
    ),
]
