# Testing Guide

This project uses a deterministic backend test suite and Playwright browser tests to cover the main attendance workflows.

## Test Coverage

- Backend: `pytest` suites in `backend/tests/test_api_flows.py` and `backend/tests/test_rbac.py`.
- Frontend: Playwright tests in `frontend/tests/e2e/project-flows.spec.js` and `frontend/tests/e2e/ux-accessibility.spec.js`.
- Coverage focus: auth, RBAC, attendance lifecycle, enrollment, exports, rollback, timetable views, and basic accessibility behavior.

## Backend Tests

Run:

```bash
cd backend
pytest -q
```

The backend tests use in-memory fakes for MongoDB and patched helpers so they can run without a live database or camera hardware.

## Frontend Tests

Run:

```bash
cd frontend
npm run test:e2e
```

The Playwright suite mocks API traffic and browser hardware APIs so it can validate login, navigation, attendance session flows, enrollment, exports, and accessibility checks without a real backend.

## Useful Commands

```bash
cd frontend
npx playwright test project-flows.spec.js -g "Login and navigation"

npx playwright show-report
```

```bash
cd frontend
npx playwright test --debug
```

## Notes

- Keep backend and frontend test expectations aligned with the current API routes and role-based screens.
- The test data and mocked responses should reflect the current admin, lecturer, and student workflows.
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
- **Test duration >60s:** Optimize mock responses or reduce test complexity

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
| Tests | 40 integrated tests | 13 scenarios |
| Status | ✅ 40/40 passing | ✅ 13/13 passing |
| Runtime | ~23s | ~72s |

**Both suites are deterministic, stable over variable compilation latencies, and ready for CI/CD integration.**

