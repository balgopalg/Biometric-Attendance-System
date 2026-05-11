from __future__ import annotations

import base64
import copy
import os
import tempfile
import unittest
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
from io import BytesIO
from unittest.mock import patch

import bcrypt
import numpy as np
from PIL import Image
from bson import ObjectId

from app.extensions import mongo

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2s4WQAAAAASUVORK5CYII="
)


class FakeInsertOneResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


class FakeUpdateResult:
    def __init__(self, matched_count=0, modified_count=0, upserted_id=None):
        self.matched_count = matched_count
        self.modified_count = modified_count
        self.upserted_id = upserted_id


class FakeDeleteResult:
    def __init__(self, deleted_count=0):
        self.deleted_count = deleted_count


def _as_text(value):
    if isinstance(value, ObjectId):
        return str(value)
    return str(value) if value is not None else ""


def _values_equal(actual, expected):
    if actual is expected:
        return True
    if actual is None or expected is None:
        return actual is expected
    if isinstance(actual, (int, float, bool)) and isinstance(expected, (int, float, bool)):
        return actual == expected
    if isinstance(actual, datetime) and isinstance(expected, datetime):
        return actual == expected
    return _as_text(actual) == _as_text(expected)


class FakeCursor(list):
    """Wraps a list to support chained .sort().skip().limit() as pymongo cursors do."""

    def sort(self, key_or_list, direction=None):
        if isinstance(key_or_list, str):
            sort_list = [(key_or_list, direction or 1)]
        else:
            sort_list = key_or_list
        result = list(self)
        for sort_key, sort_dir in reversed(sort_list):
            result.sort(key=lambda d: d.get(sort_key) if d.get(sort_key) is not None else datetime.min, reverse=(sort_dir == -1))
        return FakeCursor(result)

    def skip(self, n):
        return FakeCursor(list(self)[n:])

    def limit(self, n):
        if n <= 0:
            return self
        return FakeCursor(list(self)[:n])


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = [copy.deepcopy(doc) for doc in (docs or [])]

    def _match(self, doc, query):
        if not query:
            return True

        for key, expected in query.items():
            if key == "$or":
                if not any(self._match(doc, subquery) for subquery in expected):
                    return False
                continue
            if key == "$and":
                if not all(self._match(doc, subquery) for subquery in expected):
                    return False
                continue

            actual = doc.get(key)
            if isinstance(expected, dict):
                if "$exists" in expected:
                    if bool(expected["$exists"]) != (key in doc):
                        return False
                    continue
                if "$in" in expected:
                    options = expected["$in"]
                    if isinstance(actual, list):
                        if not any(any(_values_equal(item, option) for option in options) for item in actual):
                            return False
                    else:
                        if not any(_values_equal(actual, option) for option in options):
                            return False
                    continue
                if "$nin" in expected:
                    options = expected["$nin"]
                    if any(_values_equal(actual, option) for option in options):
                        return False
                    continue
                if "$ne" in expected:
                    if _values_equal(actual, expected["$ne"]):
                        return False
                    continue

                # Comparison operators
                matched_comparison = True
                has_comparison = False
                if "$gte" in expected:
                    has_comparison = True
                    if actual is None or actual < expected["$gte"]:
                        matched_comparison = False
                if "$gt" in expected:
                    has_comparison = True
                    if actual is None or actual <= expected["$gt"]:
                        matched_comparison = False
                if "$lte" in expected:
                    has_comparison = True
                    if actual is None or actual > expected["$lte"]:
                        matched_comparison = False
                if "$lt" in expected:
                    has_comparison = True
                    if actual is None or actual >= expected["$lt"]:
                        matched_comparison = False
                if has_comparison:
                    if not matched_comparison:
                        return False
                    continue

                if "$regex" in expected:
                    import re
                    flags = re.IGNORECASE if expected.get("$options") == "i" else 0
                    if actual is None or not re.search(expected["$regex"], str(actual), flags):
                        return False
                    continue

            if isinstance(actual, list):
                if not any(_values_equal(item, expected) for item in actual):
                    return False
            else:
                if not _values_equal(actual, expected):
                    return False

        return True

    def _project(self, doc, projection):
        if not projection:
            return copy.deepcopy(doc)
        projected = copy.deepcopy(doc)
        include_keys = {key for key, enabled in projection.items() if enabled}
        if include_keys:
            if projection.get("_id", 1):
                include_keys.add("_id")
            projected = {key: value for key, value in projected.items() if key in include_keys}
        if projection.get("_id", 1) == 0 and "_id" in projected:
            projected.pop("_id", None)
        return projected

    def find_one(self, query=None, projection=None, sort=None):
        matches = [doc for doc in self.docs if self._match(doc, query or {})]
        if sort and matches:
            for sort_key, sort_dir in reversed(sort):
                matches.sort(key=lambda d: d.get(sort_key) or datetime.min, reverse=(sort_dir == -1))
        if not matches:
            return None
        return self._project(matches[0], projection)

    def find(self, query=None, projection=None):
        return FakeCursor([self._project(doc, projection) for doc in self.docs if self._match(doc, query or {})])

    def insert_one(self, doc):
        inserted = copy.deepcopy(doc)
        if inserted.get("_id") is None:
            inserted["_id"] = ObjectId()
        self.docs.append(inserted)
        return FakeInsertOneResult(inserted["_id"])

    def insert_many(self, docs):
        ids = []
        for doc in docs:
            ids.append(self.insert_one(doc).inserted_id)
        return ids

    def delete_one(self, query):
        for index, doc in enumerate(self.docs):
            if self._match(doc, query or {}):
                self.docs.pop(index)
                return FakeDeleteResult(1)
        return FakeDeleteResult(0)

    def delete_many(self, query):
        before = len(self.docs)
        self.docs = [doc for doc in self.docs if not self._match(doc, query or {})]
        return FakeDeleteResult(before - len(self.docs))

    def update_one(self, query, update, upsert=False):
        for doc in self.docs:
            if self._match(doc, query or {}):
                self._apply_update(doc, update)
                return FakeUpdateResult(matched_count=1, modified_count=1)

        if upsert:
            new_doc = self._build_upsert_doc(query or {}, update)
            self.docs.append(new_doc)
            return FakeUpdateResult(matched_count=0, modified_count=1, upserted_id=new_doc["_id"])

        return FakeUpdateResult()

    def update_many(self, query, update):
        matched = 0
        for doc in self.docs:
            if self._match(doc, query or {}):
                self._apply_update(doc, update)
                matched += 1
        return FakeUpdateResult(matched_count=matched, modified_count=matched)

    def count_documents(self, query=None):
        return sum(1 for doc in self.docs if self._match(doc, query or {}))

    def create_index(self, *args, **kwargs):
        return kwargs.get("name")

    def drop_index(self, *args, **kwargs):
        return None

    def index_information(self):
        return {}

    def aggregate(self, pipeline):
        """Minimal aggregate for IPRateLimiter."""
        docs = list(self.docs)
        for stage in pipeline:
            if "$match" in stage:
                docs = [d for d in docs if self._match(d, stage["$match"])]
            elif "$group" in stage:
                group_spec = stage["$group"]
                result = {}
                for key, op in group_spec.items():
                    if key == "_id":
                        result["_id"] = group_spec["_id"]
                    elif isinstance(op, dict) and "$sum" in op:
                        field = op["$sum"]
                        if isinstance(field, str) and field.startswith("$"):
                            result[key] = sum(d.get(field[1:], 0) for d in docs)
                        else:
                            result[key] = len(docs) * field
                return [result] if docs else []
        return docs

    def find_one_and_update(self, query, update, upsert=False, return_document=None):
        """Minimal find_one_and_update for audit log deduplication."""
        for doc in self.docs:
            if self._match(doc, query or {}):
                before = copy.deepcopy(doc)
                self._apply_update(doc, update)
                return before
        if upsert:
            if "$setOnInsert" in update:
                new_doc = copy.deepcopy(update["$setOnInsert"])
            else:
                new_doc = self._build_upsert_doc(query or {}, update)
            if "_id" not in new_doc:
                new_doc["_id"] = ObjectId()
            self.docs.append(new_doc)
            return None
        return None

    def _build_upsert_doc(self, query, update):
        doc = {key: copy.deepcopy(value) for key, value in query.items() if not key.startswith("$")}
        if "_id" not in doc:
            doc["_id"] = ObjectId()
        self._is_upserting = True
        self._apply_update(doc, update)
        self._is_upserting = False
        return doc

    def _apply_update(self, doc, update):
        for operator, payload in update.items():
            if operator == "$set" or operator == "$setOnInsert":
                for key, value in payload.items():
                    # For $setOnInsert, ideally we should only apply it on insert,
                    # but in FakeCollection _apply_update context, when upserting
                    # it applies it as $set. (Since $setOnInsert is only ever called during upsert logic).
                    # Actually, if the document was already found, $setOnInsert does nothing.
                    # Wait, _apply_update is used for both update and upsert. If it's an update, $setOnInsert should be ignored.
                    # But the simplest fix is to just handle it. Let's do it right.
                    if operator == "$set":
                        doc[key] = copy.deepcopy(value)
                    elif operator == "$setOnInsert" and getattr(self, "_is_upserting", False):
                        doc[key] = copy.deepcopy(value)
            elif operator == "$inc":
                for key, value in payload.items():
                    doc[key] = doc.get(key, 0) + value
            elif operator == "$push":
                for key, value in payload.items():
                    doc.setdefault(key, [])
                    doc[key].append(copy.deepcopy(value))
            elif operator == "$addToSet":
                for key, value in payload.items():
                    doc.setdefault(key, [])
                    items = value.get("$each") if isinstance(value, dict) and "$each" in value else [value]
                    for item in items:
                        if not any(_values_equal(existing, item) for existing in doc[key]):
                            doc[key].append(copy.deepcopy(item))


class FakeDatabase:
    def __init__(self, collections=None):
        self._collections = collections or {}

    def __getitem__(self, name):
        if name not in self._collections:
            self._collections[name] = FakeCollection()
        return self._collections[name]

    def list_collection_names(self):
        return list(self._collections.keys())


class FakeMongoClient:
    def __init__(self, databases=None):
        self._databases = databases or {}
        self.admin = type("Admin", (), {"command": staticmethod(lambda *args, **kwargs: {"ok": 1})})()

    def __getitem__(self, name):
        if name not in self._databases:
            self._databases[name] = FakeDatabase()
        return self._databases[name]

    def drop_database(self, name):
        self._databases.pop(name, None)


class BaseApiFlowTestCase(unittest.TestCase):
    def setUp(self):
        self.fake_client, self.seed = self._build_seeded_client()
        self.exit_stack = ExitStack()
        self.exit_stack.enter_context(patch("app.mongo.init_app", return_value=None))
        self.exit_stack.enter_context(patch("app._bootstrap_isolated_databases", side_effect=lambda *args, **kwargs: None))
        self.exit_stack.enter_context(patch("app._ensure_indexes", side_effect=lambda *args, **kwargs: None))
        self.exit_stack.enter_context(patch("app._run_startup_health_checks", side_effect=lambda *args, **kwargs: None))
        self.exit_stack.enter_context(patch("app._seed_admin", side_effect=lambda *args, **kwargs: None))

        from app import create_app

        self.app = create_app(seed_default_admin=False)
        mongo.cx = self.fake_client
        self.client = self.app.test_client()
        self.addCleanup(self.exit_stack.close)

    def _hash_password(self, password):
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    def _build_seeded_client(self):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        admin_id = ObjectId()
        dept_admin_id = ObjectId()
        lecturer_id = ObjectId()
        user_id = ObjectId()
        course_id = ObjectId()
        paper_id = ObjectId()
        audit_id = ObjectId()
        dept_id = ObjectId()

        users = FakeCollection([
            {
                "_id": admin_id,
                "name": "Super Admin",
                "email": "admin@system.com",
                "password_hash": self._hash_password("admin123"),  # gitleaks:allow
                "role": "super_admin",
                "department": "Administration",
                "department_id": None,
                "must_change_password": False,
            },
            {
                "_id": dept_admin_id,
                "name": "Dept Admin",
                "email": "deptadmin@system.com",
                "password_hash": self._hash_password("deptadmin123"),  # gitleaks:allow
                "role": "department_admin",
                "department": "Computing",
                "department_id": dept_id,
                "must_change_password": False,
            },
            {
                "_id": lecturer_id,
                "name": "Dr. Lecturer",
                "email": "lecturer@system.com",
                "password_hash": self._hash_password("lecturer123"),  # gitleaks:allow
                "role": "lecturer",
                "department": "Computing",
                "department_id": dept_id,
                "pin": "1234",
                "must_change_password": False,
            },
            {
                "_id": user_id,
                "name": "Alice Student",
                "email": "alice@student.com",
                "password_hash": self._hash_password("student123"),  # gitleaks:allow
                "role": "student",
                "department": "Computing",
                "department_id": dept_id,
                "must_change_password": False,
            },
        ])

        courses = FakeCollection([
            {
                "_id": course_id,
                "name": "Master of Computer Applications",
                "code": "MCA",
                "department": "Computing",
                "department_id": dept_id,
                "course_duration": 2,
                "status": "active",
                "year": "2026",
            }
        ])

        departments_col = FakeCollection([
            {
                "_id": dept_id,
                "name": "Computing",
                "code": "COMP",
                "status": "active",
            }
        ])

        papers = FakeCollection([
            {
                "_id": paper_id,
                "name": "Machine Learning",
                "code": "ML-501",
                "course_id": str(course_id),
                "lecturer_id": str(lecturer_id),
                "semester": 1,
                "total_classes": 2,
                "department_id": dept_id,
            }
        ])

        student_profiles = FakeCollection([
            {
                "_id": ObjectId(),
                "user_id": str(user_id),
                "name": "Alice Student",
                "email": "alice@student.com",
                "course_id": str(course_id),
                "academic_year": "2026",
                "academic_session": "2026",
                "year": "2026",
                "current_semester": 1,
                "reg_number": "REG001",
                "roll_number": "R001",
                "enrolled_papers": [str(paper_id)],
                "face_embeddings": [[1.0, 0.0]],
                "photo_urls": [],
                "mobile_no": "9999999999",
            }
        ])

        attendance_logs = FakeCollection([
            {
                "_id": ObjectId(),
                "paper_id": str(paper_id),
                "user_id": str(user_id),
                "lecturer_id": str(lecturer_id),
                "session_id": "sess-1",
                "method": "biometric",
                "timestamp": now - timedelta(days=1),
            }
        ])

        attendance_sessions = FakeCollection([
            {
                "_id": ObjectId(),
                "session_id": "sess-1",
                "paper_id": str(paper_id),
                "lecturer_id": str(lecturer_id),
                "user_ids": [str(user_id)],
                "committed_at": now - timedelta(days=1),
                "rollback_until": now + timedelta(days=1),
                "finalized": False,
                "last_updated_at": now - timedelta(days=1),
            },
            {
                "_id": ObjectId(),
                "session_id": "sess-2",
                "paper_id": str(paper_id),
                "lecturer_id": str(lecturer_id),
                "user_ids": [],
                "committed_at": now - timedelta(days=1),
                "rollback_until": now + timedelta(days=1),
                "finalized": False,
                "last_updated_at": now - timedelta(days=1),
            },
        ])

        audit_logs = FakeCollection([
            {
                "_id": audit_id,
                "action": "CREATE_STUDENT",
                "performed_by": str(admin_id),
                "target_user": str(user_id),
                "details": "Created student",
                "timestamp": now - timedelta(hours=1),
                "rollback": {
                    "kind": "noop",
                    "target": str(user_id),
                },
                "rollback_until": now + timedelta(hours=2),
                "rolled_back": False,
            }
        ])

        attendance = FakeDatabase(
            {
                "attendance_logs": attendance_logs,
                "attendance_sessions": attendance_sessions,
                "background_jobs": FakeCollection([]),
                "exam_eligibility_overrides": FakeCollection([]),
            }
        )
        academic = FakeDatabase({"student_profiles": student_profiles, "courses": courses, "papers": papers, "departments": departments_col})
        auth = FakeDatabase({
            "users": users,
            "failed_login_attempts": FakeCollection([]),
            "ip_rate_limits": FakeCollection([]),
        })
        audit = FakeDatabase({"audit_logs": audit_logs})

        return FakeMongoClient({"biometric_auth": auth, "biometric_academic": academic, "biometric_attendance_ops": attendance, "biometric_audit": audit}), {
            "admin_id": str(admin_id),
            "dept_admin_id": str(dept_admin_id),
            "lecturer_id": str(lecturer_id),
            "user_id": str(user_id),
            "course_id": str(course_id),
            "paper_id": str(paper_id),
            "audit_id": str(audit_id),
            "dept_id": str(dept_id),
        }

    def login(self, email, password):
        response = self.client.post("/api/auth/login", json={"email": email, "password": password})
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        return response.get_json()

    def _csrf_headers(self):
        cookie = self.client.get_cookie("csrf_access_token")
        if not cookie:
            return {}
        return {"X-CSRF-TOKEN": cookie.value}


class AuthFlowTests(BaseApiFlowTestCase):
    def test_notifications_inbox_and_mark_read(self):
        self.login("alice@student.com", "student123")  # gitleaks:allow

        inbox = self.client.get("/api/notifications")
        self.assertEqual(inbox.status_code, 200, inbox.get_data(as_text=True))
        payload = inbox.get_json()
        self.assertGreaterEqual(payload["unread_count"], 1)
        self.assertTrue(payload["items"])
        self.assertEqual(payload["items"][0]["title"], "Welcome to your student inbox")

        mark_all = self.client.post("/api/notifications/read-all", headers=self._csrf_headers())
        self.assertEqual(mark_all.status_code, 200, mark_all.get_data(as_text=True))
        self.assertGreaterEqual(mark_all.get_json()["updated_count"], 1)

        inbox_after = self.client.get("/api/notifications")
        self.assertEqual(inbox_after.status_code, 200, inbox_after.get_data(as_text=True))
        self.assertEqual(inbox_after.get_json()["unread_count"], 0)

    def test_profile_picture_upload_enforces_size_bounds(self):
        self.login("admin@system.com", "admin123")  # gitleaks:allow

        noisy_rgb = np.random.randint(0, 256, (1100, 1500, 3), dtype=np.uint8)
        image = Image.fromarray(noisy_rgb, mode="RGB")
        payload = BytesIO()
        image.save(payload, format="PNG")
        payload.seek(0)

        with tempfile.TemporaryDirectory() as tmp_upload_dir:
            self.app.config["UPLOADS_ABSOLUTE_PATH"] = tmp_upload_dir

            response = self.client.post(
                "/api/auth/profile-picture",
                data={
                    "profile_picture": (payload, "profile.png"),
                },
                content_type="multipart/form-data",
                headers=self._csrf_headers(),
            )

            self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
            body = response.get_json()
            profile_url = body["user"]["profile_picture_url"]
            self.assertTrue(profile_url)

            stored_name = os.path.basename(profile_url.split("?", 1)[0])
            stored_path = os.path.join(tmp_upload_dir, "profile_pictures", stored_name)
            self.assertTrue(os.path.exists(stored_path), stored_path)
            self.assertTrue(stored_name.lower().endswith(".jpg"), stored_name)

            stored_size = os.path.getsize(stored_path)
            self.assertGreaterEqual(stored_size, 100 * 1024)
            self.assertLessEqual(stored_size, 300 * 1024)

            with Image.open(stored_path) as saved_image:
                self.assertEqual(saved_image.format, "JPEG")

    def test_login_me_and_change_password(self):
        login_payload = self.login("admin@system.com", "admin123")
        self.assertEqual(login_payload["user"]["role"], "super_admin")
        self.assertEqual(login_payload["user"]["email"], "admin@system.com")

        me_response = self.client.get("/api/auth/me")
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.get_json()["email"], "admin@system.com")

        change_response = self.client.post(
            "/api/auth/change-password",
            json={
                "current_password": "admin123",
                "new_password": "NewPass123!A",
                "confirm_password": "NewPass123!A",
            },
            headers=self._csrf_headers(),
        )
        self.assertEqual(change_response.status_code, 200, change_response.get_data(as_text=True))

        old_login = self.client.post("/api/auth/login", json={"email": "admin@system.com", "password": "admin123"})
        self.assertNotEqual(old_login.status_code, 200, old_login.get_data(as_text=True))

        new_login = self.client.post("/api/auth/login", json={"email": "admin@system.com", "password": "NewPass123!A"})
        self.assertEqual(new_login.status_code, 200)


    def test_brute_force_lockout_atomic(self):
        email = "admin@system.com"
        wrong_password = "wrongpass"
        threshold = self.app.config.get("LOGIN_LOCKOUT_THRESHOLD", 5)
        lockout_duration = self.app.config.get("LOGIN_LOCKOUT_DURATION_MINUTES", 15)

        # First (threshold - 1) attempts return 401 (wrong password but not yet locked)
        for i in range(threshold - 1):
            resp = self.client.post("/api/auth/login", json={"email": email, "password": wrong_password})
            self.assertEqual(resp.status_code, 401, f"Attempt {i+1} should be unauthorized")

        # The threshold-th attempt records the final failure and locks the account
        resp = self.client.post("/api/auth/login", json={"email": email, "password": wrong_password})
        self.assertEqual(resp.status_code, 429, "Should be locked out at threshold")
        payload = resp.get_json()
        self.assertIn("lockout_until", payload)
        self.assertIn("error", payload)
        self.assertIn("locked", payload["error"].lower())

        # Further attempts remain locked (is_account_locked check fires first)
        resp2 = self.client.post("/api/auth/login", json={"email": email, "password": wrong_password})
        self.assertEqual(resp2.status_code, 429, "Should remain locked out")

        # (Optional) Simulate lockout expiry and verify unlock
        # This would require patching datetime or the protector logic for a full test


class CalendarFlowTests(BaseApiFlowTestCase):
    def test_calendar_extract_publish_and_current(self):
        self.login("deptadmin@system.com", "deptadmin123")  # gitleaks:allow

        with patch("app.routes.calendar.extract_calendar_draft") as mocked_extract:
            mocked_extract.return_value = {
                "year": 2026,
                "source_filename": "calendar.png",
                "raw_text": "Academic calendar draft",
                "holidays": [{"date": "2026-01-26", "label": "Republic Day", "month": "January", "is_optional": False}],
                "optional_holidays": [{"date": "2026-03-08", "label": "Holi", "month": "March", "is_optional": True}],
                "optional_holiday_lines": ["Optional holidays"],
                "sundays": ["2026-01-04", "2026-01-11"],
                "source_dimensions": {"width": 1200, "height": 1600},
            }

            extract_response = self.client.post(
                "/api/calendar/extract",
                data={
                    "department_id": self.seed["dept_id"],
                    "year": "2026",
                    "image": (BytesIO(PNG_1X1), "calendar.png"),
                },
                content_type="multipart/form-data",
                headers=self._csrf_headers(),
            )

        self.assertEqual(extract_response.status_code, 200, extract_response.get_data(as_text=True))
        draft = extract_response.get_json()
        self.assertEqual(draft["department_id"], "")
        self.assertEqual(draft["year"], 2026)
        self.assertEqual(draft["holidays"][0]["label"], "Republic Day")

        save_response = self.client.post(
            "/api/calendar/save",
            json={
                **draft,
                "title": "Academic Calendar 2026",
                "notes": "Verified by department admin",
            },
            headers=self._csrf_headers(),
        )
        self.assertEqual(save_response.status_code, 200, save_response.get_data(as_text=True))
        payload = save_response.get_json()
        self.assertEqual(payload["calendar"]["status"], "published")
        self.assertEqual(payload["calendar"]["title"], "Academic Calendar 2026")

        current_response = self.client.get("/api/calendar/current?year=2026")
        self.assertEqual(current_response.status_code, 200, current_response.get_data(as_text=True))
        current_payload = current_response.get_json()
        self.assertIsNotNone(current_payload["calendar"])
        self.assertEqual(current_payload["calendar"]["title"], "Academic Calendar 2026")
        self.assertIn(current_payload["calendar"].get("department_id"), (None, ""))


class StudentFlowTests(BaseApiFlowTestCase):
    def test_student_profile_attendance_predictions_and_eligibility(self):
        self.login("alice@student.com", "student123")

        profile = self.client.get("/api/student/profile")
        self.assertEqual(profile.status_code, 200)
        payload = profile.get_json()
        self.assertEqual(payload["profile"]["reg_number"], "REG001")
        self.assertEqual(payload["subjects"][0]["paper_code"], "ML-501")

        attendance = self.client.get("/api/student/attendance")
        self.assertEqual(attendance.status_code, 200)
        attendance_payload = attendance.get_json()
        self.assertEqual(attendance_payload[0]["percentage"], 50.0)
        self.assertEqual(attendance_payload[0]["attended"], 1)
        self.assertEqual(attendance_payload[0]["total_classes"], 2)

        predictions = self.client.get("/api/student/predictions")
        self.assertEqual(predictions.status_code, 200)
        predictions_payload = predictions.get_json()
        self.assertEqual(predictions_payload[0]["classes_needed_for_75"], 2)
        self.assertEqual(predictions_payload[0]["safe_bunks_remaining"], 0)

        eligibility = self.client.get("/api/student/exam-eligibility")
        self.assertEqual(eligibility.status_code, 200)
        eligibility_payload = eligibility.get_json()
        self.assertFalse(eligibility_payload[0]["eligible"])
        self.assertEqual(eligibility_payload[0]["status"], "Not Eligible")


class LecturerFlowTests(BaseApiFlowTestCase):
    def test_lecturer_session_lifecycle_recognition_and_adjustment(self):
        self.login("lecturer@system.com", "lecturer123")  # gitleaks:allow

        papers = self.client.get("/api/lecturer/papers")
        self.assertEqual(papers.status_code, 200)
        self.assertEqual(papers.get_json()[0]["code"], "ML-501")

        start = self.client.post("/api/lecturer/session/start", json={"paper_id": self.seed["paper_id"]}, headers=self._csrf_headers())
        self.assertEqual(start.status_code, 200, start.get_data(as_text=True))
        session_id = start.get_json()["session_id"]

        with patch("app.routes.lecturer.cv2.imdecode", return_value=np.zeros((10, 10, 3), dtype=np.uint8)), patch("app.routes.lecturer.cv2.cvtColor", side_effect=lambda img, code: img), patch("app.routes.lecturer.get_detector") as detector_factory, patch("app.routes.lecturer.generate_embeddings_batch", return_value=[[1.0, 0.0]]), patch("app.routes.lecturer.save_classroom_upload_bundle", return_value={"folder_path": "uploads/demo", "original_path": "uploads/demo/original.png", "face_paths": ["uploads/demo/face-1.png"]}):
            detector = type("Detector", (), {"detect_faces": lambda self, img: [{"crop": np.zeros((10, 10, 3), dtype=np.uint8)}]})()
            detector_factory.return_value = detector
            upload = self.client.post(
                "/api/lecturer/session/recognize-image",
                data={
                    "session_id": session_id,
                    "image": (BytesIO(PNG_1X1), "classroom.png"),
                },
                content_type="multipart/form-data",
                headers=self._csrf_headers(),
            )
        self.assertEqual(upload.status_code, 200, upload.get_data(as_text=True))
        upload_payload = upload.get_json()
        self.assertEqual(upload_payload["faces_detected"], 1)
        self.assertEqual(upload_payload["new_matches"][0]["user_id"], self.seed["user_id"])

        commit = self.client.post("/api/lecturer/session/commit", json={"session_id": session_id, "pin": "1234"}, headers=self._csrf_headers())
        self.assertEqual(commit.status_code, 200, commit.get_data(as_text=True))
        commit_payload = commit.get_json()
        self.assertEqual(commit_payload["students_marked"], 1)

        self.login("alice@student.com", "student123")  # gitleaks:allow
        inbox = self.client.get("/api/notifications")
        self.assertEqual(inbox.status_code, 200, inbox.get_data(as_text=True))
        inbox_payload = inbox.get_json()
        attendance_notification = next(
            (item for item in inbox_payload["items"] if item.get("template_key") == "attendance_session_committed"),
            None,
        )
        self.assertIsNotNone(attendance_notification)
        self.assertIn("Machine Learning [ML-501]", attendance_notification["body"])
        self.assertIn("marked Present", attendance_notification["body"])
        self.assertIn("Dr. Lecturer", attendance_notification["body"])

        review = self.client.get(f"/api/lecturer/session/{session_id}/review")
        self.assertEqual(review.status_code, 200)
        review_payload = review.get_json()
        self.assertTrue(review_payload["editable"])
        self.assertEqual(review_payload["students_marked"], 1)

        adjust = self.client.put(
            f"/api/lecturer/session/{session_id}/adjust",
            json={"pin": "1234", "user_ids": []},
            headers=self._csrf_headers(),
        )
        self.assertEqual(adjust.status_code, 200, adjust.get_data(as_text=True))
        adjusted_review = adjust.get_json()["review"]
        self.assertEqual(adjusted_review["students_marked"], 0)


class AdminFlowTests(BaseApiFlowTestCase):
    def test_admin_upload_student_photo_applies_exif_orientation(self):
        self.login("admin@system.com", "admin123")

        # Build a landscape image tagged with EXIF orientation=6 (rotate 90deg CW).
        noisy_rgb = np.random.randint(0, 256, (1000, 1400, 3), dtype=np.uint8)
        image = Image.fromarray(noisy_rgb, mode="RGB")
        exif = image.getexif()
        exif[274] = 6
        payload = BytesIO()
        image.save(payload, format="JPEG", exif=exif.tobytes())
        payload.seek(0)

        with tempfile.TemporaryDirectory() as tmp_upload_dir:
            self.app.config["UPLOAD_FOLDER"] = tmp_upload_dir

            response = self.client.post(
                "/api/admin/students/upload-photo",
                data={
                    "student_name": "Exif Student",
                    "image": (payload, "orientation.jpg"),
                },
                content_type="multipart/form-data",
                headers=self._csrf_headers(),
            )

            self.assertEqual(response.status_code, 201, response.get_data(as_text=True))
            saved_path = response.get_json()["file_path"]
            self.assertTrue(os.path.exists(saved_path), saved_path)
            saved_size = os.path.getsize(saved_path)
            self.assertGreaterEqual(saved_size, 100 * 1024)
            self.assertLessEqual(saved_size, 300 * 1024)

            with Image.open(saved_path) as saved_image:
                # EXIF transpose should make the final stored image portrait.
                self.assertGreater(saved_image.height, saved_image.width)

    def test_admin_face_enrollment_rejects_invalid_image(self):
        self.login("admin@system.com", "admin123")

        response = self.client.post(
            "/api/admin/students/enroll",
            json={
                "user_id": self.seed["user_id"],
                "photo": "data:image/png;base64,not-a-valid-image",
            },
            headers=self._csrf_headers(),
        )

        self.assertEqual(response.status_code, 400, response.get_data(as_text=True))
        self.assertIn("Invalid image format", response.get_json()["error"])

    def test_admin_stats_enrollment_matrix_export_and_rollback(self):
        self.login("admin@system.com", "admin123")

        stats = self.client.get("/api/admin/stats")
        self.assertEqual(stats.status_code, 200)
        stats_payload = stats.get_json()
        self.assertEqual(stats_payload["total_students"], 1)
        self.assertEqual(stats_payload["total_lecturers"], 1)
        self.assertEqual(stats_payload["total_courses"], 1)
        self.assertEqual(stats_payload["total_papers"], 1)

        with patch("app.routes.admin.attendance._build_attendance_matrix_payload", return_value={
            "options": {
                "courses": [{"_id": self.seed["course_id"], "name": "Master of Computer Applications", "status": "active"}],
                "academic_sessions": ["2026"],
                "semesters": [1],
            },
            "meta": {"students_count": 1, "dates_count": 1, "sessions_count": 1},
            "dates": [
                {
                    "date": "12 Apr",
                    "subjects": [
                        {"column_key": "col-1", "subject_code": "ML-501", "subject_name": "Machine Learning", "label": "ML-501"},
                    ],
                }
            ],
            "rows": [
                {
                    "user_id": self.seed["user_id"],
                    "roll_no": "R001",
                    "name": "Alice Student",
                    "cells": {"col-1": "P"},
                }
            ],
        }):
            matrix = self.client.get("/api/admin/attendance-matrix", query_string={"course_id": self.seed["course_id"], "academic_session": "2026", "semester": "1"})
            self.assertEqual(matrix.status_code, 200)
            matrix_payload = matrix.get_json()
            self.assertEqual(matrix_payload["meta"]["students_count"], 1)

            csv_response = self.client.get(
                "/api/admin/attendance-matrix/export-csv",
                query_string={"course_id": self.seed["course_id"], "academic_session": "2026", "semester": "1"},
            )
            self.assertEqual(csv_response.status_code, 200)
            self.assertEqual(csv_response.headers.get("Content-Type", "").split(";")[0], "text/csv")

            xlsx_response = self.client.get(
                "/api/admin/attendance-matrix/export",
                query_string={"course_id": self.seed["course_id"], "academic_session": "2026", "semester": "1"},
            )
            self.assertEqual(xlsx_response.status_code, 200)
            self.assertIn("spreadsheetml.sheet", xlsx_response.headers.get("Content-Type", ""))

        with patch("app.routes.admin.enrollment.get_detector") as detector_factory, patch("app.routes.admin.enrollment.generate_embedding", return_value=[1.0, 0.0]), patch("app.routes.admin.enrollment.save_cropped_face_dataset", return_value=["dataset/alice/face-1.png"]):
            detector = type("Detector", (), {"detect_faces": lambda self, img: [{"crop": np.zeros((10, 10, 3), dtype=np.uint8)}]})()
            detector_factory.return_value = detector
            enroll = self.client.post(
                "/api/admin/students/enroll",
                json={
                    "user_id": self.seed["user_id"],
                    "photo": "data:image/png;base64," + base64.b64encode(PNG_1X1).decode(),
                    "dataset_photos": ["data:image/png;base64," + base64.b64encode(PNG_1X1).decode()],
                },
                headers=self._csrf_headers(),
            )
        self.assertEqual(enroll.status_code, 200, enroll.get_data(as_text=True))
        enroll_payload = enroll.get_json()
        self.assertEqual(enroll_payload["faces_detected"], 1)
        self.assertGreaterEqual(enroll_payload["dataset_saved_count"], 1)

        with patch("app.routes.admin.attendance.get_audit_log_by_id", return_value={
            "_id": ObjectId(self.seed["audit_id"]),
            "action": "CREATE_STUDENT",
            "timestamp": datetime.now(timezone.utc) - timedelta(hours=1),
            "rollback": {"kind": "noop"},
            "rollback_until": datetime.now(timezone.utc) + timedelta(hours=1),
            "rolled_back": False,
        }), patch("app.routes.admin.attendance._execute_rollback_operation", side_effect=lambda payload: None), patch("app.routes.admin.attendance.log_action", side_effect=lambda *args, **kwargs: None):
            rollback = self.client.post(f"/api/admin/audit-logs/{self.seed['audit_id']}/rollback")
            rollback = self.client.post(f"/api/admin/audit-logs/{self.seed['audit_id']}/rollback", headers=self._csrf_headers())
        self.assertEqual(rollback.status_code, 200, rollback.get_data(as_text=True))
        self.assertEqual(rollback.get_json()["message"], "Rollback completed successfully")


if __name__ == "__main__":
    unittest.main()
