# Biometric Face Attendance Management System

Final-year full stack project for smart classroom attendance using face recognition, role-based dashboards, and audit-driven administration.

## Overview

This system provides:

- Admin management for courses, papers, lecturers, and students
- Biometric attendance capture for lecturers
- Attendance analytics and eligibility views for students
- Audit trail with rollback support for eligible admin actions

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, Vite, Tailwind CSS, Framer Motion |
| Backend | Python, Flask, Flask-JWT-Extended |
| Database | MongoDB |
| Face Pipeline | MediaPipe (face detection), FaceNet-style embeddings |
| UX Libraries | React Hot Toast, React Icons |

## Core Features

### Admin

- CRUD: Courses, Papers, Lecturers, Students
- Smart student workflows:
	- Auto semester assignment at registration (Semester 1)
	- Bulk semester promotion with course-duration max-semester guard
	- Auto removal of old-semester paper mappings on promotion
- Student paper bulk assignment
- Lecturer-paper assignment management
- Face enrollment (upload photo -> detect face -> store embedding)
- Audit Trail with 1-day rollback for eligible create/update/delete operations

### Lecturer

- Attendance session lifecycle:
	- Start
	- Pause/Resume
	- Stop
- Live face recognition and recognized list updates
- PIN-protected commit and rollback window for corrections

### Student

- Course details and assigned papers
- Attendance summary by paper
- Prediction metrics:
	- Classes needed for 75%
	- Safe bunks remaining
- Exam eligibility view

## Project Structure

```text
.
├── .github/
│   └── workflows/
│       └── quality.yml   # CI checks (frontend lint/build + backend compile)
├── backend/
│   ├── .env.example      # Environment template
│   ├── app/
│   │   ├── models/        # Data access helpers
│   │   ├── routes/        # Auth/Admin/Lecturer/Student APIs
│   │   ├── services/      # Face detection/recognition logic
│   │   ├── utils/         # Helpers and decorators
│   │   ├── config.py
│   │   ├── extensions.py
│   │   └── __init__.py
│   ├── delete.py          # Full reset utility (DB + runtime folders)
│   ├── requirements.txt
│   ├── seedAdmin.py
│   └── run.py
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   └── pages/
│   ├── package.json
│   └── vite.config.js
├── .gitignore
└── README.md
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- MongoDB running locally (default `mongodb://localhost:27017`)

## Local Setup

### 1. Backend

```bash
cd backend
# You can use either backend/.venv or the workspace-level .venv
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python seedAdmin.py
python run.py
```

Create `backend/.env` from `backend/.env.example`:

```bash
cd backend
copy .env.example .env
```

Then set values in `backend/.env`:

```dotenv
MONGO_URI=mongodb://localhost:27017/biometric_attendance
MONGO_DB_AUTH=biometric_auth
MONGO_DB_ACADEMIC=biometric_academic
MONGO_DB_ATTENDANCE=biometric_attendance_ops
MONGO_DB_AUDIT=biometric_audit
JWT_SECRET_KEY=replace-with-a-strong-random-secret
STRICT_JWT_SECRET=0
FACENET_THRESHOLD=0.60
CORS_ORIGINS=http://localhost:5173
UPLOAD_FOLDER=uploads
SLOW_REQUEST_THRESHOLD_MS=500

# Optional async job queue (recommended for production)
TASK_QUEUE_ENABLED=0
TASK_QUEUE_REDIS_URL=redis://localhost:6379/0
TASK_QUEUE_NAME=biometric:jobs
TASK_QUEUE_MAX_RETRIES=3
TASK_QUEUE_BASE_BACKOFF_SECONDS=10
TASK_QUEUE_MAX_BACKOFF_SECONDS=300
TASK_QUEUE_BACKOFF_JITTER_RATIO=0.25
TASK_QUEUE_RUNNING_TIMEOUT_SECONDS=900
```

Use your own strong JWT secret. Do not reuse sample values in production.

Backend runs on `http://localhost:5000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

### Optional Worker (Production Queue Mode)

If `TASK_QUEUE_ENABLED=1`, start a separate worker process:

```bash
cd backend
python worker.py
```

Queue behavior in this mode:

- Jobs are persisted in MongoDB (`attendance.background_jobs`)
- Failed jobs retry with exponential backoff and jitter
- After max retries, jobs move to dead-letter status (`dead_letter`)
- Stale running jobs are automatically recovered and re-queued by workers
- Metrics endpoint for admins: `GET /api/admin/jobs/metrics`
- List dead-letter jobs: `GET /api/admin/jobs/dead-letter` (supports `q`, `job_type`, `from`, `to`, `sort_by`, `sort_dir`, pagination)
- Replay dead-letter jobs: `POST /api/admin/jobs/<job_id>/replay`
- Bulk replay dead-letter jobs: `POST /api/admin/jobs/dead-letter/replay-bulk`
- Replay all currently filtered dead-letter jobs: `POST /api/admin/jobs/dead-letter/replay-filtered`

Vite proxy forwards `/api/*` to backend port `5000`.
Optional override:

```dotenv
VITE_API_PROXY_URL=http://localhost:5000
```

## Admin Seeding

Create the first admin from console:

```bash
cd backend
python seedAdmin.py
```

The script will ask for:

- Admin email
- Admin password
- Password confirmation

Notes:

- It only creates an admin if no admin exists.
- It stops if the email is already used.
- If you skip this step, backend startup can still auto-seed a default admin (`admin@system.com` / `admin123`) when no admin exists.

## Maintenance Utilities

### Full Reset Utility (`delete.py`)

Use this script when you want a clean project state for fresh testing.

From `backend/`:

```bash
python delete.py --yes
```

What it does:

- Drops all project MongoDB databases configured via app config.
- Clears generated runtime folders:
	- `uploads/` and `dataset/` at project root (if present)
	- `backend/uploads/`, `backend/dataset/`, `backend/instance/`
- Recreates the cleared directories so the app can start cleanly.

Safer mode (database only, keep files):

```bash
python delete.py --yes --mongo-only
```

Preview mode (no deletion):

```bash
python delete.py --dry-run
```

After reset:

```bash
python seedAdmin.py
python run.py
```

### Database Diagnostics

Check counts and required indexes:

```bash
cd backend
python db_diagnostics.py
```

## Authentication Transport

- JWT is transported using secure HttpOnly cookies (not localStorage bearer tokens).
- Frontend sends `withCredentials` requests to backend APIs.
- CSRF protection is enabled with double-submit cookie by default.

Optional cookie-related env vars:

```dotenv
JWT_COOKIE_SAMESITE=Lax
JWT_COOKIE_CSRF_PROTECT=1
JWT_COOKIE_DOMAIN=
```

## JWT Secret Enforcement

- Startup fails when `JWT_SECRET_KEY` is weak in non-local environments.
- To enforce this even in local/dev, set:

```dotenv
STRICT_JWT_SECRET=1
```

## Important Notes

- If backend routes are changed, restart backend (`python run.py`) to load updates.
- Some rollback controls appear only for eligible audit entries within 1 day.
- Uploaded/enrolled data can include local runtime artifacts; `.gitignore` excludes them.

## CI Quality Checks

GitHub Actions runs checks on pushes and PRs to `main` and `develop`:

- Frontend lint (`npm run lint`)
- Frontend production build (`npm run build`)
- Backend syntax compile check (`python -m compileall backend`)

## SPA Rewrite Rules (Production)

Because frontend uses `BrowserRouter`, server must rewrite unknown routes to `index.html`.

### Nginx

```nginx
location / {
	try_files $uri $uri/ /index.html;
}
```

### Apache (.htaccess)

```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
```

### Caddy

```caddy
try_files {path} /index.html
file_server
```

## Recognition Flow

```text
Frame -> Face Detection -> Face Crop -> Embedding Generation -> Similarity Match -> Attendance Mark
```

## License

Academic project.
