# Frontend Architecture & Setup

This directory contains the React single-page application for the biometric attendance system.

## Stack

- React 19
- Vite
- React Router
- Axios with cookie-based auth and CSRF headers
- Framer Motion for motion design
- React Icons and react-hot-toast for UI affordances
- Playwright for end-to-end testing

## Main App Areas

- Admin screens for courses, papers, lecturers, students, enrollment, attendance analytics, audit logs, jobs, and timetable management.
- Lecturer screens for attendance session lifecycle, recognition review, session adjustment, progress, and timetable views.
- Student screens for attendance summary, predictions, eligibility, leave requests, and timetable views.
- Shared layout, auth, theme, timetable, and calendar components.

## Setup

```bash
npm install
npm run dev
```

Other common commands:

```bash
npm run lint
npm run build
npm run test:e2e
```

## Implementation Notes

- Authentication is cookie-based and the frontend must include CSRF tokens for modifying requests.
- The dashboard layout is responsive and uses a sidebar shell for role-specific navigation.
- Timetable exports open a print preview or generate PDFs from the rendered timetable views.
- Calendar and timetable components are shared across admin, lecturer, and student screens.

## Testing Notes

- Playwright coverage is focused on login, navigation, attendance session flows, enrollment, exports, and accessibility checks.
- The test harness uses mocked API responses and browser stubs so it can run without a live camera or database.
