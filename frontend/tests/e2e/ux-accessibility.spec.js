import { expect, test } from '@playwright/test';

const adminUser = {
  _id: 'admin-1',
  name: 'System Admin',
  email: 'admin@system.com',
  role: 'admin',
  must_change_password: false,
};

const lecturerUser = {
  _id: 'lecturer-1',
  name: 'Dr. Lecturer',
  email: 'lecturer@system.com',
  role: 'lecturer',
  must_change_password: false,
};

const studentUser = {
  _id: 'student-1',
  name: 'Alice Student',
  email: 'alice@student.com',
  role: 'student',
  must_change_password: false,
};

const course = {
  _id: 'course-1',
  name: 'Master of Computer Applications',
  code: 'MCA',
  status: 'active',
};

const paper = {
  _id: 'paper-1',
  name: 'Machine Learning',
  code: 'ML-501',
  course_id: course._id,
  course_name: course.name,
  course_code: course.code,
  course_status: 'active',
  is_course_inactive: false,
  total_classes: 2,
  total_enrolled_students: 1,
};

function luminanceFromRgb(rgb) {
  const [r, g, b] = rgb;
  const channels = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(fg, bg) {
  const l1 = luminanceFromRgb(fg);
  const l2 = luminanceFromRgb(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function getContrast(page, selector) {
  return page.locator(selector).evaluate((node) => {
    function toRgba(raw) {
      const value = String(raw || '').trim();
      const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
      if (!rgb) return null;
      const parts = rgb[1].split(',').map((p) => Number.parseFloat(p.trim()));
      if (parts.length < 3) return null;
      return [parts[0], parts[1], parts[2], parts[3] ?? 1];
    }

    function findBackgroundColor(target) {
      let current = target;
      while (current) {
        const styles = window.getComputedStyle(current);
        const color = toRgba(styles.backgroundColor);
        if (color && color[3] > 0.02) return color;
        current = current.parentElement;
      }
      return [255, 255, 255, 1];
    }

    const styles = window.getComputedStyle(node);
    const fg = toRgba(styles.color);
    const bg = findBackgroundColor(node);

    if (!fg || !bg) {
      return { error: 'Unable to parse colors', fg: styles.color, bg: styles.backgroundColor };
    }

    return {
      fg,
      bg,
      fgRaw: styles.color,
      bgRaw: window.getComputedStyle(node).backgroundColor,
    };
  });
}

async function installCommonApiMocks(page) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (!path.startsWith('/api/')) {
      await route.fallback();
      return;
    }

    if (path === '/api/auth/me') {
      await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
      return;
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = request.postDataJSON() || {};
      const user = String(body.email || '').includes('lecturer')
        ? lecturerUser
        : String(body.email || '').includes('student')
          ? studentUser
          : adminUser;
      await route.fulfill({ status: 200, json: { user } });
      return;
    }

    if (path === '/api/auth/logout') {
      await route.fulfill({ status: 200, json: { message: 'Logged out' } });
      return;
    }

    if (path === '/api/admin/stats') {
      await route.fulfill({
        status: 200,
        json: {
          total_students: 1,
          total_lecturers: 1,
          total_courses: 1,
          active_courses: 1,
          inactive_courses: 0,
          total_papers: 1,
          total_audit_logs: 1,
          app_started_at: new Date().toISOString(),
          monthly_attendance: [{ key: '2026-04', label: 'Apr', total: 1 }],
          students_by_course: { [course.name]: 1 },
          students_by_year: { '2026': 1 },
        },
      });
      return;
    }

    if (path === '/api/admin/jobs/metrics') {
      await route.fulfill({
        status: 200,
        json: {
          queue: { depth: 0, delayed_depth: 0, due_delayed: 0 },
          jobs: { running: 0, stale_running: 0, dead_letter_last_24h: 0, recent_dead_letter_jobs: [] },
        },
      });
      return;
    }

    if (path === '/api/admin/exam-eligibility-summary') {
      await route.fulfill({ status: 200, json: { total: 0, eligible_count: 0, ineligible_count: 0, items: [] } });
      return;
    }

    if (path === '/api/lecturer/papers') {
      await route.fulfill({ status: 200, json: [paper] });
      return;
    }

    if (path === '/api/student/attendance') {
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

    if (path === '/api/student/predictions') {
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

    if (path === '/api/lecturer/pin') {
      await route.fulfill({ status: 200, json: { has_pin: true } });
      return;
    }

    if (path === '/api/lecturer/session/start' && method === 'POST') {
      await route.fulfill({ status: 200, json: { session_id: 'sess-1', started_at: new Date().toISOString() } });
      return;
    }

    if (path === '/api/lecturer/session/recognize' && method === 'POST') {
      await route.fulfill({ status: 200, json: { new_matches: [], faces_detected: 0, candidates_count: 1, threshold: 0.6 } });
      return;
    }

    if (path === '/api/lecturer/session/stop' && method === 'POST') {
      await route.fulfill({ status: 200, json: { message: 'Session stopped' } });
      return;
    }

    if (path === '/api/lecturer/session/commit' && method === 'POST') {
      await route.fulfill({ status: 200, json: { message: 'Committed', session_id: 'sess-1' } });
      return;
    }

    if (path.match(/^\/api\/lecturer\/session\/.*\/review$/) && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          session_id: 'sess-1',
          committed_at: new Date().toISOString(),
          rollback_until: new Date(Date.now() + 300000).toISOString(),
          editable: true,
          candidates: [],
          present_students: [],
        },
      });
      return;
    }

    await route.fulfill({ status: 200, json: {} });
  });
}

async function tabUntilFocused(page, locator, maxTabs = 8) {
  for (let i = 0; i < maxTabs; i += 1) {
    try {
      await expect(locator).toBeFocused({ timeout: 150 });
      return;
    } catch {
      // Keep tabbing until the target control receives focus.
    }
    await page.keyboard.press('Tab');
  }

  await expect(locator).toBeFocused();
}

test.describe('UX and accessibility hardening checks', () => {
  test('supports keyboard-first navigation on login screen', async ({ page }) => {
    await installCommonApiMocks(page);
    await page.goto('/login');

    await page.locator('#login-email').focus();
    await expect(page.locator('#login-email')).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.locator('#login-password')).toBeFocused();

    await tabUntilFocused(page, page.getByRole('button', { name: /Show password|Hide password/i }));
    await tabUntilFocused(page, page.locator('#login-submit'));
  });

  test('maintains accessible contrast on key login texts', async ({ page }) => {
    await installCommonApiMocks(page);
    await page.goto('/login');

    const checks = [
      { selector: 'label[for="login-email"]', min: 4.5 },
      { selector: 'label[for="login-password"]', min: 4.5 },
      { selector: 'p:has-text("Biometric Attendance Management System")', min: 3.0 },
      { selector: 'h1.gradient-text', min: 3.0 },
    ];

    for (const item of checks) {
      const data = await getContrast(page, item.selector);
      expect(data.error, `${item.selector} color parsing failed`).toBeUndefined();

      const ratio = contrastRatio(data.fg, data.bg);
      expect(ratio, `${item.selector} contrast too low (${ratio.toFixed(2)}:1)`).toBeGreaterThanOrEqual(item.min);
    }
  });

  test('keeps admin dashboard mobile-safe without horizontal overflow', async ({ page }) => {
    await installCommonApiMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');

    await page.fill('#login-email', adminUser.email);
    await page.fill('#login-password', 'admin123');
    await page.click('#login-submit');
    await expect(page).toHaveURL(/\/admin$/);

    const viewportAudit = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        hasOverflow: root.scrollWidth > root.clientWidth + 1,
      };
    });

    expect(viewportAudit.hasOverflow, `Unexpected mobile overflow: ${JSON.stringify(viewportAudit)}`).toBeFalsy();
  });

  test('keeps lecturer session actions usable on mobile', async ({ page }) => {
    await installCommonApiMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');

    await page.fill('#login-email', lecturerUser.email);
    await page.fill('#login-password', 'lecturer123');
    await page.click('#login-submit');

    await expect(page.getByRole('heading', { name: /Welcome,.*Lecturer/i })).toBeVisible();
    await page.getByRole('button', { name: /start/i }).first().click();
    await expect(page).toHaveURL(/\/lecturer\/session/);

    const pageAudit = await page.evaluate(() => {
      const root = document.documentElement;
      const buttons = Array.from(document.querySelectorAll('button')).map((btn) => {
        const rect = btn.getBoundingClientRect();
        return {
          text: (btn.textContent || '').trim(),
          width: rect.width,
          height: rect.height,
        };
      });

      return {
        hasOverflow: root.scrollWidth > root.clientWidth + 1,
        tapTargetsTooSmall: buttons.filter((btn) => btn.height > 0 && btn.height < 36),
      };
    });

    expect(pageAudit.hasOverflow).toBeFalsy();
    expect(pageAudit.tapTargetsTooSmall.length).toBe(0);
  });

  test('keeps admin dashboard tap targets finger-friendly', async ({ page }) => {
    await installCommonApiMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');

    await page.fill('#login-email', adminUser.email);
    await page.fill('#login-password', 'admin123');
    await page.click('#login-submit');
    await expect(page).toHaveURL(/\/admin$/);

    const tapAudit = await page.evaluate(() => {
      const targets = Array.from(document.querySelectorAll('button.btn-primary, button.btn-secondary, button.btn-danger, a.btn-primary, a.btn-secondary, a.btn-danger'));
      const sizes = targets.map((node) => {
        const rect = node.getBoundingClientRect();
        return { text: (node.textContent || '').trim(), height: rect.height };
      });

      return sizes.filter((item) => item.height > 0 && item.height < 36);
    });

    expect(tapAudit.length).toBe(0);
  });

  test('keeps student actions reachable on mobile', async ({ page }) => {
    await installCommonApiMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');

    await page.fill('#login-email', studentUser.email);
    await page.fill('#login-password', 'student123');
    await page.click('#login-submit');
    await expect(page).toHaveURL(/\/student$/);

    const tapAudit = await page.evaluate(() => {
      const targets = Array.from(document.querySelectorAll('button.btn-primary, button.btn-secondary, button.btn-danger, a.btn-primary, a.btn-secondary, a.btn-danger'));
      const sizes = targets.map((node) => {
        const rect = node.getBoundingClientRect();
        return { text: (node.textContent || '').trim(), height: rect.height };
      });

      return sizes.filter((item) => item.height > 0 && item.height < 36);
    });

    expect(tapAudit.length).toBe(0);
  });
});
