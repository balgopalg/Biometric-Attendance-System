# Backend Test Suite

## Overview

This directory contains comprehensive API flow tests for the biometric attendance system backend. Tests use a **fake MongoDB client** to validate route logic without requiring a live database.

## Files

- `__init__.py` — Package marker
- `test_api_flows.py` — Complete test suite with 4 integrated flows

## Quick Run

```bash
# From backend directory
python -m unittest tests.test_api_flows -v
```

## Test Structure

### 1. Fake MongoDB Client
- Implements PyMongo API: `insert_one()`, `find()`, `find_one()`, `update_one()`, `delete_one()`
- Supports query operators: `$or`, `$exists`, `$in`
- Supports update operators: `$set`, `$inc`, `$push`, `$addToSet`
- No network calls; all operations in-memory

### 2. Seeded Test Data
Before each test, `_build_seeded_client()` populates the fake database with:
- 1 Admin user (admin@system.com)
- 1 Lecturer (lecturer@system.com)
- 1 Student (alice@student.com)
- 1 Course, 1 Paper, 1 Student Profile
- 2 Attendance sessions (1 attended, 1 absent)
- 1 Audit log entry

### 3. Test Suites (4 tests)

| Suite | Tests | Coverage |
|-------|-------|----------|
| `AuthFlowTests` | Login, profile, password change | Auth routes, session mgmt |
| `StudentFlowTests` | Profile, attendance, predictions, eligibility | Student dashboard APIs |
| `LecturerFlowTests` | Session lifecycle, recognition, commit, adjust | Attendance recording |
| `AdminFlowTests` | Stats, matrix, exports, enrollment, rollback | Admin operations |

## Key Helpers

### `_csrf_headers()`
Extracts CSRF token from session cookies and returns header dict for unsafe requests.

```python
headers = self._csrf_headers()
response = self.client.post('/api/...', headers=headers, json={...})
```

### `login(email, password)`
Posts to `/api/auth/login` and verifies 200 response.

```python
user_data = self.login('admin@system.com', 'admin123')
self.assertIn('user_id', user_data)
```

## Mocked Components

- `cv2.imdecode()` → returns zeros array (fake image)
- `cv2.cvtColor()` → identity function
- `get_detector()` → mock detector object
- `generate_embedding()` → mock embedding vector
- `save_classroom_upload_bundle()` → no-op

## Extending Tests

### Add New Test Method

```python
class StudentFlowTests(BaseApiFlowTestCase):
    def test_student_view_transcript(self):
        """Test student transcript retrieval."""
        self.login('alice@student.com', 'student123')
        response = self.client.get('/api/student/transcript')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn('courses', data)
        self.assertIn('gpa', data)
```

## Debugging Failed Tests

1. **Check seeded data:** Print `seed` dict in test to verify IDs
2. **Inspect fake client:** Add `print(mongo.cx.db.collection.find())` to view in-memory state
3. **Verify CSRF:** Ensure `_csrf_headers()` is called for POST/PUT/DELETE
4. **Check assertions:** Compare actual vs. expected response JSON

## Dependencies

Ensure `backend/requirements.txt` includes:
- `Flask`
- `flask-pymongo` (or similar MongoDB abstraction)
- `bcrypt` (for password hashing)
- `numpy` (for fake image arrays)
- `opencv-python` (cv2)

## CI/CD

Run in GitHub Actions, GitLab CI, or any CI platform:

```bash
pip install -r backend/requirements.txt
python -m unittest discover -s backend/tests -p "test_*.py"
```
