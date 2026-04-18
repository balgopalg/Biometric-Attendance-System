# Testing Guide — Complete Test Harness

This project includes a comprehensive, deterministic end-to-end test suite covering backend API logic and frontend browser workflows. All tests run without external dependencies (live database, camera hardware, or backend server).

## Test Architecture Overview

### Backend Tests: `pytest`
- **Framework:** Python `pytest`
- **Coverage:** Comprehensive coverage including RBAC permission chains, routing logic, authentication tokens, and queue resilience.
- **Status:** ✅ 36 tests passing

### Frontend Tests: `frontend/tests/e2e/project-flows.spec.js`
- **Framework:** Playwright 1.54.2 with Chromium browser
- **Mocking:** API route interception via `page.route()` + browser stubs (camera, canvas)
- **Coverage:** 7 integrated browser workflows covering login/navigation, attendance sessions, enrollment/exports/rollback, and UX/Accessibility rendering.
- **Status:** ✅ 7 tests passing

---

## Quick Start

### Run Backend Tests

```bash
cd backend
pytest tests/ -v
```

**Expected Output:**
```
============================= test session starts ==============================
collected 36 items

tests/test_api_flows.py::AuthFlowTests::test_auth_login_me_and_change_password PASSED [  2%]
...
tests/test_rbac.py::TestEffectiveAllowedRoles::test_lecturer_includes_higher PASSED [ 44%]
...
======================= 36 passed, 2 warnings in 25.14s =======================
```

### Run Frontend Tests

```bash
cd frontend
npm run test:e2e
```

**Expected Output:**
```
Running 7 tests using 4 workers
[1/7] [chromium] › tests\e2e\project-flows.spec.js:714:3 › Project end-to-end flows › login and navigation
[2/7] [chromium] › tests\e2e\ux-accessibility.spec.js:211:3 › UX and accessibility hardening checks › supports keyboard-first navigation on login screen
...
  7 passed (28s)
```

---

## Backend Test Suite Details

### File Location
`backend/tests/test_api_flows.py` (606 lines)

### Test Structure

#### 1. **Fake MongoDB Client** (Replaces live MongoDB)
- `FakeCollection`: In-memory CRUD with query matching, projections, and operators
  - Supports: `$or`, `$exists`, `$in`, `$set`, `$inc`, `$push`, `$addToSet`
  - Implements: `insert_one()`, `find()`, `find_one()`, `update_one()`, `delete_one()`, `count_documents()`
- `FakeDatabase`: Collection factory with auto-create
- `FakeMongoClient`: Database registry

#### 2. **BaseApiFlowTestCase** (Shared Test Infrastructure)
- Patches Flask startup: `init_app`, `_bootstrap_isolated_databases`, `_ensure_indexes`, `_run_startup_health_checks`
- Injects `FakeMongoClient` as `mongo.cx`
- Seeds test data: admin, lecturer, student, course, paper, attendance sessions, audit logs
- Helper methods: `login(email, password)`, `_csrf_headers()`

#### 3. **Test Suites**

**AuthFlowTests**
- Login with valid credentials → 200 OK
- GET `/api/auth/me` → profile data
- Change password → new password succeeds, old password fails

**StudentFlowTests**
- Login as student (alice@student.com)
- GET `/api/student/profile` → reg_number, enrolled courses
- GET `/api/student/attendance` → attendance percentage (50%)
- GET `/api/student/predictions` → classes needed for 75% (2)
- GET `/api/student/exam-eligibility` → eligibility status

**LecturerFlowTests**
- Login as lecturer (lecturer@system.com)
- GET `/api/lecturer/papers` → list of teaching papers
- POST `/api/lecturer/session/start` → session_id, paper details
- POST `/api/lecturer/session/recognize-image` (multipart) → detected students
- POST `/api/lecturer/session/commit` (with PIN) → attendance committed
- GET `/api/lecturer/session/{id}/review` → session review data
- PUT `/api/lecturer/session/{id}/adjust` → adjust attendance records

**AdminFlowTests**
- Login as admin (admin@system.com)
- GET `/api/admin/stats` → system statistics
- GET `/api/admin/attendance-matrix` → attendance grid
- GET `/api/admin/attendance-matrix/export-csv` → CSV download
- GET `/api/admin/attendance-matrix/export` → XLSX download
- POST `/api/admin/students/enroll` (multipart image) → face enrollment
- POST `/api/admin/audit-logs/{id}/rollback` → rollback operation

### Mocked Components
- `cv2.imdecode()`, `cv2.cvtColor()` — image processing stubs
- `get_detector()` — face detector stub
- `generate_embedding()` — face embedding stub
- `save_classroom_upload_bundle()` — file I/O stub

### Running Specific Test
```bash
python -m unittest backend.tests.test_api_flows.AuthFlowTests -v
```

---

## Frontend Test Suite Details

### File Location
`frontend/tests/e2e/project-flows.spec.js` (~740 lines)

### Test Structure

#### 1. **Browser Stubs** (Replaces hardware)
- `navigator.mediaDevices.getUserMedia()` — fake camera stream
- `canvas.toDataURL()` — fake image capture
- `HTMLVideoElement.play()`, `videoWidth`, `videoHeight` — video element stubs

#### 2. **API Mocking** (Stateful route interception)
- `page.route('**/api/**')` intercepts all API calls
- Returns mocked responses for:
  - POST `/auth/login` — role-based user return
  - GET `/admin/stats` — dashboard metrics
  - POST `/lecturer/session/start` — session initialization
  - POST `/lecturer/session/recognize-image` — face detection results
  - POST `/lecturer/session/commit` — attendance commit
  - POST `/admin/students/enroll` — enrollment with 50 faces processed
  - etc.
- Maintains `sessionState` object to track rollback, session ID, enrollment status

#### 3. **Test Scenarios**

**Test 1: Login and Navigation**
- Install camera stubs and API mocks
- Login as admin (admin@system.com / admin123)
- Verify "Admin Dashboard" heading visible
- Navigate to Students page → expect "Students" heading
- Navigate to Enrollment page → expect "Face Enrollment" heading

**Test 2: Attendance Session Lifecycle**
- Login as lecturer (lecturer@system.com / lecturer123)
- Click "Take Attendance"
- Start session → Pause
- Upload image file (fake PNG)
- Recognize image → expect "Recognized Students (1)"
- Commit attendance with PIN 1234
- Review session details
- Re-commit adjustments with PIN 1234 again
- Verify "Attendance updated and re-committed successfully"

**Test 3: Enrollment, Exports, and Rollback**
- Login as admin
- Navigate to Enrollment
- Search and select student "Alice Student"
- Upload face image
- Click "Extract & Store Embedding" (face enrollment)
- Expect "Face enrolled successfully"
- Navigate to Attendance Matrix
- Select course/session/semester dropdowns
- Download CSV export
- Download XLSX export
- Navigate to Audit Log
- Click Rollback button
- Confirm rollback dialog
- Verify "Rolled Back" badge in audit table

### Running Specific Test
```bash
cd frontend
npx playwright test project-flows.spec.js -g "Login and navigation"
```

### View Test Results
```bash
# Interactive test report
npx playwright show-report
```

### Debug Mode
```bash
# Pause on failures, open Inspector
npx playwright test --debug
```

---

## Test Data & Fixtures

### Backend Seeded Users
| Role | Email | Password | Function |
|------|-------|----------|----------|
| Admin | admin@system.com | admin123 | System administration, enrollment, exports |
| Lecturer | lecturer@system.com | lecturer123 | Attendance sessions, student recognition |
| Student | alice@student.com | student123 | Profile, attendance records, eligibility |

### Backend Seeded Data
- 1 Course: "MCA" (course_code: MCA)
- 1 Paper: "Data Structures" (paper_code: DS101)
- 1 Student: "Alice" (reg_number: REG001)
- 2 Attendance Sessions: 1 attended, 1 absent
- 1 Audit Log: Rollback operation record

### Frontend User Fixtures
```javascript
const adminUser = { email: 'admin@system.com', role: 'admin', password: 'admin123' };
const lecturerUser = { email: 'lecturer@system.com', role: 'lecturer', password: 'lecturer123' };
const studentUser = { email: 'alice@student.com', role: 'student', password: 'student123' };
```

---

## Extending Tests

### Add Backend Test
1. Add method to appropriate test class in `backend/tests/test_api_flows.py`
2. Use `self.client` to make requests
3. Use `_csrf_headers()` for unsafe operations
4. Check responses with `self.assertEqual()`

Example:
```python
def test_lecturer_bulk_mark_attendance(self):
    self.login('lecturer@system.com', 'lecturer123')
    response = self.client.post(
        '/api/lecturer/session/1/mark-bulk',
        json={'user_ids': [self.seed['user_id']]},
        headers=self._csrf_headers()
    )
    self.assertEqual(response.status_code, 200)
```

### Add Frontend Test
1. Add new `test('...', async ({ page }) => {...})` block in `frontend/tests/e2e/project-flows.spec.js`
2. Use page fixtures and helper functions (loginAs, installApiMocks, etc.)
3. Use Playwright selectors: `getByRole()`, `getByLabel()`, `locator()`, `fill()`, `click()`, `expect()`

Example:
```javascript
test('Student can view attendance history', async ({ page }) => {
  await installCameraStubs(page);
  const sessionState = await installApiMocks(page);
  await loginAs(page, 'student');
  
  await page.getByRole('link', { name: 'Attendance History' }).click();
  await expect(page.getByText('Session 1')).toBeVisible();
});
```

---

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r backend/requirements.txt
      - run: python -m unittest discover -s backend/tests -p "test_*.py"

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd frontend && npm ci
      - run: cd frontend && npx playwright install --with-deps chromium
      - run: cd frontend && npm run test:e2e
```

---

## Troubleshooting

### Backend Tests Fail
- **CSRF token errors:** Ensure `_csrf_headers()` is called for POST/PUT/DELETE requests
- **Import errors:** Verify `app/` package structure and `requirements.txt` dependencies
- **Assertion failures:** Check seeded data (ObjectIDs, test user credentials) in `_build_seeded_client()`

### Frontend Tests Timeout
- **Selector not found:** Verify exact element text/role in browser DevTools or Playwright error screenshot
- **API mock not working:** Check route pattern in `page.route()` and response JSON format
- **Test duration >30s:** Optimize mock responses or reduce test complexity

### Browser Hangs at Login
- **Element not visible:** Check that camera/API mocks are installed before `loginAs()`
- **Selector syntax:** Use exact text or ID selectors; avoid fragile role+name combinations

---

## Test Artifacts

### Backend
- Test output: stdout (assertion errors, Python tracebacks)
- Coverage: no dedicated coverage tool is wired by default; configure one explicitly if required

### Frontend
- Traces: `test-results/` directory (on-first-retry mode)
- Videos: `test-results/` (retain-on-failure mode)
- Screenshots: `test-results/` (only-on-failure mode)
- Report: `npx playwright show-report` (opens HTML report)

---

## Summary

| Aspect | Backend | Frontend |
|--------|---------|----------|
| Framework | pytest | Playwright + React |
| Tests | 36 integrated tests | 7 scenarios |
| Status | ✅ 36/36 passing | ✅ 7/7 passing |
| Runtime | ~25s | ~28s |

**Both suites are deterministic, stable over variable compilation latencies, and ready for CI/CD integration.**
