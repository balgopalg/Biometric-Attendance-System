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
├── backend/
│   ├── app/
│   │   ├── models/        # Data access helpers
│   │   ├── routes/        # Auth/Admin/Lecturer/Student APIs
│   │   ├── services/      # Face detection/recognition logic
│   │   ├── utils/         # Helpers and decorators
│   │   ├── config.py
│   │   ├── extensions.py
│   │   └── __init__.py
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

Create a `backend/.env` file (or copy from `backend/.env.example`) with:

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
