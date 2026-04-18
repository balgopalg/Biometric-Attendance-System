import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const ONE_BY_ONE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2s4WQAAAAASUVORK5CYII=';
const ONE_BY_ONE_PNG_BUFFER = Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64');

const adminUser = {
  _id: 'admin-1',
  name: 'System Admin',
  email: 'admin@system.com',
  role: 'admin',
  department: 'Administration',
  must_change_password: false,
};

const lecturerUser = {
  _id: 'lecturer-1',
  name: 'Dr. Lecturer',
  email: 'lecturer@system.com',
  role: 'lecturer',
  department: 'Computing',
  must_change_password: false,
};

const studentUser = {
  _id: 'student-1',
  name: 'Alice Student',
  email: 'alice@student.com',
  role: 'student',
  department: 'Computing',
  must_change_password: false,
};

const course = {
  _id: 'course-1',
  name: 'Master of Computer Applications',
  code: 'MCA',
  department: 'Computing',
  course_duration: 2,
  status: 'active',
};

const paper = {
  _id: 'paper-1',
  name: 'Machine Learning',
  code: 'ML-501',
  course_id: course._id,
  lecturer_id: lecturerUser._id,
  semester: 1,
  total_classes: 2,
  course_name: course.name,
  course_code: course.code,
  course_status: 'active',
  is_course_inactive: false,
  academic_year: '2026',
  total_enrolled_students: 1,
  enrolled_academic_session_label: '2026',
};

const studentRow = {
  _id: 'profile-1',
  user_id: studentUser._id,
  name: studentUser.name,
  email: studentUser.email,
  reg_number: 'REG001',
  roll_number: 'R001',
  current_semester: 1,
  course_id: course._id,
  course_name: course.name,
  course_status: 'active',
  is_course_inactive: false,
  academic_session: '2026',
  has_face: false,
  enrolled_papers: [{ paper_id: paper._id }],
  mobile_no: '9999999999',
};

function installCameraStubs(page) {
  return page.addInitScript((pngBase64) => {
    const fakeStream = {
      getTracks: () => [{ stop() {} }],
    };

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => fakeStream,
      },
    });

    if (window.HTMLCanvasElement) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: () => ({
          drawImage() {},
        }),
      });

      Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
        configurable: true,
        value: () => `data:image/jpeg;base64,${pngBase64}`,
      });
    }

    if (window.HTMLVideoElement) {
      Object.defineProperty(HTMLVideoElement.prototype, 'play', {
        configurable: true,
        value: async () => {},
      });

      Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
        configurable: true,
        get: () => 640,
      });

      Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
        configurable: true,
        get: () => 480,
      });
    }
    }, ONE_BY_ONE_PNG_BASE64);
}

function createAdminDashboardPayload() {
  return {
    total_students: 1,
    total_lecturers: 1,
    total_courses: 1,
    active_courses: 1,
    inactive_courses: 0,
    total_papers: 1,
    inactive_papers: 0,
    total_attendance: 1,
    total_audit_logs: 1,
    app_started_at: new Date().toISOString(),
    system_uptime_seconds: 120,
    system_uptime: '2m',
    students_by_course: { 'Master of Computer Applications': 1 },
    students_by_year: { '2026': 1 },
    monthly_attendance: [
      { key: '2026-04', label: 'Apr', total: 1 },
      { key: '2026-05', label: 'May', total: 0 },
      { key: '2026-06', label: 'Jun', total: 0 },
      { key: '2026-07', label: 'Jul', total: 0 },
      { key: '2026-08', label: 'Aug', total: 0 },
      { key: '2026-09', label: 'Sep', total: 0 },
    ],
  };
}

function createQueueMetricsPayload() {
  return {
    queue: {
      depth: 2,
      delayed_depth: 1,
      due_delayed: 1,
    },
    jobs: {
      running: 1,
      stale_running: 0,
      dead_letter_last_24h: 0,
      recent_dead_letter_jobs: [],
    },
  };
}

function createEligibilitySummaryPayload() {
  return {
    total: 1,
    eligible_count: 0,
    ineligible_count: 1,
    items: [
      {
        user_id: studentUser._id,
        student_name: studentUser.name,
        student_email: studentUser.email,
        student_semester: 1,
        semester: 1,
        course_id: course._id,
        course_name: course.name,
        course_status: 'active',
        is_course_inactive: false,
        paper_id: paper._id,
        paper_name: paper.name,
        paper_code: paper.code,
        overall_attendance_percentage: 50,
        final_eligible: false,
      },
    ],
  };
}

async function installApiMocks(page) {
  const sessionState = {
    rolledBack: false,
    lecturerRecognized: false,
    sessionId: 'sess-lecturer-1',
    enrollmentSubmitted: false,
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (!path.startsWith('/api/')) {
      await route.continue();
      return;
    }

    if (path === '/api/auth/me') {
      await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
      return;
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = request.postDataJSON() || {};
      const loginRole = String(body.email || '').includes('lecturer') ? 'lecturer' : String(body.email || '').includes('student') ? 'student' : 'admin';
      const user = loginRole === 'lecturer' ? lecturerUser : loginRole === 'student' ? studentUser : adminUser;
      await route.fulfill({ status: 200, json: { user } });
      return;
    }

    if (path === '/api/auth/logout') {
      await route.fulfill({ status: 200, json: { message: 'Logged out' } });
      return;
    }

    if (path === '/api/admin/stats') {
      await route.fulfill({ status: 200, json: createAdminDashboardPayload() });
      return;
    }

    if (path === '/api/admin/departments') {
      await route.fulfill({ status: 200, json: [{ _id: 'dept-1', name: 'Computing' }] });
      return;
    }

    if (path === '/api/admin/jobs/metrics') {
      await route.fulfill({ status: 200, json: createQueueMetricsPayload() });
      return;
    }

    if (path === '/api/admin/exam-eligibility-summary') {
      await route.fulfill({ status: 200, json: createEligibilitySummaryPayload() });
      return;
    }

    if (path === '/api/admin/courses' && method === 'GET') {
      await route.fulfill({ status: 200, json: [course] });
      return;
    }

    if (path.match(/^\/api\/admin\/courses\/[^/]+\/semesters$/) && method === 'GET') {
      await route.fulfill({ status: 200, json: [1, 2] });
      return;
    }

    if (path.match(/^\/api\/admin\/courses\/[^/]+\/sessions$/) && method === 'GET') {
      await route.fulfill({ status: 200, json: ['2026'] });
      return;
    }

    if (path === '/api/admin/papers' && method === 'GET') {
      await route.fulfill({ status: 200, json: [paper] });
      return;
    }

    if (path === '/api/admin/students' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          items: [studentRow],
          total: 1,
          page: 1,
        },
      });
      return;
    }

    if (path === '/api/admin/students/options' && method === 'GET') {
      await route.fulfill({ status: 200, json: [studentRow] });
      return;
    }

    if (path === '/api/admin/students/enroll' && method === 'POST') {
      sessionState.enrollmentSubmitted = true;
      await route.fulfill({
        status: 200,
        json: {
          message: 'Face enrolled successfully',
          faces_detected: 1,
          dataset_saved_count: 50,
        },
      });
      return;
    }

    if (path === '/api/admin/attendance-matrix' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          options: {
            courses: [course],
            academic_sessions: ['2026'],
            semesters: [1],
          },
          meta: {
            students_count: 1,
            dates_count: 1,
            sessions_count: 1,
          },
          dates: [
            {
              date: '12 Apr',
              subjects: [
                {
                  column_key: 'col-1',
                  subject_code: paper.code,
                  subject_name: paper.name,
                  label: paper.code,
                  period_number: 1,
                },
              ],
            },
          ],
          rows: [
            {
              user_id: studentRow.user_id,
              roll_no: studentRow.roll_number,
              name: studentRow.name,
              cells: { 'col-1': 'P' },
            },
          ],
        },
      });
      return;
    }

    if (path === '/api/admin/attendance-matrix/export-csv' && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="attendance_matrix_test.csv"',
        },
        body: 'Roll No,Name\nR001,Alice Student\n',
      });
      return;
    }

    if (path === '/api/admin/attendance-matrix/export' && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="attendance_matrix_test.xlsx"',
        },
        body: Buffer.from('PK\u0003\u0004fake'),
      });
      return;
    }

    if (path === '/api/admin/audit-logs' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          logs: [
            {
              _id: 'audit-1',
              timestamp: new Date().toISOString(),
              actor_name: adminUser.name,
              actor_email: adminUser.email,
              role: 'admin',
              action: 'CREATE_STUDENT',
              target_type: 'Student',
              ip: '127.0.0.1',
              rollback_available: !sessionState.rolledBack,
              rolled_back: sessionState.rolledBack,
            },
          ],
          total: 1,
          page: 1,
          per_page: 20,
        },
      });
      return;
    }

    if (path === '/api/admin/audit-logs/audit-1/rollback' && method === 'POST') {
      sessionState.rolledBack = true;
      await route.fulfill({ status: 200, json: { message: 'Rollback completed successfully' } });
      return;
    }

    if (path === '/api/lecturer/papers' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: [
          {
            ...paper,
            total_classes: 2,
            total_enrolled_students: 1,
          },
        ],
      });
      return;
    }

    if (path === '/api/lecturer/pin' && method === 'GET') {
      await route.fulfill({ status: 200, json: { has_pin: true, pin_last_set: new Date().toISOString() } });
      return;
    }

    if (path === '/api/lecturer/pin/generate' && method === 'POST') {
      await route.fulfill({ status: 200, json: { pin: '1234', message: 'New PIN generated' } });
      return;
    }

    if (path === '/api/lecturer/pin' && method === 'PUT') {
      await route.fulfill({ status: 200, json: { message: 'PIN updated' } });
      return;
    }

    if (path === '/api/lecturer/session/start' && method === 'POST') {
      await route.fulfill({
        status: 200,
        json: {
          session_id: sessionState.sessionId,
          paper,
          started_at: new Date().toISOString(),
        },
      });
      return;
    }

    if (path === '/api/lecturer/session/stop' && method === 'POST') {
      await route.fulfill({ status: 200, json: { message: 'Session stopped successfully' } });
      return;
    }

    if (path === '/api/lecturer/session/recognize-image' && method === 'POST') {
      await route.fulfill({
        status: 200,
        json: {
          new_matches: [
            {
              user_id: studentUser._id,
              name: studentUser.name,
              email: studentUser.email,
              roll_number: 'R001',
              similarity: 0.93,
            },
          ],
          faces_detected: 1,
          total_recognized: 1,
          candidates_count: 1,
          threshold: 0.6,
          best_similarity_seen: 0.93,
          saved_folder: 'uploads/demo',
          original_path: 'uploads/demo/original.png',
          face_paths: ['uploads/demo/face-1.png'],
        },
      });
      return;
    }

    if (path.match(/^\/api\/lecturer\/session\/[^/]+\/review$/) && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          session_id: sessionState.sessionId,
          paper,
          present_students: [
            {
              user_id: studentUser._id,
              name: studentUser.name,
              email: studentUser.email,
            },
          ],
          candidates: [
            {
              user_id: studentUser._id,
              name: studentUser.name,
              email: studentUser.email,
              is_present: true,
            },
          ],
          committed_at: new Date().toISOString(),
          rollback_until: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          editable: true,
          students_marked: 1,
        },
      });
      return;
    }

    if (path === '/api/lecturer/session/commit' && method === 'POST') {
      await route.fulfill({
        status: 200,
        json: {
          message: 'Attendance committed successfully',
          students_marked: 1,
          session_id: sessionState.sessionId,
          rollback_until: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
      });
      return;
    }

    if (path.match(/^\/api\/lecturer\/session\/[^/]+\/adjust$/) && method === 'PUT') {
      await route.fulfill({
        status: 200,
        json: {
          message: 'Attendance updated and re-committed successfully',
          review: {
            session_id: sessionState.sessionId,
            paper,
            present_students: [],
            candidates: [
              {
                user_id: studentUser._id,
                name: studentUser.name,
                email: studentUser.email,
                is_present: false,
              },
            ],
            committed_at: new Date().toISOString(),
            rollback_until: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            editable: true,
            students_marked: 0,
          },
        },
      });
      return;
    }

    if (path === '/api/lecturer/session/recognized' && method === 'GET') {
      await route.fulfill({ status: 200, json: { students: [] } });
      return;
    }

    if (path === '/api/student/attendance' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: [
          {
            paper_id: paper._id,
            paper_name: paper.name,
            paper_code: paper.code,
            attended: 1,
            total_classes: 2,
            percentage: 50,
            sessions: [],
          },
        ],
      });
      return;
    }

    if (path === '/api/student/predictions' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: [
          {
            paper_id: paper._id,
            paper_name: paper.name,
            paper_code: paper.code,
            current_percentage: 50,
            overall_attendance_percentage: 50,
            overall_attended_classes: 1,
            overall_total_classes: 2,
            classes_needed_for_75: 2,
            safe_bunks_remaining: 0,
          },
        ],
      });
      return;
    }

    if (path === '/api/student/profile' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          student: {
            user_id: studentUser._id,
            name: studentUser.name,
            email: studentUser.email,
            department: studentUser.department,
          },
          profile: {
            reg_number: 'REG001',
            academic_year: '2026',
            current_semester: 1,
            course_id: course._id,
          },
          course,
          course_status: 'active',
          is_course_inactive: false,
          subjects: [
            {
              paper_id: paper._id,
              paper_name: paper.name,
              paper_code: paper.code,
              semester: 1,
              total_classes: 2,
            },
          ],
          papers: [
            {
              paper_id: paper._id,
              paper_name: paper.name,
              paper_code: paper.code,
              semester: 1,
              total_classes: 2,
            },
          ],
        },
      });
      return;
    }

    if (path === '/api/student/exam-eligibility' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: [
          {
            paper_id: paper._id,
            paper_name: paper.name,
            paper_code: paper.code,
            attendance_percentage: 50,
            overall_attendance_percentage: 50,
            overall_attended_classes: 1,
            overall_total_classes: 2,
            eligible: false,
            status: 'Not Eligible',
            approval_source: 'Auto blocked',
          },
        ],
      });
      return;
    }

    if (path === '/api/admin/stats/monthly-attendance') {
      await route.fulfill({ status: 200, json: [] });
      return;
    }

    if (path === '/api/lecturer/capabilities') {
      await route.fulfill({ status: 200, json: { can_stop_session: true } });
      return;
    }

    if (path === '/api/admin/attendance-matrix' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          dates: [],
          rows: [],
          meta: { students_count: 1, dates_count: 0, sessions_count: 0 },
          options: { academic_sessions: ['2026'], semesters: [1, 2] },
        },
      });
      return;
    }

    if (path === '/api/admin/attendance-matrix/export-csv' && method === 'GET') {
      const csvContent = 'Roll,Name\nREG001,Alice Student';
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="attendance_matrix_${Date.now()}.csv"`,
        },
        body: csvContent,
      });
      return;
    }

    if (path === '/api/admin/attendance-matrix/export' && method === 'GET') {
      // Return a minimal blob for Excel download
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="attendance_matrix_${Date.now()}.xlsx"`,
        },
        body: Buffer.from('fake-xlsx-data'),
      });
      return;
    }

    // Default fallback to prevent 401s from real server if endpoint is unmocked
    await route.fulfill({ status: 200, json: {} });
  });

  return sessionState;
}

async function loginAs(page, role) {
  const email = role === 'lecturer' ? lecturerUser.email : role === 'student' ? studentUser.email : adminUser.email;
  const password = role === 'lecturer' ? 'lecturer123' : role === 'student' ? 'student123' : 'admin123';

  await page.goto('/login');
  
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/(admin|lecturer|student)$/);
}

test.describe('Project end-to-end flows', () => {
  test('login and navigation', async ({ page }) => {
    await installCameraStubs(page);
    await installApiMocks(page);
    await loginAs(page, 'admin');

    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Students' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Enrollment' })).toBeVisible();

    await page.getByRole('link', { name: 'Students' }).click();
    await expect(page.getByRole('heading', { name: /^Students$/ })).toBeVisible({ timeout: 15000 });

    await page.getByRole('link', { name: 'Enrollment' }).click();
    await expect(page.getByRole('heading', { name: 'Student Enrollment' })).toBeVisible({ timeout: 15000 });
  });

  test('attendance session lifecycle with upload, commit, and adjustment', async ({ page }) => {
    await installCameraStubs(page);
    await installApiMocks(page);
    await loginAs(page, 'lecturer');

    await page.getByRole('link', { name: 'Take Attendance' }).click();
    await expect(page.getByRole('heading', { name: 'Take Attendance' })).toBeVisible({ timeout: 15000 });

    // Ensure course/paper selectors are hydrated before starting the session.
    await page.getByRole('combobox', { name: 'Select course' }).selectOption({ index: 1 });
    await page.getByRole('combobox', { name: 'Select paper' }).selectOption({ index: 1 });

    await page.getByRole('button', { name: 'Start Session' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Upload Image' }).click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: 'classroom.png', mimeType: 'image/png', buffer: ONE_BY_ONE_PNG_BUFFER });
    await page.getByRole('button', { name: 'Upload & Recognize' }).click();
    await expect(page.getByText('Recognized Students (1)')).toBeVisible();

    await page.getByRole('button', { name: /Commit \(1\)/ }).click();
    await expect(page.getByPlaceholder('4-digit PIN')).toBeVisible();
    await page.getByPlaceholder('4-digit PIN').fill('1234');
    await page.getByRole('button', { name: 'Confirm & Save' }).click();
    await expect(page.getByText('Committed Attendance Review')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Re-commit Adjustments' })).toBeVisible();

    await page.getByRole('button', { name: 'Re-commit Adjustments' }).click();
    await expect(page.getByRole('heading', { name: 'Re-Commit Attendance Adjustments' })).toBeVisible();
    await page.getByPlaceholder('4-digit PIN').fill('1234');
    await page.getByRole('button', { name: 'Confirm Re-Commit' }).click();
    await expect(page.getByText('Attendance updated and re-committed successfully')).toBeVisible();
  });

  test('enrollment, exports, and rollback flows', async ({ page }) => {
    await installCameraStubs(page);
    const state = await installApiMocks(page);
    await loginAs(page, 'admin');

    await page.getByRole('link', { name: 'Enrollment' }).click();
    await expect(page.getByRole('heading', { name: 'Student Enrollment' })).toBeVisible({ timeout: 15000 });

    await page.getByPlaceholder('Type to search and select student...').fill('Alice');
    await page.locator('button').filter({ hasText: 'Alice Student' }).first().click();

    const enrollInput = page.locator('input[type="file"]');
    await enrollInput.setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: ONE_BY_ONE_PNG_BUFFER });
    await page.getByRole('button', { name: 'Extract & Store Embedding' }).click();
    await expect(page.getByText('Face enrolled successfully')).toBeVisible();

    await page.getByRole('link', { name: 'Attendance Matrix' }).click();
    await expect(page.getByRole('main').getByRole('heading', { name: 'Attendance Matrix' })).toBeVisible({ timeout: 15000 });

    // Combobox order: 0=Department, 1=Course, 2=Academic Session, 3=Semester
    await expect(page.getByRole('combobox').nth(0)).toContainText('All Departments');
    await page.getByRole('combobox').nth(0).selectOption({ index: 1 }); // Select "Computing"
    await page.getByRole('combobox').nth(1).selectOption({ index: 1 }); // Select course
    await page.getByRole('combobox').nth(2).selectOption('2026');
    await page.getByRole('combobox').nth(3).selectOption('1');

    const csvDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const csvDownload = await csvDownloadPromise;
    expect(csvDownload.suggestedFilename()).toMatch(/attendance_matrix_.*\.csv/);

    const xlsxDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Generate Excel' }).click();
    const xlsxDownload = await xlsxDownloadPromise;
    expect(xlsxDownload.suggestedFilename()).toMatch(/attendance_matrix_.*\.xlsx/);

    await page.getByRole('link', { name: 'Audit Log' }).click();
    await expect(page.getByRole('heading', { name: 'Audit Log', exact: true })).toBeVisible({ timeout: 15000 });
    page.on('dialog', async (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Rollback' }).click();
    await expect(page.getByRole('cell', { name: 'Rolled Back' })).toBeVisible();
    expect(state.rolledBack).toBeTruthy();
  });
});
