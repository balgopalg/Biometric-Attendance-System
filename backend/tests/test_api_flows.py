from __future__ import annotations

import base64
import copy
import unittest
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
from io import BytesIO
from unittest.mock import patch

import bcrypt
import numpy as np
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

    def find_one(self, query=None, projection=None):
        for doc in self.docs:
            if self._match(doc, query or {}):
                return self._project(doc, projection)
        return None

    def find(self, query=None, projection=None):
        return [self._project(doc, projection) for doc in self.docs if self._match(doc, query or {})]

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

    def _build_upsert_doc(self, query, update):
        doc = {key: copy.deepcopy(value) for key, value in query.items() if not key.startswith("$")}
        if "_id" not in doc:
            doc["_id"] = ObjectId()
        self._apply_update(doc, update)
        return doc

    def _apply_update(self, doc, update):
        for operator, payload in update.items():
            if operator == "$set":
                for key, value in payload.items():
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
        self.exit_stack.enter_context(patch("app._bootstrap_isolated_databases", autospec=True, side_effect=lambda *args, **kwargs: None))
        self.exit_stack.enter_context(patch("app._ensure_indexes", autospec=True, side_effect=lambda *args, **kwargs: None))
        self.exit_stack.enter_context(patch("app._run_startup_health_checks", autospec=True, side_effect=lambda *args, **kwargs: None))
        self.exit_stack.enter_context(patch("app._seed_admin", autospec=True, side_effect=lambda *args, **kwargs: None))

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
        lecturer_id = ObjectId()
        user_id = ObjectId()
        course_id = ObjectId()
        paper_id = ObjectId()
        audit_id = ObjectId()

        users = FakeCollection([
            {
                "_id": admin_id,
                "name": "System Admin",
                "email": "admin@system.com",
                "password_hash": self._hash_password("admin123"),
                "role": "admin",
                "department": "Administration",
                "must_change_password": False,
            },
            {
                "_id": lecturer_id,
                "name": "Dr. Lecturer",
                "email": "lecturer@system.com",
                "password_hash": self._hash_password("lecturer123"),
                "role": "lecturer",
                "department": "Computing",
                "pin": "1234",
                "must_change_password": False,
            },
            {
                "_id": user_id,
                "name": "Alice Student",
                "email": "alice@student.com",
                "password_hash": self._hash_password("student123"),
                "role": "student",
                "department": "Computing",
                "must_change_password": False,
            },
        ])

        courses = FakeCollection([
            {
                "_id": course_id,
                "name": "Master of Computer Applications",
                "code": "MCA",
                "department": "Computing",
                "course_duration": 2,
                "status": "active",
                "year": "2026",
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
        academic = FakeDatabase({"student_profiles": student_profiles, "courses": courses, "papers": papers})
        auth = FakeDatabase({"users": users})
        audit = FakeDatabase({"audit_logs": audit_logs})

        return FakeMongoClient({"biometric_auth": auth, "biometric_academic": academic, "biometric_attendance_ops": attendance, "biometric_audit": audit}), {
            "admin_id": str(admin_id),
            "lecturer_id": str(lecturer_id),
            "user_id": str(user_id),
            "course_id": str(course_id),
            "paper_id": str(paper_id),
            "audit_id": str(audit_id),
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
    def test_login_me_and_change_password(self):
        login_payload = self.login("admin@system.com", "admin123")
        self.assertEqual(login_payload["user"]["role"], "admin")
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

        # Fail login up to threshold
        for i in range(threshold):
            resp = self.client.post("/api/auth/login", json={"email": email, "password": wrong_password})
            self.assertEqual(resp.status_code, 401, f"Attempt {i+1} should be unauthorized")

        # The next attempt should lock the account
        resp = self.client.post("/api/auth/login", json={"email": email, "password": wrong_password})
        self.assertEqual(resp.status_code, 429, "Should be locked out at threshold")
        payload = resp.get_json()
        self.assertIn("lockout_until", payload)
        self.assertIn("error", payload)
        self.assertIn("locked", payload["error"].lower())

        # Further attempts remain locked
        resp2 = self.client.post("/api/auth/login", json={"email": email, "password": wrong_password})
        self.assertEqual(resp2.status_code, 429, "Should remain locked out")

        # (Optional) Simulate lockout expiry and verify unlock
        # This would require patching datetime or the protector logic for a full test


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
        self.login("lecturer@system.com", "lecturer123")

        papers = self.client.get("/api/lecturer/papers")
        self.assertEqual(papers.status_code, 200)
        self.assertEqual(papers.get_json()[0]["code"], "ML-501")

        start = self.client.post("/api/lecturer/session/start", json={"paper_id": self.seed["paper_id"]}, headers=self._csrf_headers())
        self.assertEqual(start.status_code, 200, start.get_data(as_text=True))
        session_id = start.get_json()["session_id"]

        with patch("app.routes.lecturer.cv2.imdecode", return_value=np.zeros((10, 10, 3), dtype=np.uint8)), patch("app.routes.lecturer.cv2.cvtColor", side_effect=lambda img, code: img), patch("app.routes.lecturer.get_detector") as detector_factory, patch("app.routes.lecturer.generate_embedding", return_value=[1.0, 0.0]), patch("app.routes.lecturer.save_classroom_upload_bundle", return_value={"folder_path": "uploads/demo", "original_path": "uploads/demo/original.png", "face_paths": ["uploads/demo/face-1.png"]}):
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

        with patch("app.routes.admin._build_attendance_matrix_payload", return_value={
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

        with patch("app.routes.admin.get_detector") as detector_factory, patch("app.routes.admin.generate_embedding", return_value=[1.0, 0.0]), patch("app.routes.admin.save_cropped_face_dataset", return_value=["dataset/alice/face-1.png"]):
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

        with patch("app.routes.admin.get_audit_log_by_id", return_value={
            "_id": ObjectId(self.seed["audit_id"]),
            "action": "CREATE_STUDENT",
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1),
            "rollback": {"kind": "noop"},
            "rollback_until": datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1),
            "rolled_back": False,
        }), patch("app.routes.admin._execute_rollback_operation", side_effect=lambda payload: None), patch("app.routes.admin.log_action", side_effect=lambda *args, **kwargs: None):
            rollback = self.client.post(f"/api/admin/audit-logs/{self.seed['audit_id']}/rollback")
            rollback = self.client.post(f"/api/admin/audit-logs/{self.seed['audit_id']}/rollback", headers=self._csrf_headers())
        self.assertEqual(rollback.status_code, 200, rollback.get_data(as_text=True))
        self.assertEqual(rollback.get_json()["message"], "Rollback completed successfully")


if __name__ == "__main__":
    unittest.main()
