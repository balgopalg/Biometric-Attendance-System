# Biometric Attendance System - Comprehensive Architecture Overview

**Last Updated:** May 10, 2026  
**Version:** 2.0

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Project Structure](#project-structure)
3. [Frontend Architecture](#frontend-architecture)
4. [Backend Architecture](#backend-architecture)
5. [Database Schema & Models](#database-schema--models)
6. [API Endpoints](#api-endpoints)
7. [Authentication & Authorization](#authentication--authorization)
8. [Face Recognition & Biometrics](#face-recognition--biometrics)
9. [Key Workflows](#key-workflows)
10. [External Dependencies & Integrations](#external-dependencies--integrations)
11. [Observability & Logging](#observability--logging)

---

## System Overview

### Purpose
A production-ready, multi-tenant facial biometric attendance system for educational institutions combining real-time face recognition with automated attendance marking. Provides role-based dashboards for students, lecturers, department admins, and super admins.

### Core Components
- **Frontend SPA**: React 19 with real-time webcam feed, face enrollment, attendance marking UI
- **Backend API**: Flask 3.1 REST API with biometric processing, session management, and analytics
- **Background Worker**: Async job queue for face model training, data cleanup, email notifications
- **MongoDB**: 4 isolated databases (auth, academic, attendance_ops, audit)
- **Redis**: Distributed rate limiting and task queue
- **Face Engine**: MediaPipe + InceptionResNetV1 (FaceNet-512D embeddings)

---

## Project Structure

### Top-Level Layout
```
Biometric-Attendance-System/
├── backend/                      # Flask API + Worker
├── frontend/                     # React SPA
├── docs/                        # Comprehensive documentation
├── docker-compose.yml           # Multi-container orchestration
├── README.md                    # Quick start guide
└── CONTRIBUTING.md              # Development guidelines
```

### Backend Structure
```
backend/
├── app/                         # Main Flask application package
│   ├── __init__.py              # App factory with blueprint registration
│   ├── config.py                # Environment configuration
│   ├── extensions.py            # Flask extension initialization (MongoDB, JWT, CORS)
│   ├── repositories.py          # Batch query helpers
│   ├── models/                  # Thin MongoDB wrappers
│   │   ├── user.py              # User CRUD, hashing, PIN management
│   │   ├── course.py            # Course CRUD
│   │   ├── paper.py             # Paper (Subject) CRUD
│   │   ├── enrollment.py        # Student profile + face embeddings (encrypted)
│   │   ├── attendance.py        # Attendance logging and session tracking
│   │   ├── audit.py             # Audit trail with deduplication
│   │   ├── calendar.py          # Academic calendar (holidays, optional days)
│   │   ├── timetable.py         # Timetable + slot assignment
│   │   └── department.py        # Department CRUD for multi-tenancy
│   ├── routes/                  # API blueprints (organized by domain)
│   │   ├── auth.py              # Login, logout, JWT refresh, password reset, OTP
│   │   ├── admin/               # Admin endpoints
│   │   │   ├── courses.py       # CRUD, visibility filtering
│   │   │   ├── papers.py        # CRUD, prerequisite validation
│   │   │   ├── lecturers.py     # CRUD, face enrollment, PIN management
│   │   │   ├── students.py      # Bulk import (Excel), export, filtering
│   │   │   ├── enrollment.py    # Face enrollment, biometric matching, conflict resolution
│   │   │   ├── attendance.py    # Audit logs, attendance analytics, rollback ops
│   │   │   ├── jobs.py          # Dead-letter job replay, background job monitoring
│   │   │   ├── departments.py   # Department CRUD + admin assignment
│   │   │   └── _helpers.py      # Shared validation, sanitization, pagination
│   │   ├── lecturer.py          # Attendance sessions, marking, rollback window
│   │   ├── student.py           # Dashboard, attendance summary, leave appeals
│   │   ├── recognition.py       # Face search (identify student/lecturer from frame)
│   │   ├── timetable.py         # Timetable generation, conflict detection
│   │   ├── calendar.py          # Academic calendar CRUD
│   │   └── notifications.py     # Email/SMS stubs
│   ├── services/                # Business logic layer
│   │   ├── face_recognition.py  # FaceNet embedding generation, cosine matching, caching
│   │   ├── capture_upload.py    # Batch face capture from classroom frames
│   │   ├── email_service.py     # SMTP/yagmail for OTP, password reset, notifications
│   │   └── attendance_calc.py   # Leave-adjusted attendance, eligibility logic
│   ├── security/                # Security middleware
│   │   ├── auth_decorators.py   # @role_required, @limiter, @validate_ids
│   │   ├── rate_limiter.py      # Flask-Limiter (Redis-backed)
│   │   └── brute_force_protection.py  # Account lockout after N failed attempts
│   ├── observability/           # Monitoring & logging
│   │   ├── logging.py           # Structured JSON logging
│   │   ├── error_tracking.py    # Sentry integration + custom error handlers
│   │   ├── metrics.py           # Prometheus metrics + middleware
│   │   └── health.py            # Health check endpoint
│   └── utils/                   # Helpers & utilities
│       ├── validation.py        # Email, password, phone validation
│       ├── helpers.py           # Common functions (sanitize, encode/decode)
│       └── dateTime.py          # Date formatting, timezone handling
├── migrations/                  # Versioned database migrations
│   ├── m20260413_001_normalize_attendance_sessions.py
│   ├── m20260417_002_rbac_department_migration.py
│   └── runner.py                # Migration executor
├── tests/                       # pytest suite
│   ├── test_api_flows.py        # End-to-end API tests
│   ├── test_admin_profile_pictures.py
│   └── test_rbac.py
├── scripts/                     # PowerShell/Bash maintenance scripts
│   ├── run_daily_maintenance.ps1
│   ├── register_daily_maintenance_task.ps1
│   └── run_weekly_restore_drill.ps1
├── dataset/                     # Face datasets for model training
│   └── {user_id}_{name}/        # Per-student folder with face crops
├── uploads/                     # Classroom upload bundles (temporary)
│   └── {paper_code}_{timestamp}/
├── trainer/                     # Trained face recognition model artifacts
│   └── face_trainer.keras       # Primary InceptionResNetV1 model (preserved)
├── backups/                     # JSONL backups for recovery
├── logs/                        # Structured logs with rotation
│   └── logs.txt
├── requirements.txt             # Python dependencies
├── run.py                       # App entry point (Gunicorn target)
├── worker.py                    # Background job processor
├── migrate.py                   # Migration CLI
├── seedAdmin.py                 # Initial admin creation
├── backup.py                    # JSONL backup utility
├── restore.py                   # JSONL restore utility
└── Dockerfile                   # Containerization
```

### Frontend Structure
```
frontend/
├── src/
│   ├── App.jsx                  # Main router, global contexts (Auth, Theme, Training)
│   ├── main.jsx                 # React entry, root mount
│   ├── index.css                # Design tokens, Tailwind CSS, animations
│   ├── App.css                  # Global app styles
│   ├── api/
│   │   └── axios.js             # Axios instance with CSRF, auth interceptors
│   ├── pages/                   # Route-level components
│   │   ├── Login.jsx            # Login form, lockout handling, theme toggle
│   │   ├── ChangePassword.jsx   # Password change after first login
│   │   ├── ForgotPassword.jsx   # Password reset request + OTP entry
│   │   ├── admin/
│   │   │   ├── AdminDashboard.jsx       # KPIs, attendance trends, system health
│   │   │   ├── ManageCourses.jsx        # CRUD with Excel export
│   │   │   ├── ManagePapers.jsx         # CRUD, semester assignment
│   │   │   ├── ManageLecturers.jsx      # Bulk import, face enrollment, PIN reset
│   │   │   ├── ManageStudents.jsx       # Bulk import, filtering, face enrollment
│   │   │   ├── StudentEnrollment.jsx    # Face capture workflow
│   │   │   ├── ManageDepartments.jsx    # Department CRUD (Super Admin only)
│   │   │   ├── ManageDepartmentAdmins.jsx
│   │   │   ├── ManageTimetable.jsx      # Slot grid, conflict detection
│   │   │   ├── ManageCalendar.jsx       # Holiday/optional day management
│   │   │   ├── AttendanceMatrix.jsx     # Student-Paper-Attendance export
│   │   │   ├── AuditTrail.jsx           # Filtered audit log viewer
│   │   │   ├── ExamEligibility.jsx      # Eligibility matrix + overrides
│   │   │   ├── ManageLeaves.jsx         # Medical leave approval
│   │   │   └── DeadLetterJobs.jsx       # Job replay interface
│   │   ├── lecturer/
│   │   │   ├── LecturerDashboard.jsx    # Overview, today's sessions
│   │   │   ├── AttendanceSession.jsx    # Real-time session UI (capture, mark, commit)
│   │   │   ├── LecturerProgress.jsx     # Session history, attendance records
│   │   │   └── LecturerTimetable.jsx    # Weekly schedule
│   │   └── student/
│   │       ├── StudentDashboard.jsx     # KPIs, enrolled papers, leave balance
│   │       ├── AttendanceSummary.jsx    # Per-paper breakdown, eligibility warning
│   │       ├── StudentTimetable.jsx     # My timetable
│   │       ├── ExamPortal.jsx           # Eligibility check, results stub
│   │       └── StudentLeaveRequests.jsx # Medical leave requests
│   ├── components/              # Reusable component library
│   │   ├── layout/
│   │   │   ├── DashboardLayout.jsx      # Sidebar + Topbar wrapper
│   │   │   ├── Sidebar.jsx              # Role-based navigation tree
│   │   │   ├── Topbar.jsx               # User menu, logout, theme toggle
│   │   ├── recognition/
│   │   │   ├── WebcamFeed.jsx           # Video canvas with corner overlays + flip button
│   │   │   ├── UploadClassroomImage.jsx # Single/batch image upload + processing
│   │   │   ├── CameraAccessPrompt.jsx   # Camera permission guide
│   │   ├── admin/
│   │   │   ├── FaceEnrollmentModal.jsx  # Capture/upload face, duplicate detection
│   │   │   ├── BulkImportModal.jsx      # Excel file drop, validation, progress
│   │   │   ├── TrainingProgressPanel.jsx # Global training progress indicator
│   │   │   └── dashboard/
│   │   │       ├── MonthlyAttendanceTrend.jsx  # Chart (placeholder for charting lib)
│   │   │       ├── DashboardInsightsPanel.jsx
│   │   ├── calendar/
│   │   │   └── AcademicCalendarPanel.jsx # Interactive calendar with holiday markers
│   │   ├── timetable/
│   │   │   ├── TimetableGrid.jsx        # Slot grid view + conflict highlighting
│   │   │   └── SlotEditor.jsx           # Edit slot form
│   │   ├── ui/
│   │   │   ├── SplashScreen.jsx         # Animated loading screen
│   │   │   ├── StatePanel.jsx           # Unified loading/error/empty state
│   │   │   ├── StatsCard.jsx            # KPI card component
│   │   │   ├── Modal.jsx                # Reusable modal wrapper
│   │   │   ├── DataTable.jsx            # Sortable, paginated table
│   │   │   ├── FileUploadZone.jsx       # Drag-and-drop file upload
│   │   ├── theme/
│   │   │   └── ThemeToggle.jsx          # Dark/light mode switch
│   ├── context/
│   │   ├── AuthContext.jsx              # User, login, logout, refreshUser
│   │   ├── ThemeContext.jsx             # Dark/light theme management
│   │   ├── TrainingContext.jsx          # Global model training progress
│   ├── hooks/
│   │   ├── useAuth.js                   # AuthContext hook
│   │   ├── useTheme.js                  # ThemeContext hook
│   │   ├── useWebcam.js                 # Webcam stream + capture, face detection (MediaPipe)
│   │   ├── useDebouncedValue.js         # Debounced state for search
│   │   ├── useLocalStorage.js           # Persistent client-side storage
│   ├── utils/
│   │   ├── dateTime.js                  # ISO 8601 parsing, IST formatting
│   │   ├── courseDisplay.js             # Course name formatting
│   │   ├── validation.js                # Client-side email/phone validation
│   │   └── imageProcessing.js           # Base64 encoding, JPEG compression
│   ├── assets/                          # Images, icons, fonts
│   ├── index.html                       # HTML entry
│   ├── vite.config.js                   # Vite build config
│   ├── eslint.config.js                 # Linting rules
│   └── playwright.config.js             # E2E test configuration
├── tests/                               # Playwright E2E tests
├── package.json                         # Node dependencies
└── Dockerfile                           # Container build
```

---

## Frontend Architecture

### Technology Stack
- **React 19**: Component-based UI with hooks
- **Vite 8**: Lightning-fast dev server + optimized builds
- **Tailwind CSS 4**: Utility-first styling with design tokens
- **Framer Motion**: Smooth animations, transitions
- **MediaPipe Face Mesh**: Real-time facial landmark detection (browser-side)
- **Axios**: HTTP client with interceptors for CSRF + auth
- **React Router 7**: Client-side routing
- **React Hot Toast**: Non-blocking toast notifications
- **React Icons 5**: SVG icon library
- **HTML2Canvas + jsPDF**: PDF generation for reports

### Key Architectural Patterns

#### 1. **Context API for Global State**
- **AuthContext** ([frontend/src/context/AuthContext.jsx](frontend/src/context/AuthContext.jsx))
  - Stores: `user`, `loading`, JWT status
  - Methods: `login()`, `logout()`, `refreshUser()`
  - Persists to `sessionStorage` for tab-level session
  - On mount, calls `/auth/me` to validate server-side JWT

- **ThemeContext** ([frontend/src/context/ThemeContext.jsx](frontend/src/context/ThemeContext.jsx))
  - Stores: `theme` (dark/light)
  - Persists to `localStorage`

- **TrainingContext** ([frontend/src/context/TrainingContext.jsx](frontend/src/context/TrainingContext.jsx))
  - Tracks background model training progress
  - Notifies UI of job completion

#### 2. **API Layer with Security**
- **axios.js** ([frontend/src/api/axios.js](frontend/src/api/axios.js))
  - Intercepts all requests to add CSRF token header (`X-CSRF-TOKEN`)
  - Automatically attaches JWT via HTTP-only cookie
  - Handles 401 responses: clears `sessionStorage.user` and redirects to `/login`
  - Sets `Content-Type: application/json` except for FormData

#### 3. **Lazy Loading & Code Splitting**
- **App.jsx** ([frontend/src/App.jsx](frontend/src/App.jsx))
  - All pages loaded via `lazy()` + `Suspense`
  - Enforces 2.4s minimum splash screen time for smooth UX
  - PageMountNotifier tracks when each lazy page mounts
  - Fallback component shows loading spinner during chunk fetch

#### 4. **Role-Based Dashboards**
- **DashboardLayout** ([frontend/src/components/layout/DashboardLayout.jsx](frontend/src/components/layout/DashboardLayout.jsx))
  - Responsive sidebar (collapsible on mobile, persistent on desktop)
  - Routes controlled by `user.role`:
    - **super_admin**: All admin pages
    - **department_admin**: Department scoped admin pages
    - **lecturer**: Attendance session, history, timetable
    - **student**: Dashboard, attendance summary, leave requests

#### 5. **Real-Time Webcam Integration**
- **WebcamFeed** ([frontend/src/components/recognition/WebcamFeed.jsx](frontend/src/components/recognition/WebcamFeed.jsx))
  - Renders `<video>` element with MediaPipe overlay
  - Flip camera button for mobile devices
  - Live indicator with "LIVE" badge
  - Corner accent overlays for visual framing

- **useWebcam Hook** ([frontend/src/hooks/useWebcam.js](frontend/src/hooks/useWebcam.js))
  - Manages `getUserMedia()` with camera selection
  - Face detection via MediaPipe Face Mesh (client-side)
  - `captureFrame()` returns canvas image as base64
  - `flipCamera()` switches between front/rear on mobile
  - Handles permission errors gracefully

- **FaceEnrollmentModal** ([frontend/src/components/admin/FaceEnrollmentModal.jsx](frontend/src/components/admin/FaceEnrollmentModal.jsx))
  - Dual mode: webcam capture or file upload
  - Progress bars for capture (50 frames) and upload
  - Duplicate detection: POST `/admin/students/enroll` returns 409 if face exists
  - Confirmation dialog for overwrite (force=true)
  - Shows dataset save count and warnings

#### 6. **Form Handling & Validation**
- Client-side validation ([frontend/src/utils/validation.js](frontend/src/utils/validation.js))
  - Email regex, password strength checks
  - Phone number normalization (IST format)
- Server validation echoed back in error responses
- React Hot Toast for inline feedback

### Frontend Pages & Workflows

#### **Student Dashboard** ([frontend/src/pages/student/StudentDashboard.jsx](frontend/src/pages/student/StudentDashboard.jsx))
- **KPIs**: Total attendance %, eligible papers count, leave balance
- **Enrolled Papers**: Per-paper attendance % + eligibility warning
- **Academic Calendar**: Holiday + optional day visualization
- **Leave Balance**: Shows remaining medical leave days
- **Face Enrollment CTA**: If `has_face_enrolled === false`

#### **Attendance Session** ([frontend/src/pages/lecturer/AttendanceSession.jsx](frontend/src/pages/lecturer/AttendanceSession.jsx))
- **Session Lifecycle**: Start → Pause → Resume → Stop (with PIN confirmation)
- **Live Capture**: Webcam feed with batch image collection
- **Face Search**: `POST /recognition/find-student` matches captured faces
- **Attendance Marking**: Click to add/remove student from session list
- **Rollback Window**: Shows remaining time to edit (default 30 mins)
- **Commit**: PIN-protected final submission

#### **Admin Dashboards**
- **ManageStudents** ([frontend/src/pages/admin/ManageStudents.jsx](frontend/src/pages/admin/ManageStudents.jsx))
  - Filterable table: course, paper, semester, academic session
  - Bulk import via Excel (`StudentEnrollmentModal`)
  - Face enrollment per student
  - Export to XLSX with attendance matrix

- **AttendanceMatrix** ([frontend/src/pages/admin/AttendanceMatrix.jsx](frontend/src/pages/admin/AttendanceMatrix.jsx))
  - Pivot table: students × papers × attendance status
  - Excel export with formulas for totals
  - Filter by course, department, academic session

---

## Backend Architecture

### Core Layers

#### **1. Application Factory** ([backend/app/__init__.py](backend/app/__init__.py))
- Initializes Flask with all extensions (MongoDB, JWT, CORS, rate limiter)
- Registers all blueprints with URL prefixes:
  - `/api/auth` → auth.py
  - `/api/admin` → admin package
  - `/api/lecturer` → lecturer.py
  - `/api/student` → student.py
  - `/api/recognition` → recognition.py
  - `/api/timetable` → timetable.py
  - `/api/calendar` → calendar.py
  - `/api/health` → observability/health.py
- Enforces security headers (CSP, HSTS, X-Frame-Options, etc.)
- Creates and ensures all MongoDB indexes
- Runs startup health checks and migrations

#### **2. Models Layer** - Thin MongoDB Wrappers
All models in `backend/app/models/` follow a pattern: simple CRUD + domain logic.

| Model | Purpose | Key Collections |
|-------|---------|-----------------|
| [user.py](backend/app/models/user.py) | User CRUD, password hashing, PIN management, brute-force tracking | `auth.users` |
| [course.py](backend/app/models/course.py) | Course CRUD, department relationship | `academic.courses` |
| [paper.py](backend/app/models/paper.py) | Paper (Subject) CRUD, lecturer assignment | `academic.papers` |
| [enrollment.py](backend/app/models/enrollment.py) | Student profiles, face embeddings (encrypted), paper enrollment | `academic.student_profiles` |
| [attendance.py](backend/app/models/attendance.py) | Log attendance, session tracking, rollback window | `attendance.attendance_logs`, `attendance.attendance_sessions` |
| [audit.py](backend/app/models/audit.py) | Audit trail with deduplication, rollback metadata | `audit.audit_logs` |
| [calendar.py](backend/app/models/calendar.py) | Academic calendar: holidays, optional days | `academic.calendar` |
| [timetable.py](backend/app/models/timetable.py) | Timetable + slot assignment, conflict detection | `academic.timetables`, `academic.timetable_slots` |
| [department.py](backend/app/models/department.py) | Department CRUD for multi-tenancy | `academic.departments` |

**Example - Enrollment Model** ([backend/app/models/enrollment.py](backend/app/models/enrollment.py)):
```python
def get_profile_by_user(user_id):
    """Fetch student profile with face embeddings."""
    profiles = get_collection("academic", "student_profiles")
    profile = profiles.find_one({"user_id": user_id})
    return profile

def add_face_embedding(user_id, embedding, photo_url=None):
    """Append encrypted face embedding to student profile."""
    push_fields = {"face_embeddings": encode_face_embedding(embedding)}
    if photo_url:
        push_fields["photo_urls"] = photo_url
    profiles = get_collection("academic", "student_profiles")
    profiles.update_one({"user_id": user_id}, {"$push": push_fields})

def set_face_embeddings(user_id, embeddings):
    """Replace full embedding set (used post-model-training)."""
    profiles = get_collection("academic", "student_profiles")
    profiles.update_one(
        {"user_id": user_id},
        {"$set": {"face_embeddings": [encode_face_embedding(e) for e in embeddings]}}
    )
```

#### **3. Services Layer** - Business Logic

| Service | Purpose | Key Functions |
|---------|---------|----------------|
| [face_recognition.py](backend/app/services/face_recognition.py) | FaceNet embedding generation, cosine similarity matching, LRU caching | `generate_embedding()`, `find_best_match_cached()`, `prepare_profile_candidates()` |
| [capture_upload.py](backend/app/services/capture_upload.py) | Batch process classroom images, extract face crops | `save_classroom_upload()`, `capture_faces_for_user()` |
| [email_service.py](backend/app/services/email_service.py) | OTP generation, password reset emails, notifications | `send_otp_email()`, `send_password_reset_email()` |
| [attendance_calc.py](backend/app/services/attendance_calc.py) | Leave-adjusted attendance %, eligibility checks | `calculate_attendance_with_leaves()`, `is_eligible()` |

**Example - Face Recognition Service** ([backend/app/services/face_recognition.py](backend/app/services/face_recognition.py)):
```python
def find_best_match_cached(query_embedding, prepared_candidates, threshold=0.6):
    """Match query against pre-normalized candidates using vectorized cosine similarity."""
    # Normalizes query embedding to unit vector
    # Stacks all candidate vectors for O(1) dot product
    # Uses LRU cache to avoid re-stacking identical candidate sets
    # Returns (match_dict, similarity_score) or (None, best_score)
    pass
```

#### **4. Routes Layer** - API Endpoints

**Auth Routes** ([backend/app/routes/auth.py](backend/app/routes/auth.py)):
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/auth/login` | Email + password → JWT + user object |
| POST | `/auth/logout` | Invalidates JWT |
| GET | `/auth/me` | Fetches current user from JWT |
| POST | `/auth/change-password` | Force password change on first login |
| POST | `/auth/forgot-password` | Sends OTP to email |
| POST | `/auth/reset-password` | OTP + new password → password reset |
| GET | `/auth/health` | Health check endpoint |

**Admin Routes** ([backend/app/routes/admin/](backend/app/routes/admin/)):

| File | Endpoints | Purpose |
|------|-----------|---------|
| courses.py | `GET /papers`, `POST /papers`, `PUT /papers/{id}` | CRUD with visibility filtering |
| papers.py | Similar pattern | Subject CRUD, semester validation |
| lecturers.py | `GET /lecturers`, `POST /lecturers`, `POST /lecturers/{id}/pin` | Bulk import, PIN reset |
| students.py | `GET /students`, `POST /students/bulk-import`, `POST /students/export` | Bulk operations |
| enrollment.py | `POST /students/enroll`, `GET /students/profile` | Face enrollment + duplicate detection |
| attendance.py | `GET /audit-logs`, `POST /attendance/reassign-course` | Audit trail, rollback |
| departments.py | `GET /departments`, `POST /departments` | Department CRUD |
| jobs.py | `GET /jobs`, `POST /jobs/{id}/replay` | Dead-letter job management |

**Lecturer Routes** ([backend/app/routes/lecturer.py](backend/app/routes/lecturer.py)):
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/session/start` | Create attendance session for paper |
| POST | `/session/{id}/capture` | Upload batch of classroom images |
| POST | `/session/{id}/mark` | Add/remove student from session |
| POST | `/session/{id}/commit` | Finalize with PIN confirmation |
| GET | `/session/{id}` | Fetch session details for review |
| PUT | `/session/{id}` | Edit (within rollback window) |

**Student Routes** ([backend/app/routes/student.py](backend/app/routes/student.py)):
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/dashboard` | KPIs, enrolled papers, leave balance |
| GET | `/attendance` | Per-paper attendance breakdown |
| GET | `/attendance/{paper_id}` | Detailed attendance for paper |
| POST | `/leaves/appeal` | Submit medical leave request |
| GET | `/leaves` | View leave request history |

**Recognition Routes** ([backend/app/routes/recognition.py](backend/app/routes/recognition.py)):
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/find-student` | Identify student from face frame |
| POST | `/find-lecturer` | Identify lecturer from face frame |

#### **5. Security Layer**

**Authentication & Authorization**:
- [backend/app/security/auth_decorators.py](backend/app/security/auth_decorators.py)
  - `@jwt_required()` - Validates JWT, extracts user
  - `@role_required("admin")` - Enforces role; returns 403 if mismatch
  - `@limiter.limit("10 per minute")` - Rate limits endpoint
  - `@validate_ids("pid", "lid")` - Validates ObjectId format

**Rate Limiting**:
- [backend/app/security/rate_limiter.py](backend/app/security/rate_limiter.py)
  - Flask-Limiter with Redis storage backend
  - Per-IP rate limits (e.g., 10 requests/minute per endpoint)
  - Account lockout after N failed login attempts

**Brute Force Protection**:
- [backend/app/security/brute_force_protection.py](backend/app/security/brute_force_protection.py)
  - Tracks failed login attempts per email
  - Locks account for 15 minutes after 5 failures
  - Returns `lockout_until` timestamp in 401 response

---

## Database Schema & Models

### Multi-Database Architecture
The system isolates data into **4 separate MongoDB databases**:

```
MongoDB Instance
├── biometric_auth          # Authentication data
│   ├── users               # User accounts, roles, departments
│   ├── revoked_jwts        # Blacklisted JWT tokens
│   └── password_reset_otps # OTP codes for password reset
├── biometric_academic      # Academic data
│   ├── courses             # Degree programs
│   ├── papers              # Subjects/courses
│   ├── departments         # Organizational units
│   ├── student_profiles    # Student enrollment + biometrics
│   ├── timetables          # Semester schedules
│   └── timetable_slots     # Individual time slots
├── biometric_attendance_ops # Attendance operations (high-volume)
│   ├── attendance_logs     # Attendance records
│   ├── attendance_sessions # Session metadata
│   ├── active_sessions     # In-progress sessions
│   ├── background_jobs     # Async job queue + retry metadata
│   ├── exam_eligibility_overrides # Manual eligibility adjustments
│   └── schema_migrations   # Migration tracking
└── biometric_audit         # Compliance audit trail
    └── audit_logs          # All actions + rollback metadata
```

### Collections & Schemas

#### **auth.users**
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique, lowercased),
  password_hash: String (bcrypt),
  role: String (super_admin | department_admin | lecturer | student),
  department: String (legacy text field),
  department_id: ObjectId (reference to departments),
  must_change_password: Boolean,
  // Lecturer-specific
  pin_hash: String (optional, bcrypt),
  pin_last_set: Date,
  // Biometric tracking
  face_embeddings: [String] (encrypted),
  // Session management
  session_version: Integer (incremented on logout to revoke all JWTs),
  created_at: Date,
  // Audit
  failed_login_count: Integer,
  last_failed_login_at: Date,
  locked_until: Date
}
```

**Indexes**: `uq_users_email` (unique), `ix_users_role`, `ix_users_department`

#### **academic.student_profiles**
```javascript
{
  _id: ObjectId,
  user_id: String (reference to users._id, unique),
  reg_number: String (unique, registration number),
  course_id: ObjectId (reference to courses),
  department_id: ObjectId,
  academic_session: String (e.g., "2025-26"),
  academic_year: String (legacy),
  current_semester: Integer,
  enrolled_papers: [ObjectId] (references to papers),
  // Biometric
  face_embeddings: [String] (encrypted via AES-256-GCM),
  photo_urls: [String],
  biometric_consent: Boolean,
  // Leave management
  medical_leave_balance: Integer,
  medical_leave_used: Integer,
  course_status: String (active | inactive | graduated),
  created_at: Date
}
```

**Indexes**: `uq_profiles_user` (unique), `uq_profiles_reg` (unique), `ix_profiles_course`, `ix_profiles_department`

#### **academic.papers** (Subjects)
```javascript
{
  _id: ObjectId,
  name: String,
  code: String (unique),
  course_id: ObjectId (reference to courses),
  lecturer_id: ObjectId (reference to users),
  semester: Integer,
  total_classes: Integer,
  department_id: ObjectId,
  created_at: Date
}
```

**Indexes**: `uq_papers_code`, `ix_papers_course`, `ix_papers_lecturers`

#### **attendance.attendance_logs**
```javascript
{
  _id: ObjectId,
  session_id: String,
  paper_id: ObjectId,
  user_id: String,
  lecturer_id: ObjectId,
  method: String (biometric | manual | correction),
  status: String (present | absent | leave),
  timestamp: Date,
  biometric_confidence: Float (0.0-1.0),
  created_at: Date
}
```

**Indexes**: `uq_attendance_session_paper_student` (unique), `ix_attendance_timestamp`, `ix_attendance_paper_student`

#### **attendance.attendance_sessions**
```javascript
{
  _id: ObjectId,
  session_id: String (unique, UUID),
  paper_id: ObjectId,
  lecturer_id: ObjectId,
  user_ids: [String] (present students),
  start_time: Date,
  end_time: Date,
  created_at: Date,
  committed_at: Date,
  rollback_until: Date (created_at + 30 mins),
  finalized: Boolean,
  method: String (biometric | manual)
}
```

**Indexes**: `uq_sessions_id`, `ix_sessions_lecturer_created`, `ix_sessions_rollback_until`

#### **audit.audit_logs**
```javascript
{
  _id: ObjectId,
  action: String (CREATE_PAPER, DELETE_USER, MARK_ATTENDANCE, etc.),
  performed_by: ObjectId,
  timestamp: Date,
  details: String,
  rollback: {
    collection: String,
    operation: String (delete, $set),
    filter: Object,
    replacement: Object
  },
  dedupe_key: String (optional, for deduplication),
  dedupe_bucket: Integer (for partitioned index)
}
```

**Indexes**: `ix_audit_timestamp`, `ix_audit_action`, `uq_audit_dedupe_bucket` (partial)

---

## API Endpoints

### Authentication Endpoints
```
POST /api/auth/login
  Request:  { email, password }
  Response: { user: {...}, message }
  Status:   200 | 400 | 401 | 429 (rate limited)

POST /api/auth/logout
  Response: { message }
  Status:   200

GET /api/auth/me
  Response: { user: {...} } or { error }
  Status:   200 | 401

POST /api/auth/change-password
  Request:  { new_password }
  Response: { message }
  Status:   200 | 400 | 401

POST /api/auth/forgot-password
  Request:  { email }
  Response: { message }
  Status:   200 | 404

POST /api/auth/reset-password
  Request:  { email, otp, new_password }
  Response: { message }
  Status:   200 | 400 | 401
```

### Admin Endpoints (Role: department_admin, super_admin)
```
# Courses
GET  /api/admin/courses?page=1&per_page=50
POST /api/admin/courses
PUT  /api/admin/courses/{id}
DELETE /api/admin/courses/{id}

# Papers
GET  /api/admin/papers?course_id=X
POST /api/admin/papers
PUT  /api/admin/papers/{id}
DELETE /api/admin/papers/{id}

# Students
GET  /api/admin/students?course_id=X&paper_id=Y
POST /api/admin/students/bulk-import (multipart/form-data: file)
POST /api/admin/students/export
POST /api/admin/students/enroll (JSON: user_id, photo or dataset_photos)

# Audit
GET  /api/admin/audit-logs?action=CREATE_PAPER&from=2025-01-01&to=2025-12-31

# Stats
GET  /api/admin/stats
```

### Lecturer Endpoints (Role: lecturer)
```
POST /api/lecturer/session/start
  Request:  { paper_id }
  Response: { session_id, session }

POST /api/lecturer/session/{id}/capture
  Request:  { classroom_images: [base64, ...], dataset_mode: bool }
  Response: { captured_students: [...] }

POST /api/lecturer/session/{id}/mark
  Request:  { user_id, method: "add" | "remove" }
  Response: { marked_students: [...] }

POST /api/lecturer/session/{id}/commit
  Request:  { pin }
  Response: { message, session }
  Status:   200 | 403 (PIN mismatch) | 409 (not editable)

GET  /api/lecturer/session/{id}
  Response: { session, present_students, candidates, editable, rollback_until }
```

### Student Endpoints (Role: student)
```
GET /api/student/dashboard
  Response: { profile, papers, attendance, predictions, leave_balance }

GET /api/student/attendance
  Response: [{ paper_id, paper_name, attendance_percentage, eligible }]

GET /api/student/attendance/{paper_id}
  Response: { details: [...], attendance_logs: [...] }

POST /api/student/leaves/appeal
  Request:  { paper_id, reason, medical_certificate: base64 }
  Response: { appeal_id, status }
```

### Recognition Endpoints (Role: admin, lecturer)
```
POST /api/recognition/find-student
  Request:  { frame: base64 }
  Response: { student: { name, reg_number, department, course, similarity } }
  Status:   200 | 400 | 404

POST /api/recognition/find-lecturer
  Request:  { frame: base64 }
  Response: { lecturer: { name, pin_required, department } }
```

### Health & Status
```
GET /api/health/status
  Response: { status: "healthy", uptime_seconds, database_status, queue_status }

GET /api/health/metrics
  Response: Prometheus metrics in text format
```

---

## Authentication & Authorization

### Authentication Flow

#### **Login**
1. User POSTs `email` + `password` to `/auth/login`
2. Backend:
   - Validates rate limit (10 failures per minute per IP) → 429 if exceeded
   - Looks up user by normalized email
   - Verifies password with bcrypt → 401 if mismatch
   - Increments `failed_login_count` on mismatch
   - Locks account for 15 mins after 5 failures
   - On success: clears `failed_login_count`
   - Generates JWT with claims: `sub` (email), `user_id`, `role`, `dept_id`, `sv` (session version)
   - Sets JWT in **HTTP-only, Secure, SameSite=Lax** cookie
   - Returns user object with `has_face_enrolled` status
3. Frontend:
   - Receives user object, caches display data to `sessionStorage`
   - Stores JWT in cookie (automatically sent on CORS requests)
   - Redirects to role-based dashboard

#### **JWT Validation**
- Backend `@jwt_required()` decorator:
  - Extracts JWT from HTTP-only cookie
  - Verifies signature with `JWT_SECRET_KEY`
  - Checks expiration
  - Checks revocation: queries `auth.revoked_jwts` for `jti` claim
  - Validates session version: user's `session_version` must match token's `sv` claim
  - On mismatch: returns 401 (user logged out elsewhere)
  - On success: sets `g.current_user` with full user document

#### **Token Refresh & Revocation**
- `/auth/logout` adds `jti` to `auth.revoked_jwts` blacklist
- Session version incremented on password change → all old JWTs invalid
- CSRF token included in cookie; POST/PUT/DELETE endpoints verify `X-CSRF-TOKEN` header

### Authorization

#### **4-Tier RBAC Model**
```
super_admin
  ├── Can see all data across all departments
  ├── Can manage departments and department admins
  └── Can override audit trails

department_admin
  ├── Can see data within assigned department only
  ├── Can manage courses, papers, lecturers, students (within dept)
  ├── Cannot delete super_admin or create new super_admins
  └── Can see audit trails for their department

lecturer
  ├── Can create attendance sessions for assigned papers
  ├── Can view own attendance history
  ├── Requires PIN to commit attendance
  └── Can only view their students

student
  ├── Can view own attendance
  ├── Can view own timetable
  ├── Can submit medical leave appeals
  └── Cannot see other students' data
```

#### **Decorator Enforcement**
```python
@app.route("/api/admin/courses", methods=["POST"])
@jwt_required()
@role_required("department_admin")  # Rejects student, lecturer with 403
def create_course(user):
    # user has been validated; role check already passed
    pass
```

#### **Data Visibility Filtering**
- Admin endpoints filter by `user.department_id` if user is `department_admin`
- Student endpoints filter by `user._id` (only own data)
- Lecturer endpoints filter by `lecturer_id` (only own sessions + students)

---

## Face Recognition & Biometrics

### Face Detection Pipeline

#### **Client-Side (Frontend)**
1. **WebcamFeed.jsx**: Renders `<video>` with `getUserMedia()` stream
2. **useWebcam Hook**: Integrates MediaPipe Face Mesh on every frame
   - Detects facial landmarks (468 points)
   - Extracts face bounding box
   - Crops to `160×160` square (normalized)
3. **FaceEnrollmentModal**: Captures 50 frames during enrollment
   - Base64-encodes each frame
   - Batches and POSTs to `/admin/students/enroll`

#### **Server-Side (Backend)**
1. **Face Detection** ([backend/app/services/face_recognition.py](backend/app/services/face_recognition.py))
   - MediaPipe detector (CPU-optimized, runs fast)
   - Detects largest face in frame
   - Returns crop, confidence, landmarks
2. **Embedding Generation**
   - Input: `160×160` RGB image
   - Model: **InceptionResNetV1** (FaceNet-512D) from `keras-facenet`
   - Output: 512-dimensional vector
   - Normalization: L2 norm for unit vector (cosine similarity works on normalized vectors)
3. **Embedding Storage**
   - Encryption: AES-256-GCM with `FACE_EMBEDDING_ENCRYPTION_KEY`
   - Serialization: `"enc:" + base64(ciphertext + IV + tag)`
   - Storage: `student_profile.face_embeddings: [String]` array

### Face Matching Algorithm

#### **Cosine Similarity Matching**
```python
def find_best_match_cached(query_embedding, candidates, threshold=0.6):
    """
    Match query vector against all candidate embeddings.
    
    Args:
        query_embedding: 512-d vector (list or np.ndarray)
        candidates: list of { user_id, vectors: [512-d each], reg_number }
        threshold: min similarity (0-1) to return match
    
    Returns:
        (match_dict, best_score) where match_dict = {user_id, similarity, reg_number}
    """
    # Normalize query to unit vector
    query = L2_normalize(query_embedding)
    
    # Stack all candidate vectors
    all_vectors = vstack([c['vectors'] for c in candidates])  # (M, 512)
    
    # Compute cosine similarities
    similarities = dot(all_vectors, query)  # (M,)
    
    # Find best per candidate
    best_per_candidate = max_per_group(similarities, candidate_groups)
    
    # Return best if exceeds threshold
    if best_per_candidate.max() >= threshold:
        return best_candidate, best_score
    return None, best_score
```

#### **Similarity Threshold Tuning**
- **Enrollment (strict)**: `threshold=0.7` — prevents duplicate/confused enrollments
- **Attendance (lenient)**: `threshold=0.6` — accounts for lighting, pose changes
- **Recognition (default)**: `threshold=0.6` — balances recall vs precision

### Duplicate Detection & Conflict Resolution

When a student enrolls a new face:
1. POST `/admin/students/enroll` with `photo` (base64)
2. Backend:
   - Generates embedding for uploaded photo
   - Searches all student profiles for matches (threshold=0.7)
   - If match found:
     - Returns **409 Conflict** with `{ match_found: true, matching_user, similarity }`
     - Frontend shows confirmation dialog
   - Admin can force overwrite with `force: true` in second request
   - Student cannot force (denied with 400)
3. On success:
   - Embedding stored to `student_profile.face_embeddings`
   - Dataset crops saved to `dataset/{user_id}_{name}/`
   - Returns `{ message, dataset_saved_count, dataset_warning }`

### Model Training Pipeline

#### **Trainer Service**
- Triggered after batch enrollment (10+ students)
- Reads all `dataset/` folders
- Retrains InceptionResNetV1 with new data
- Saves to `backend/trainer/face_trainer.keras` (preserved across cleanup)
- Updates all embeddings in database with new model's output

#### **Lazy Model Loading**
```python
def _load_model():
    global _model
    if _model is not None:
        return _model
    
    with _model_lock:
        if _model is not None:
            return _model
        
        # Load from keras-facenet on first call
        from keras_facenet import FaceNet
        _model = FaceNet()
        return _model
```
- Model loaded once, cached in memory
- Thread-safe via lock
- Avoids slow startup time

#### **LRU Cache for Embedding Stacks**
- After each candidate preparation, stacks vectors
- Caches `(all_vectors, owner_indices)` in OrderedDict
- Max 128 cached candidate sets
- Cache key is SHA256 hash of candidate fingerprints
- Reduces redundant `vstack()` operations during repeated searches

### Privacy & Security

#### **Biometric Consent**
- `student_profile.biometric_consent: Boolean`
- Checkbox on enrollment form (opt-in)
- Only store embeddings if consent=true
- Cannot use face recognition without consent

#### **Encryption at Rest**
- Embeddings encrypted with AES-256-GCM
- Key: `FACE_EMBEDDING_ENCRYPTION_KEY` from `.env`
- IV + ciphertext + auth tag serialized as single string
- Decryption only on matching operations

#### **Audit Logging**
- All biometric access logged to `audit.audit_logs`
- Actions: `ENROLL_FACE`, `SEARCH_FACE`, `MATCH_FOUND`, `MATCH_FAILED`
- Logged in `_log_biometric_read()` with user_id, paper_id, action
- Deduplication: same read from same actor within 60s logged once

#### **Data Subject Rights**
- `DELETE /api/admin/students/{id}` triggers:
  - Delete `student_profile` document
  - Delete `dataset/{user_id}/` folder
  - Delete `uploads/` with matching prefixes
  - Delete all audit logs for user
  - Delete all attendance records

---

## Key Workflows

### 1. **User Enrollment Workflow**

#### **Lecturer Onboarding**
```
Admin uploads Excel with:
  name, email, department, papers (comma-separated codes)
  ↓
Backend validates:
  ✓ Email unique
  ✓ Papers exist
  ✓ Department correct
  ↓
Creates users with:
  temporary_password (generated secure string)
  role = "lecturer"
  must_change_password = true
  ↓
Sends email with login credentials
  ↓
Lecturer logs in:
  Prompted to change password
  Shown "Set PIN" dialog (for session confirmation)
  ↓
PIN stored as bcrypt hash in user.pin_hash
```

#### **Student Enrollment**
```
Admin uploads Excel with:
  name, email, reg_number, course, academic_session
  ↓
Backend creates:
  user (temporary password, must_change_password=true)
  student_profile (empty face_embeddings)
  ↓
Student logs in:
  Changes password
  Sees "Enroll face" CTA
  ↓
Face Enrollment Modal:
  Capture 50 frames (camera) or upload single photo
  ↓
Backend:
  Detects face → generates embedding
  Checks for duplicates (threshold=0.7)
  If match found: frontend shows warning
  If no match: stores embedding + saves dataset crops
  ↓
Stores encrypted embedding in student_profile.face_embeddings[0]
  ↓
After N enrollments: background job trains new model
  Recomputes embeddings with new model
  Updates all profiles
```

### 2. **Attendance Marking Workflow**

#### **Lecturer-Driven Session**
```
Lecturer navigates to /lecturer/session
  ↓
Clicks "Start Session" for a paper
  ↓
Backend:
  Creates attendance_session with UUID
  Sets rollback_until = now + 30 mins
  ↓
Frontend shows:
  Real-time webcam feed
  "Capture" button to batch-process frames
  ↓
Lecturer captures 5-10 classroom images
  ↓
Backend:
  For each image:
    Detects all faces (MediaPipe)
    For largest face: generates embedding
    Searches student profiles: find_best_match_cached(embedding, threshold=0.6)
    Returns student_id + similarity
  ↓
Frontend:
  Shows matched students with similarity %
  Allows manual add/remove
  ↓
Lecturer reviews list, clicks "Commit"
  ↓
Backend asks for PIN (lecturer confirmation)
  ↓
Backend:
  Validates PIN (bcrypt check against user.pin_hash)
  Inserts attendance_logs for all marked students
  Sets attendance_sessions.committed_at = now
  Sets attendance_sessions.finalized = false (editable for 30 mins)
  ↓
Within 30 mins:
  Lecturer can:
    PUT /api/lecturer/session/{id} with new attendance list
    System replaces logs (DELETE old, INSERT new)
  ↓
After 30 mins:
  System locks session
  PUT returns 409 "Not editable"
```

#### **Batch Image Processing**
```
POST /api/lecturer/session/{id}/capture
  Request: { classroom_images: [base64, base64, ...] }
  ↓
Backend stream processes each image:
  1. Decode base64 → JPEG
  2. Run MediaPipe detector → list of faces
  3. For each face:
       Crop to 160×160
       Generate embedding with FaceNet
       Search student profiles
       If match found (sim >= 0.6): add to results
  ↓
Returns: { captured_students: [{user_id, name, similarity}, ...] }
```

### 3. **Leave & Eligibility Workflow**

#### **Medical Leave Appeal**
```
Student views /student/dashboard
  ↓
Sees leave_balance < threshold
  ↓
Clicks "Appeal Leave"
  ↓
Frontend form:
  Paper selection
  Reason text
  Medical certificate upload (PDF)
  ↓
POST /api/student/leaves/appeal
  ↓
Backend:
  Creates record in leave_appeals collection
  Sends email to department_admin
  ↓
Department admin sees pending appeals in /admin/manage-leaves
  ↓
Admin approves:
  POST /api/admin/leaves/{appeal_id}/approve
  ↓
Backend:
  Updates exam_eligibility_overrides:
    { user_id, paper_id, override_eligible: true }
  Triggers recalculation of student's eligibility
```

#### **Eligibility Calculation**
```
At any time, student eligibility for paper = attendance_percentage >= 75%
  UNLESS:
  1. exam_eligibility_overrides has override_eligible: true → eligible
  2. Medical leave applied:
       adjusted_attendance = (present + approved_leave) / (total_classes - cancelled_classes) * 100
       if >= 75% → eligible
```

### 4. **Audit & Rollback Workflow**

#### **Admin Action Logged**
```
Admin creates paper:
  POST /api/admin/papers
  ↓
Backend:
  Inserts paper document
  Gets _id of new paper
  ↓
  Calls log_action(
    action="CREATE_PAPER",
    performed_by=admin_id,
    details=f"Paper {code}",
    rollback=_rb_delete("academic", "papers", {"_id": paper._id})
  )
  ↓
  Inserts audit_log with:
    { action, performed_by, timestamp, details, rollback: {...} }
```

#### **Viewing Audit Trail**
```
Admin navigates to /admin/audit-logs
  ↓
Frontend filters by:
  action keyword (e.g., "CREATE", "DELETE")
  date range
  department (if super_admin)
  ↓
Backend paginates audit_logs:
  50 per page (configurable)
  Returns action, user name, timestamp, details
  ↓
Admin clicks "View Rollback Metadata"
  ↓
Shows:
  Collection, operation, filter, replacement values
  "Confirm Rollback?" button
```

---

## External Dependencies & Integrations

### Python Backend

#### **Core Web Framework**
| Package | Version | Purpose |
|---------|---------|---------|
| Flask | 3.1.3 | Web framework, routing, middleware |
| Flask-PyMongo | 2.3.0 | MongoDB connection pooling |
| Flask-JWT-Extended | 4.7.1 | JWT generation, validation, refresh |
| Flask-CORS | 6.0.0 | Cross-Origin requests handling |
| Gunicorn | 23.0.0 | Production WSGI server |

#### **Security**
| Package | Version | Purpose |
|---------|---------|---------|
| bcrypt | 4.2.1 | Password hashing (Blowfish) |
| cryptography | 46.0.7 | AES-256-GCM for embedding encryption |
| Flask-Limiter | 3.5.0 | Rate limiting (Redis-backed) |
| PyJWT | (via Flask-JWT-Extended) | JWT encoding/decoding |

#### **Computer Vision & ML**
| Package | Version | Purpose |
|---------|---------|---------|
| opencv-python-headless | 4.11.0.86 | Image processing (no GUI) |
| mediapipe | 0.10.21 | Real-time face detection + landmarks |
| keras-facenet | 0.3.2 | Pre-trained InceptionResNetV1 |
| tensorflow | 2.16.2 | Deep learning backend for Keras |
| numpy | 1.26.4 | Numerical operations, vectorization |
| scipy | 1.14.1 | Advanced math (cosine similarity) |
| Pillow | 12.2.0 | Image I/O and manipulation |
| imutils | 0.5.4 | Convenient image processing functions |

#### **Database & Caching**
| Package | Version | Purpose |
|---------|---------|---------|
| pymongo | 4.11.3 | MongoDB driver |
| redis | 5.2.1 | Redis client for queue/caching |

#### **Data & Reporting**
| Package | Version | Purpose |
|---------|---------|---------|
| openpyxl | 3.1.5 | Excel (.xlsx) file generation |
| reportlab | 4.4.10 | PDF generation for reports |
| python-json-logger | 2.0.7 | Structured JSON logging |

#### **Observability**
| Package | Version | Purpose |
|---------|---------|---------|
| prometheus-client | 0.19.0 | Prometheus metrics exposure |
| sentry-sdk | 2.8.0 | Error tracking and reporting |

#### **Utilities**
| Package | Version | Purpose |
|---------|---------|---------|
| python-dotenv | 1.2.2 | `.env` file configuration |
| yagmail | 0.15.293 | Gmail SMTP client for emails |

### Frontend Dependencies

#### **Core Framework & Build**
| Package | Version | Purpose |
|---------|---------|---------|
| react | 19.2.4 | UI library |
| react-dom | 19.2.4 | React DOM rendering |
| vite | 8.0.5 | Lightning-fast build tool |
| @vitejs/plugin-react | 6.0.1 | React Fast Refresh for Vite |

#### **Routing & State**
| Package | Version | Purpose |
|---------|---------|---------|
| react-router-dom | 7.13.2 | Client-side routing |
| framer-motion | 12.38.0 | Animation library |

#### **HTTP & API**
| Package | Version | Purpose |
|---------|---------|---------|
| axios | 1.15.0 | HTTP client with interceptors |

#### **Biometric & Webcam**
| Package | Version | Purpose |
|---------|---------|---------|
| @mediapipe/face_mesh | 0.4.1633559619 | Face detection in browser |
| @mediapipe/camera_utils | 0.3.1675466862 | Camera stream handling |
| @mediapipe/drawing_utils | 0.3.1675466124 | Landmark visualization |

#### **UI & Styling**
| Package | Version | Purpose |
|---------|---------|---------|
| tailwindcss | 4.2.2 | Utility-first CSS framework |
| @tailwindcss/vite | 4.2.2 | Tailwind Vite integration |
| react-hot-toast | 2.6.0 | Toast notifications |
| react-icons | 5.6.0 | Icon library (SVG) |
| react-easy-crop | 5.5.7 | Image cropping component |

#### **Data Export**
| Package | Version | Purpose |
|---------|---------|---------|
| jspdf | 4.2.1 | PDF generation (client-side) |
| html2canvas | 1.4.1 | HTML to canvas (for PDF) |
| xlsx | 0.20.3 (@e965/xlsx) | Excel file generation |

#### **Development & Testing**
| Package | Version | Purpose |
|---------|---------|---------|
| eslint | 9.39.4 | JavaScript linting |
| @playwright/test | 1.55.1 | End-to-end browser testing |
| vite | 8.0.5 | Build & dev server |

### External Services & APIs

#### **Email/SMTP**
- **Gmail via yagmail** (Python backend)
  - OTP delivery for password reset
  - Leave approval notifications
  - Requires SMTP credentials in `.env`

#### **Monitoring & Error Tracking**
- **Sentry** (optional)
  - Error tracking and alerting
  - Performance monitoring
  - Configure via `SENTRY_DSN` in `.env`

#### **Metrics Collection**
- **Prometheus** (optional)
  - Scrapes `/api/health/metrics`
  - Tracks request counts, latency, errors
  - No external dependency; built-in via `prometheus-client`

---

## Observability & Logging

### Logging Architecture

#### **Backend Structured Logging** ([backend/app/observability/logging.py](backend/app/observability/logging.py))
- **JSON Format**: Every log line is valid JSON for easy parsing
- **Rotation**: RotatingFileHandler with 5MB file size limit, 3 backups
- **Log File**: `backend/logs/logs.txt`
- **Levels**: INFO (default), DEBUG, WARNING, ERROR, CRITICAL
- **Fields**: timestamp, level, logger, message, request_id, user_id, duration_ms

#### **Structured Fields**
```json
{
  "timestamp": "2025-01-15T10:30:45.123Z",
  "level": "INFO",
  "logger": "biometric.attendance",
  "message": "Attendance session committed",
  "session_id": "uuid-xxx",
  "user_id": "lecturer-id",
  "paper_id": "paper-id",
  "marked_count": 42,
  "duration_ms": 234
}
```

#### **Sensitive Data Redaction**
- Passwords never logged
- PINs never logged
- Embeddings logged only as count, not values
- Email addresses only in audit context

### Error Tracking

#### **Sentry Integration** ([backend/app/observability/error_tracking.py](backend/app/observability/error_tracking.py))
- Captures unhandled exceptions
- Sends to Sentry if `SENTRY_DSN` configured
- Tags errors with: environment, service, user_id
- Configurable sample rate (default 0.1 = 10%)

#### **Custom Error Handlers**
- 400: "Bad Request" → logs request body (redacted)
- 401: "Unauthorized" → no sensitive data leaked
- 404: "Not Found" → logs endpoint
- 500: "Internal Server Error" → full traceback to Sentry

### Metrics & Health Checks

#### **Prometheus Metrics** ([backend/app/observability/metrics.py](backend/app/observability/metrics.py))
```
Endpoint: GET /api/health/metrics

Metrics exposed:
  flask_http_request_duration_seconds (histogram)
  flask_http_request_total (counter)
  flask_http_request_exceptions_total (counter)
  mongodb_connection_time_seconds (histogram)
  face_recognition_match_time_seconds (histogram)
  attendance_session_duration_seconds (histogram)
```

#### **Health Check Endpoint** ([backend/app/observability/health.py](backend/app/observability/health.py))
```
GET /api/health/status

Response:
{
  "status": "healthy" | "degraded" | "unhealthy",
  "uptime_seconds": 12345,
  "database": {
    "status": "connected",
    "latency_ms": 5
  },
  "redis": {
    "status": "connected" | "disconnected",
    "latency_ms": 2
  },
  "queue": {
    "pending_jobs": 3,
    "failed_jobs": 0
  },
  "timestamp": "2025-01-15T10:30:45Z"
}
```

### Audit Logging

#### **All Actions Logged**
- User creation, modification, deletion
- Course/paper CRUD
- Attendance session start/commit
- Face enrollment
- Password changes
- Login attempts (failed attempts tracked for rate limiting)
- Bulk imports/exports

#### **Deduplication Strategy**
- High-volume reads (e.g., profile access) deduplicated
- Same user, same endpoint, same 60-second window → logged once
- Unique actions (e.g., CREATE_PAPER) logged on every call
- Dedupe key: `action|actor_id|resource_id|path|method`

#### **Rollback Metadata**
- Every CREATE/UPDATE/DELETE stores undo metadata
- MongoDB operation + filter + replacement document
- Admin can replay rollback via `/api/admin/audit-logs/{id}/rollback`

---

## Summary

This comprehensive architecture provides:

✅ **Scalable multi-tenant design** with department-level isolation  
✅ **Privacy-first biometric handling** with encryption, consent, audit trails  
✅ **Real-time face recognition** using FaceNet embeddings + cosine matching  
✅ **Role-based access control** across 4 user tiers  
✅ **High-availability backend** with Redis caching, job queue, rate limiting  
✅ **Modern frontend** with lazy loading, responsive UI, real-time webcam  
✅ **Production observability** with structured logs, metrics, error tracking  
✅ **Compliance-ready** with audit trails, data subject rights, encryption  

---

**End of Architecture Overview**
