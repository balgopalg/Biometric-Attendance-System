"""Unit tests for the RBAC module (app.security.rbac)."""

import unittest
from bson import ObjectId
from app.security.rbac import (
    role_level,
    role_at_least,
    is_super_admin,
    is_department_admin,
    is_any_admin,
    effective_allowed_roles,
    get_user_department_id,
    dept_scope_filter,
    validate_department_access,
    validate_role_assignment,
    ALL_ROLES,
    ADMIN_ROLES,
)


class TestRoleHierarchy(unittest.TestCase):
    """Verify role levels and ordering."""

    def test_role_levels_are_ordered(self):
        self.assertGreater(role_level("super_admin"), role_level("department_admin"))
        self.assertGreater(role_level("department_admin"), role_level("lecturer"))
        self.assertGreater(role_level("lecturer"), role_level("student"))

    def test_unknown_role_returns_negative(self):
        self.assertEqual(role_level("unknown"), -1)
        self.assertEqual(role_level(""), -1)

    def test_role_at_least(self):
        self.assertTrue(role_at_least("super_admin", "student"))
        self.assertTrue(role_at_least("super_admin", "department_admin"))
        self.assertTrue(role_at_least("department_admin", "department_admin"))
        self.assertFalse(role_at_least("lecturer", "department_admin"))
        self.assertFalse(role_at_least("student", "lecturer"))

    def test_all_roles_set(self):
        self.assertEqual(ALL_ROLES, {"super_admin", "department_admin", "lecturer", "student"})

    def test_admin_roles_set(self):
        self.assertEqual(ADMIN_ROLES, {"super_admin", "department_admin"})


class TestRoleCheckers(unittest.TestCase):
    def test_is_super_admin(self):
        self.assertTrue(is_super_admin({"role": "super_admin"}))
        self.assertFalse(is_super_admin({"role": "department_admin"}))
        self.assertTrue(is_super_admin({"role": "admin"}))

    def test_is_department_admin(self):
        self.assertTrue(is_department_admin({"role": "department_admin"}))
        self.assertFalse(is_department_admin({"role": "super_admin"}))

    def test_is_any_admin(self):
        self.assertTrue(is_any_admin({"role": "super_admin"}))
        self.assertTrue(is_any_admin({"role": "department_admin"}))
        self.assertFalse(is_any_admin({"role": "lecturer"}))
        self.assertFalse(is_any_admin({"role": "student"}))


class TestEffectiveAllowedRoles(unittest.TestCase):
    def test_department_admin_includes_super_admin(self):
        roles = effective_allowed_roles(["department_admin"])
        self.assertIn("super_admin", roles)
        self.assertIn("department_admin", roles)

    def test_legacy_admin_expands_correctly(self):
        roles = effective_allowed_roles(["admin"])
        self.assertIn("super_admin", roles)
        self.assertIn("department_admin", roles)
        self.assertNotIn("admin", roles)

    def test_student_only(self):
        roles = effective_allowed_roles(["student"])
        self.assertIn("student", roles)
        self.assertIn("lecturer", roles)
        self.assertIn("department_admin", roles)
        self.assertIn("super_admin", roles)

    def test_lecturer_includes_higher(self):
        roles = effective_allowed_roles(["lecturer"])
        self.assertIn("lecturer", roles)
        self.assertIn("department_admin", roles)
        self.assertIn("super_admin", roles)
        self.assertNotIn("student", roles)


class TestDepartmentId(unittest.TestCase):
    def test_extract_objectid(self):
        oid = ObjectId()
        self.assertEqual(get_user_department_id({"department_id": oid}), oid)

    def test_extract_string(self):
        oid = ObjectId()
        result = get_user_department_id({"department_id": str(oid)})
        self.assertEqual(result, oid)

    def test_none_returns_none(self):
        self.assertIsNone(get_user_department_id({"department_id": None}))
        self.assertIsNone(get_user_department_id({}))

    def test_empty_string_returns_none(self):
        self.assertIsNone(get_user_department_id({"department_id": ""}))

    def test_invalid_string_returns_none(self):
        self.assertIsNone(get_user_department_id({"department_id": "not-an-oid"}))


class TestValidateDepartmentAccess(unittest.TestCase):
    def test_super_admin_always_allowed(self):
        self.assertTrue(validate_department_access({"role": "super_admin"}, ObjectId()))
        self.assertTrue(validate_department_access({"role": "super_admin"}, None))

    def test_matching_department(self):
        oid = ObjectId()
        self.assertTrue(validate_department_access(
            {"role": "department_admin", "department_id": oid}, oid
        ))

    def test_non_matching_department(self):
        self.assertFalse(validate_department_access(
            {"role": "department_admin", "department_id": ObjectId()}, ObjectId()
        ))

    def test_no_department_id(self):
        self.assertFalse(validate_department_access(
            {"role": "department_admin"}, ObjectId()
        ))


class TestValidateRoleAssignment(unittest.TestCase):
    def test_super_admin_can_assign_any(self):
        actor = {"role": "super_admin"}
        for role in ALL_ROLES:
            self.assertTrue(validate_role_assignment(actor, role), f"super_admin should assign {role}")

    def test_department_admin_can_assign_lecturer_student(self):
        actor = {"role": "department_admin"}
        self.assertTrue(validate_role_assignment(actor, "lecturer"))
        self.assertTrue(validate_role_assignment(actor, "student"))

    def test_department_admin_cannot_assign_admin_roles(self):
        actor = {"role": "department_admin"}
        self.assertFalse(validate_role_assignment(actor, "super_admin"))
        self.assertFalse(validate_role_assignment(actor, "department_admin"))

    def test_lecturer_cannot_assign(self):
        self.assertFalse(validate_role_assignment({"role": "lecturer"}, "student"))

    def test_student_cannot_assign(self):
        self.assertFalse(validate_role_assignment({"role": "student"}, "student"))


class TestDeptScopeFilter(unittest.TestCase):
    """dept_scope_filter relies on Flask request context, so we test
    the non-request path (super_admin returns {}, others use their dept_id)."""

    def test_super_admin_returns_empty(self):
        result = dept_scope_filter({"role": "super_admin", "department_id": None})
        self.assertEqual(result, {})

    def test_department_admin_returns_filter(self):
        oid = ObjectId()
        result = dept_scope_filter({"role": "department_admin", "department_id": oid})
        self.assertEqual(result, {"department_id": oid})

    def test_lecturer_returns_filter(self):
        oid = ObjectId()
        result = dept_scope_filter({"role": "lecturer", "department_id": oid})
        self.assertEqual(result, {"department_id": oid})

    def test_no_dept_id_returns_empty(self):
        result = dept_scope_filter({"role": "department_admin"})
        self.assertEqual(result, {})


if __name__ == "__main__":
    unittest.main()
