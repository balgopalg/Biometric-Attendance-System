# Biometric Attendance System Operations Manual

## 1. Purpose of this manual

This manual explains every major operation available in the system, including:

- Why to perform it
- When to perform it
- How to perform it from UI and API
- Expected output and safety checks

It is intended for Admins, Lecturers, Students, and Operators.

## 2. System operation layers

- User operations:
  - Admin dashboard workflows
  - Lecturer attendance workflows
  - Student academic workflows
- API operations:
  - Authentication
  - Role-specific endpoints
  - Utility/recognition endpoints
- Operations/maintenance:
  - Backup/restore
  - Data cleanup
  - Migrations
  - Queue diagnostics and workers
  - Scheduled task automation

## 3. Authentication and session model

- Auth model:
  - JWT stored in HttpOnly cookie
  - CSRF header required on mutation endpoints: X-CSRF-TOKEN
- Login protections:
  - IP and account lockout protections
  - Rate limits on login and password-change endpoints

### 3.1 Login

- Why:
  - Start authenticated session and role-based access
- When:
  - First access, after logout, or expired session
- How:
  - UI: Login page
  - API: POST /api/auth/login

### 3.2 Logout

- Why:
  - End session and reduce unauthorized reuse risk
- When:
  - End of working session or shared-machine usage
- How:
  - UI: Topbar logout
  - API: POST /api/auth/logout

### 3.3 Change password

- Why:
  - Credential hardening and compromise response
- When:
  - Initial onboarding, periodic policy cycle, suspected compromise
- How:
  - UI: Change Password page
  - API: POST /api/auth/change-password

## 4. Admin operations

### 4.1 Course management

- Why:
  - Keep academic structure current
- When:
  - New batch/session, course lifecycle changes
- How:
  - UI: Manage Courses
  - API:
    - GET /api/admin/courses
    - POST /api/admin/courses
    - PUT /api/admin/courses/{cid}
    - DELETE /api/admin/courses/{cid}
    - GET /api/admin/courses/{cid}/semesters
    - GET /api/admin/courses/{cid}/sessions

### 4.2 Paper management

- Why:
  - Define subjects and attendance entities
- When:
  - Semester planning and curriculum updates
- How:
  - UI: Manage Papers
  - API:
    - GET /api/admin/papers
    - POST /api/admin/papers
    - PUT /api/admin/papers/{pid}
    - DELETE /api/admin/papers/{pid}
    - POST /api/admin/papers/bulk-assign

### 4.3 Lecturer management

- Why:
  - Keep faculty and subject ownership accurate
- When:
  - New faculty, resignation, reallocation, support resets
- How:
  - UI: Manage Lecturers
  - API:
    - GET /api/admin/lecturers
    - POST /api/admin/lecturers
    - PUT /api/admin/lecturers/{lid}
    - DELETE /api/admin/lecturers/{lid}
    - GET /api/admin/lecturers/{lid}/papers
    - PUT /api/admin/lecturers/{lid}/papers
    - POST /api/admin/lecturers/{lid}/reset-password
    - POST /api/admin/lecturers/{lid}/reset-pin

### 4.4 Student management and enrollment lifecycle

- Why:
  - Register students and maintain profile accuracy
- When:
  - New admissions, profile correction, semester roll-forward
- How:
  - UI: Manage Students, Student Enrollment
  - API:
    - GET /api/admin/students
    - GET /api/admin/students/options
    - POST /api/admin/students
    - PUT /api/admin/students/{sid}
    - DELETE /api/admin/students/{sid}
    - POST /api/admin/students/bulk-promote
    - POST /api/admin/students/{sid}/reset-password

### 4.5 Face enrollment and training

- Why:
  - Enable biometric attendance recognition quality
- When:
  - Initial onboarding, retraining cycle, quality drift, new dataset upload
- How:
  - UI: Face Enrollment and Training panels
  - API:
    - POST /api/admin/students/enroll
    - POST /api/admin/students/upload-photo
    - POST /api/admin/students/{sid}/train-face
    - POST /api/admin/students/train-face/bulk
    - POST /api/admin/students/train-face/rebuild-all

### 4.6 Queue and dead-letter operations

- Why:
  - Recover failed jobs, monitor async throughput
- When:
  - Training failures, queue backlog, operations alert response
- How:
  - UI: Dead Letter Jobs page
  - API:
    - GET /api/admin/jobs/metrics
    - GET /api/admin/jobs/dead-letter
    - GET /api/admin/jobs/{job_id}
    - POST /api/admin/jobs/{job_id}/cancel
    - POST /api/admin/jobs/{job_id}/replay
    - POST /api/admin/jobs/dead-letter/replay-bulk
    - POST /api/admin/jobs/dead-letter/replay-filtered

### 4.7 Attendance matrix and export

- Why:
  - Provide auditable attendance reporting and external sharing
- When:
  - Compliance reporting, academic review, exam preparation
- How:
  - UI: Attendance Matrix page
  - API:
    - GET /api/admin/attendance-matrix
    - GET /api/admin/attendance-matrix/export
    - GET /api/admin/attendance-matrix/export-csv

### 4.8 Audit trail and rollback

- Why:
  - Accountability and controlled reversibility
- When:
  - Mistaken create/update/delete operations
- How:
  - UI: Audit Trail page
  - API:
    - GET /api/admin/audit-logs
    - POST /api/admin/audit-logs/{log_id}/rollback

### 4.9 Eligibility override operations

- Why:
  - Controlled policy exceptions for exam eligibility
- When:
  - Dean/committee-approved exceptional cases
- How:
  - UI: Exam Eligibility page
  - API:
    - GET /api/admin/exam-eligibility-summary
    - PUT /api/admin/exam-eligibility-override
    - PUT /api/admin/exam-eligibility-override/bulk

- How:
  - UI: Admin Dashboard
  - API: GET /api/admin/stats

### 4.11 Attendance shortage alerts

- Why:
  - Proactively notify students when they fall below the mandatory threshold
- When:
  - Periodically (e.g., monthly) or before mid-terms
- How:
  - API: POST /api/admin/attendance/send-shortage-alerts (supports course_id and paper_id filters)

## 5. Lecturer operations

### 5.1 PIN setup and management

- Why:
  - Secure commit/adjust attendance events
- When:
  - First login and periodic PIN hygiene
- How:
  - UI: Lecturer dashboard PIN controls
  - API:
    - GET /api/lecturer/pin
    - PUT /api/lecturer/pin
    - POST /api/lecturer/pin/generate

### 5.2 Session lifecycle

- Why:
  - Capture attendance for active class period
- When:
  - During each classroom session
- How:
  - UI: Attendance Session
  - API:
    - POST /api/lecturer/session/start
    - POST /api/lecturer/session/recognize
    - POST /api/lecturer/session/recognize-image
    - GET /api/lecturer/session/recognized
    - POST /api/lecturer/session/commit (Supports biometric authentication if LECTURER_AUTH_MODE=face)
    - GET /api/lecturer/session/{session_id}/review
    - PUT /api/lecturer/session/{session_id}/adjust
    - POST /api/lecturer/session/stop

### 5.3 Progress tracking

- Why:
  - View class-wise attendance progress and identify low attendance trends
- When:
  - Weekly review and before assessments
- How:
  - UI: Lecturer Progress
  - API: GET /api/lecturer/progress

## 6. Student operations

### 6.1 Profile and subject visibility

- Why:
  - Confirm assigned course, session, and paper mapping
- When:
  - Start of semester or after profile updates
- How:
  - UI: Student Dashboard
  - API: GET /api/student/profile

### 6.2 Attendance summary

- Why:
  - Track attendance status per paper
- When:
  - Continuous self-monitoring throughout semester
- How:
  - UI: Attendance Summary
  - API: GET /api/student/attendance

### 6.3 Prediction and eligibility

- Why:
  - Plan attendance strategy and exam readiness
- When:
  - Mid-sem and pre-exam periods
- How:
  - UI: Exam Portal / Attendance Summary
  - API:
    - GET /api/student/predictions
    - GET /api/student/exam-eligibility
    - GET /api/student/leave-requests
    - POST /api/student/leave-requests

## 7. Recognition utility operations

- Why:
  - Diagnostic checks or integration-level face operations
- When:
  - QA validation and controlled integration scenarios
- How:
  - API:
    - POST /api/recognition/detect
    - POST /api/recognition/identify

## 8. Validation rules summary

- Auth:
  - Email format validated on login
  - Password change requires current, new, confirm
  - New password must satisfy strength policy in backend validation
- Lecturer:
  - PIN must be exactly 4 digits
  - session/start requires paper_id
  - recognize requires session_id + frame
  - recognize-image requires multipart image + session_id
  - commit requires session_id + valid lecturer PIN
  - adjust requires valid PIN + user_ids list + active rollback window
- Admin:
  - create student requires name, email, course_id
  - face enroll requires user_id + photo
  - bulk promote requires user_ids
  - paper bulk assign requires paper_id + user_ids

## 9. Full API inventory (operational reference)

### Auth

- GET /api/auth/health
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/auth/change-password

### Admin (course/paper/lecturer/student)

- GET /api/admin/courses
- POST /api/admin/courses
- GET /api/admin/courses/{cid}/semesters
- GET /api/admin/courses/{cid}/sessions
- PUT /api/admin/courses/{cid}
- DELETE /api/admin/courses/{cid}
- GET /api/admin/papers
- POST /api/admin/papers
- PUT /api/admin/papers/{pid}
- DELETE /api/admin/papers/{pid}
- POST /api/admin/papers/bulk-assign
- GET /api/admin/lecturers/{lid}/papers
- PUT /api/admin/lecturers/{lid}/papers
- GET /api/admin/lecturers
- POST /api/admin/lecturers
- PUT /api/admin/lecturers/{lid}
- DELETE /api/admin/lecturers/{lid}
- POST /api/admin/lecturers/{lid}/reset-password
- POST /api/admin/lecturers/{lid}/reset-pin
- PUT /api/admin/lecturers/{lid}/pin
- GET /api/admin/students
- GET /api/admin/students/options
- POST /api/admin/students
- PUT /api/admin/students/{sid}
- DELETE /api/admin/students/{sid}
- POST /api/admin/students/bulk-promote
- POST /api/admin/student-bulk-promote
- POST /api/admin/students/{sid}/reset-password

### Admin (face, jobs, audit, reports, eligibility)

- POST /api/admin/students/enroll
- POST /api/admin/students/upload-photo
- POST /api/admin/students/{sid}/train-face
- POST /api/admin/students/{sid}/train
- POST /api/admin/student/{sid}/train-face
- POST /api/admin/students/train-face/bulk
- POST /api/admin/students/bulk-train-face
- POST /api/admin/students/train-face/rebuild-all
- GET /api/admin/jobs/{job_id}
- POST /api/admin/jobs/{job_id}/cancel
- POST /api/admin/jobs/{job_id}/replay
- GET /api/admin/jobs/dead-letter
- POST /api/admin/jobs/dead-letter/replay-bulk
- POST /api/admin/jobs/dead-letter/replay-filtered
- GET /api/admin/jobs/metrics
- POST /api/admin/capture-faces
- POST /api/admin/courses/reassign
- GET /api/admin/audit-logs
- POST /api/admin/audit-logs/{log_id}/rollback
- POST /api/admin/attendance/override
- GET /api/admin/exam-eligibility-summary
- PUT /api/admin/exam-eligibility-override
- PUT /api/admin/exam-eligibility-override/bulk
- GET /api/admin/attendance-matrix
- GET /api/admin/attendance-matrix/export
- GET /api/admin/attendance-matrix/export-csv
- GET /api/admin/stats
- POST /api/admin/attendance/send-shortage-alerts

### Lecturer

- GET /api/lecturer/papers
- GET /api/lecturer/pin
- PUT /api/lecturer/pin
- POST /api/lecturer/pin/generate
- POST /api/lecturer/session/start
- POST /api/lecturer/session/recognize
- POST /api/lecturer/session/recognize-image
- GET /api/lecturer/session/recognized
- POST /api/lecturer/session/stop
- POST /api/lecturer/session/commit
- GET /api/lecturer/session/{session_id}/review
- PUT /api/lecturer/session/{session_id}/adjust
- GET /api/lecturer/progress

### Student

- GET /api/student/profile
- GET /api/student/attendance
- GET /api/student/predictions
- GET /api/student/exam-eligibility
- GET /api/student/leave-requests
- POST /api/student/leave-requests

### Recognition

- POST /api/recognition/detect
- POST /api/recognition/identify

## 10. Where to find payload-level API examples

- OpenAPI spec with examples and schema: [/docs/openapi.yaml](../openapi.yaml)
- Workflow payload handbook: [/docs/governance/API_WORKFLOW_GUIDE.md](../governance/API_WORKFLOW_GUIDE.md)
- CLI runbook for all operations commands: [/docs/operations/CLI_COMMAND_RUNBOOK.md](CLI_COMMAND_RUNBOOK.md)