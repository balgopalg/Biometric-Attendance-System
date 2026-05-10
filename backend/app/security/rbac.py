"""Role-Based Access Control — hierarchy definitions and helpers.

Four-tier role hierarchy (lowest → highest privilege):
    student  →  lecturer  →  department_admin  →  super_admin

Key rules:
    • super_admin inherits ALL permissions of every lower role.
    • department_admin is sandboxed to a single department_id.
    • super_admin has no department_id (or it is None / empty).
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Set

from bson import ObjectId
from flask import has_request_context, request

# ---------------------------------------------------------------------------
# Role hierarchy — higher numeric value = more privilege
# ---------------------------------------------------------------------------

ROLE_HIERARCHY: Dict[str, int] = {
    "student": 0,
    "lecturer": 1,
    "department_admin": 2,
    "super_admin": 3,
}

ALL_ROLES: Set[str] = set(ROLE_HIERARCHY.keys())

ADMIN_ROLES: Set[str] = {"super_admin", "department_admin"}

# Backward-compat alias: old "admin" role maps to these during transition
LEGACY_ADMIN_ALIASES: Set[str] = {"admin"}


def role_level(role: str) -> int:
    """Return numeric privilege level for a role (−1 for unknown)."""
    return ROLE_HIERARCHY.get(role, -1)


def role_at_least(user_role: str, minimum_role: str) -> bool:
    """Return True when *user_role* meets or exceeds *minimum_role*."""
    return role_level(user_role) >= role_level(minimum_role)


def is_super_admin(user: dict) -> bool:
    return (user.get("role") or "") in ("super_admin", "admin")


def is_department_admin(user: dict) -> bool:
    return (user.get("role") or "") == "department_admin"


def is_any_admin(user: dict) -> bool:
    return (user.get("role") or "") in ADMIN_ROLES


def effective_allowed_roles(allowed_roles) -> Set[str]:
    """Expand a set of allowed roles to include inherited higher roles.

    If ``department_admin`` is allowed, ``super_admin`` is automatically
    included because super_admin inherits every lower-tier permission.
    The legacy ``"admin"`` alias is also transparently expanded.
    """
    roles = set(allowed_roles)

    # Legacy compat — treat old "admin" the same as department_admin
    if roles & LEGACY_ADMIN_ALIASES:
        roles -= LEGACY_ADMIN_ALIASES
        roles.add("department_admin")

    # Role inheritance: anyone at or above the minimum role is allowed.
    min_level = min(
        (role_level(r) for r in roles if role_level(r) >= 0), default=999
    )
    for role, level in ROLE_HIERARCHY.items():
        if level >= min_level:
            roles.add(role)

    return roles


# ---------------------------------------------------------------------------
# Department scoping helpers
# ---------------------------------------------------------------------------


def get_user_department_id(user: dict) -> Optional[ObjectId]:
    """Extract a user's department_id as an ObjectId (or None for super_admin)."""
    raw = user.get("department_id")
    if raw is None or raw == "" or raw == "None":
        return None
    if isinstance(raw, ObjectId):
        return raw
    try:
        return ObjectId(str(raw))
    except Exception:
        return None


def dept_scope_filter(user: dict) -> dict:
    """Build a MongoDB filter dict for department-level data isolation.

    • super_admin  → {} (all data) unless they pass ?department_id=…
    • department_admin / lecturer / student → {department_id: <their dept>}
    """
    if is_super_admin(user):
        # Super admin can optionally scope to a department via query param
        if has_request_context():
            requested_dept = (request.args.get("department_id") or "").strip()
            if requested_dept:
                try:
                    return {"department_id": ObjectId(requested_dept)}
                except Exception:
                    pass
        return {}  # No filter = global view

    dept_id = get_user_department_id(user)
    if dept_id:
        return {"department_id": dept_id}
    return {}


def validate_department_access(user: dict, target_department_id: Any) -> bool:
    """Check whether *user* is allowed to interact with *target_department_id*.

    Returns True if:
        • user is super_admin (always allowed), OR
        • user's department_id matches the target.
    """
    if is_super_admin(user):
        return True

    if target_department_id is None:
        return False

    user_dept = get_user_department_id(user)
    if user_dept is None:
        return False

    target = target_department_id
    if not isinstance(target, ObjectId):
        try:
            target = ObjectId(str(target))
        except Exception:
            return False

    return user_dept == target


def validate_role_assignment(actor: dict, target_role: str) -> bool:
    """Return True when *actor* is allowed to assign *target_role*.

    Rules:
        • Only super_admin can create/assign super_admin or department_admin.
        • department_admin can create lecturer and student only.
        • Lecturers and students cannot create any user.
    """
    actor_role = actor.get("role") or ""

    if actor_role == "super_admin":
        return target_role in ALL_ROLES

    if actor_role == "department_admin":
        return target_role in {"lecturer", "student"}

    return False
