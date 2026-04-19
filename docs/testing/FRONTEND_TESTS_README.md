# Frontend E2E Test Suite

## Overview

This directory contains end-to-end browser tests using **Playwright** for the biometric attendance system frontend. Tests run against the React app without requiring a live backend—all API calls are intercepted and mocked.

## Files

- `e2e/` — End-to-end browser test scenarios
  - `project-flows.spec.js` — 3 integrated user workflows (roles, sessions, enrollment, export)
  - `ux-accessibility.spec.js` — 4 integrated UX/accessibility scenarios (mobile overflow constraints, keyboard a11y, contrast)

## Quick Run

```bash
# From frontend directory
npm run test:e2e

# Or run specific test
npx playwright test project-flows -g "Login and navigation"

# View test results
npx playwright show-report
```

## Test Scenarios (7 tests across 2 files)

### `project-flows.spec.js` (3 workflows)

### Test 1: Login and Navigation
- Install browser stubs (camera, canvas)
- Install API mocks (routes)
- Login as admin (admin@system.com / admin123)
- Verify Dashboard page visible
- Navigate to Students page
- Navigate to Enrollment page
- **Coverage:** Route navigation, header/sidebar rendering

### Test 2: Attendance Session Lifecycle
- Login as lecturer (lecturer@system.com / lecturer123)
- Click "Take Attendance"
- Start session
- Pause session
- Upload classroom image (fake PNG)
- Recognize students in image
- Commit attendance with PIN 1234
- Review session details
- Re-commit with adjusted students
- **Coverage:** Form submission, multipart uploads, modal dialogs, PIN input

### Test 3: Enrollment, Exports, and Rollback
- Login as admin
- Navigate to Enrollment page
- Search for student "Alice"
- Select student (keyboard arrow + Enter)
- Upload face image
- Click "Extract & Store Embedding"
- Verify "Face enrolled successfully"
- Navigate to Attendance Matrix
- Select course/session/semester dropdowns
- Download CSV export
- Download XLSX export
- Navigate to Audit Log
- Click Rollback button on audit entry
- Confirm rollback dialog
- Verify "Rolled Back" status badge
- **Coverage:** File upload/download, table interactions, enrollment workflow, rollback operation

### `ux-accessibility.spec.js` (4 scenarios)

- **Scenario 1:** supports keyboard-first navigation on login screen
- **Scenario 2:** maintains accessible contrast on key login texts
- **Scenario 3:** keeps admin dashboard mobile-safe without horizontal overflow
- **Scenario 4:** keeps lecturer session actions usable on mobile

## Key Configuration

### `playwright.config.js`
- **Base URL:** https://127.0.0.1:4173 (Vite HTTPS preview server)
- **Browser:** Chromium
- **Artifacts:** Traces on-first-retry, screenshots/videos on-failure
- **Timeout:** 60s per test
- **Execution mode:** Serial-safe (`workers: 1`, `fullyParallel: false`)
- **TLS handling:** `ignoreHTTPSErrors: true` for self-signed local certs

### Test Fixtures & Helpers

#### `installCameraStubs(page)`
Injects fake camera/video/canvas APIs so tests don't require real hardware.

```javascript
await installCameraStubs(page);
// Now navigator.mediaDevices.getUserMedia(), canvas.toDataURL(), etc. are mocked
```

#### `installApiMocks(page)`
Intercepts all `/api/**` calls and returns mocked responses. Maintains `sessionState` for multi-step workflows.

```javascript
const sessionState = await installApiMocks(page);
// All subsequent API calls are answered with mock data
```

#### `loginAs(page, role)`
Helper to fill login form and navigate to dashboard.

```javascript
await loginAs(page, 'admin');  // Logs in as admin@system.com / admin123
await loginAs(page, 'lecturer');
await loginAs(page, 'student');
```

## Test Data

### User Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@system.com | admin123 |
| Lecturer | lecturer@system.com | lecturer123 |
| Student | alice@student.com | student123 |

### API Mock Responses

All API responses are stateful and tracked in `sessionState`:

| Route | Method | Response |
|-------|--------|----------|
| `/auth/login` | POST | User object (admin/lecturer/student) |
| `/admin/stats` | GET | Dashboard metrics (students, lecturers, uptime) |
| `/lecturer/session/start` | POST | session_id, paper details |
| `/lecturer/session/recognize-image` | POST | new_matches (detected students), faces_detected |
| `/lecturer/session/commit` | POST | students_marked, rollback_until timestamp |
| `/admin/students/enroll` | POST | dataset_saved_count=50, faces_detected=1 |
| `/admin/attendance-matrix` | GET | Attendance grid data |
| `/admin/audit-logs/{id}/rollback` | POST | status, rollback_id |

## Extending Tests

### Add New Test Scenario

```javascript
test('Student can view course materials', async ({ page }) => {
  // Install mocks
  await installCameraStubs(page);
  const sessionState = await installApiMocks(page);
  
  // Login
  await loginAs(page, 'student');
  
  // Mock new API route
  await page.route('**/api/student/course-materials', async (route) => {
    await route.abort('aborted');  // Or mock response
  });
  
  // Navigate and verify
  await page.getByRole('link', { name: 'Course Materials' }).click();
  await expect(page.getByText('Data Structures')).toBeVisible();
});
```

### Selector Strategy

**Prefer:** Exact IDs or role+name combinations
```javascript
page.locator('#login-email')  // Most stable
page.getByRole('button', { name: 'Sign In' })  // Good
```

**Avoid:** Fragile text/index selectors
```javascript
page.locator('button:nth-child(1)')  // Brittle
page.getByText('Click here')  // Breaks if text changes
```

**Scope when needed:** Use region to avoid strict-mode collisions
```javascript
page.getByRole('main').getByRole('heading', { name: 'Students' })
```

## Running Tests Locally

### Prerequisites
```bash
cd frontend
npm ci
npx playwright install chromium
```

### Run All Tests
```bash
npm run test:e2e
```

### Run Specific Test
```bash
npx playwright test project-flows.spec.js -g "Login"
```

### Debug Mode
```bash
npx playwright test --debug
# Opens Inspector; step through test manually
```

### View Report
```bash
npx playwright show-report
# Opens HTML report with traces, videos, screenshots
```

### Generate HTML Report
```bash
npx playwright test --reporter=html
```

## CI/CD Integration

### GitHub Actions
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
- run: cd frontend && npm ci
- run: cd frontend && npx playwright install --with-deps chromium
- run: cd frontend && npm run test:e2e
```

### Environment Variables
```bash
PLAYWRIGHT_TIMEOUT=60000  # Override test timeout (ms)
CI=true  # Disable server reuse in CI
```

## Troubleshooting

### Test Timeouts
- **Cause:** Selector not found or API mock not responding
- **Fix:** Add explicit waits or reduce test scope
  ```javascript
  await page.waitForTimeout(1000);  // Temporary debug
  ```

### Selector Not Found
- **Cause:** Element not visible or text doesn't match exactly
- **Fix:** Inspect element in Playwright Inspector or screenshot
  ```bash
  npx playwright test --debug
  ```

### API Mock Not Intercepted
- **Cause:** Route pattern doesn't match request URL
- **Fix:** Check URL in Network tab and update pattern
  ```javascript
  await page.route('**/api/student/**', route => {...})
  ```

### Video/Trace Not Generated
- **Cause:** Test passed (traces only on-first-retry)
- **Fix:** Force failure or update config to always capture
  ```javascript
  await expect(page).toHaveFailed();  // Force failure
  ```

## Best Practices

1. **Mock early:** Install stubs and mocks before user interactions
2. **Use fixtures:** Leverage existing `loginAs`, `installApiMocks` helpers
3. **Selector specificity:** Prefer IDs > role+exact-name > other selectors
4. **Atomic tests:** Each test should be independent (no cross-test dependencies)
5. **Deterministic data:** Use fixed seeded data in mocks (same data every run)
6. **Readable assertions:** Use `expect()` with clear messages

## Dependencies

`frontend/package.json` must include:
```json
{
  "devDependencies": {
    "@playwright/test": "^1.54.2"
  }
}
```

Browsers installed via:
```bash
npx playwright install chromium
```

## Architecture: Why Mocks Instead of Backend Server?

| Aspect | Mocked API | Live Server |
|--------|-----------|-------------|
| Speed | ~25-40s (7 tests) | ~60s+ (startup overhead) |
| Reliability | 100% (no external deps) | Depends on backend health |
| Debugging | Can inspect mock logic | Must trace through server |
| CI/CD | Faster, simpler | Needs services/containers |
| Development | Offline support | Requires backend running |

**Conclusion:** Mocks enable fast, deterministic e2e validation of React/routing logic without backend infrastructure.
