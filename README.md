# Biometric Face Attendance Management System

Production-ready full stack attendance platform for classroom operations using face recognition, role-based workflows, audit logging, and operational tooling.

## What This Repository Contains

- Backend API and background worker (Flask + MongoDB + Redis queue mode)
- Frontend web app (React + Vite)
- Face processing pipeline (MediaPipe + TensorFlow/Keras-based embedding flow)
- Security hardening checks, observability checks, and queue resilience diagnostics
- Backup/restore, migration, and maintenance scripts
- Docker Compose stack for local/production-like runs

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router, Framer Motion |
| Backend | Python 3.12, Flask 3.1, Flask-JWT-Extended, Flask-Limiter |
| Data | MongoDB 7 (multi-database split: auth, academic, attendance, audit) |
| Queue | Redis 7 + worker process (`backend/worker.py`) |
| Face | MediaPipe, TensorFlow, Keras, keras-facenet |
| Export/Utility | openpyxl, Pillow |
| Observability | Prometheus client, Sentry SDK, structured logging |

## Key Features

### Admin

- Manage courses, papers, lecturers, students, and mappings
- Bulk import students and lecturers from Excel files with per-row result reporting
- Enrollment workflows and semester progression utilities
- Automated welcome and password-reset credential emails (Yagmail-backed, optional)
- Automated attendance shortage warnings (email alerts for students below threshold)
- Medical leave management (approve/reject student appeals)
- Multi-tenant architecture with robust Role-Based Access Control (RBAC) enabling isolated "Department Admin" views and global "Super Admin" controls.
- Attendance matrix and exports (Excel/PDF)
- Comprehensive Audit Trail logging system with filterable global/departmental interfaces, Excel report exporting, and action rollback support.
### Lecturer

- Attendance session lifecycle: start, pause, resume, stop
- Live recognition-assisted attendance
- Biometric session commit (authenticated session closing via face recognition)
- PIN-protected sensitive actions and correction windows

### Student

- Attendance summary by assigned papers (leave-adjusted)
- Eligibility and projection views (accounting for approved medical leave)
- Medical leave appeals (submission of medical certificates)
- Course and paper visibility

## Repository Layout

```text
.
├── backend/
│   ├── app/
│   │   ├── models/
│   │   ├── observability/
│   │   ├── routes/
│   │   ├── security/
│   │   ├── services/
│   │   └── utils/
│   ├── migrations/
│   ├── scripts/
│   ├── tests/
│   ├── run.py
│   ├── worker.py
│   ├── migrate.py
│   ├── backup.py
│   ├── restore.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── tests/
│   ├── package.json
│   └── vite.config.js
├── docs/
├── docker-compose.yml
├── verify_security.py
└── README.md
```

## Documentation

- Documentation hub: `docs/README.md`
- API contracts: `docs/openapi.yaml`, `docs/openapi.full.yaml`
- Operations runbooks: `docs/operations/`
- Security documents: `docs/security/` and `docs/governance/`

## Prerequisites

- Python 3.12 recommended
- Node.js 20 recommended
- MongoDB running (local mode) or Docker Compose
- Redis (only required when queue mode is enabled)

## Local Development Setup

### 1) Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Update `backend/.env` for your environment.

Optional email delivery configuration (for welcome/reset emails):

```dotenv
YAGMAIL_USER=
YAGMAIL_PASSWORD=
YAGMAIL_SMTP_HOST=smtp.gmail.com
YAGMAIL_SMTP_PORT=587
YAGMAIL_SMTP_SSL=0
YAGMAIL_SMTP_STARTTLS=1
APP_LOGIN_URL=http://localhost:5173/login
TEMP_PASS_DISPLAY_ENABLED=0
ATTENDANCE_THRESHOLD=75.0
LECTURER_AUTH_MODE=pin
```

Start the API:

```powershell
cd backend
python run.py
```

Backend base URL: `http://localhost:5000`

### 2) Frontend

```powershell
cd frontend
npm ci
npm run dev
```

Frontend URL: `http://localhost:5173`

The Vite dev server proxies `/api/*` to backend (default `http://localhost:5000`).

### 3) Seed First Admin (Interactive)

```powershell
cd backend
python seedAdmin.py
```

Notes:

- Seeding is interactive and cancels if an admin already exists.
- Auto-seeding can also be controlled via env (`ENABLE_DEFAULT_ADMIN_SEED`).

## Queue/Worker Mode (Optional but Recommended)

Enable queue mode in `backend/.env`:

```dotenv
TASK_QUEUE_ENABLED=1
TASK_QUEUE_REDIS_URL=redis://localhost:6379/0
TASK_QUEUE_NAME=biometric:jobs
```

Run worker in a second terminal:

```powershell
cd backend
python worker.py
```

If queue mode is disabled (`TASK_QUEUE_ENABLED=0`), the app can run without worker/Redis queue processing.

## Docker Compose

The stack in `docker-compose.yml` runs:

- `mongo`
- `redis`
- `backend`
- `worker`
- `frontend`

Commands:

```powershell
docker-compose build
docker-compose up -d
docker-compose logs -f backend
docker-compose down
```

Default published ports:

- Frontend: `8080`
- Backend (inside stack): `5000`
- MongoDB: `27017`
- Redis: `6379`

## Migrations

```powershell
cd backend
python migrate.py status
python migrate.py up
python migrate.py up --target m20260413_001_normalize_attendance_sessions
```

## Operations Utilities

### Backup

```powershell
cd backend
python backup.py --output-dir backups
python backup.py --dry-run
```

### Restore

```powershell
cd backend
python restore.py --input-dir backups\backup-YYYYMMDD-HHMMSS --dry-run
python restore.py --input-dir backups\backup-YYYYMMDD-HHMMSS --drop-existing --yes
```

### Full Reset (Destructive)

```powershell
cd backend
python delete.py --dry-run
python delete.py --yes
python delete.py --yes --mongo-only
```

### Diagnostics

```powershell
cd backend
python db_diagnostics.py
python verify_observability.py
python verify_queue_resilience.py
cd ..
python verify_security.py
```

## Security and Auth Model

- JWT stored in cookies (`HttpOnly`; `Secure` based on environment)
- CSRF cookie protection enabled by default
- Configurable rate limiting and brute-force protection
- Password policy controls in `backend/.env`
- Transactional email delivery for account onboarding/password resets and Excel-import credentials (`YAGMAIL_USER`, `YAGMAIL_PASSWORD`)
- Strong JWT secret required for production/staging (`STRICT_JWT_SECRET`)

## Testing and Quality

### Backend

```powershell
python -m compileall backend
python -m unittest discover -s backend/tests -p "test_*.py"
```

### Frontend

```powershell
cd frontend
npm run lint
npm run build
npm run test:e2e
```

### CI Workflow

GitHub Actions workflow in `.github/workflows/quality.yml` runs on pushes/PRs to:

- `main`
- `develop`
- `ProductionReady`
- `testing`

Pipeline includes:

- Frontend lint/build
- Frontend E2E tests
- Backend compile and API tests
- Dependency vulnerability scan
- Secrets scan
- SBOM/provenance attestations
- Container artifact build/provenance

## Production Notes

- Use `backend/.env.production.example` as baseline for hardened production config.
- Set a strong `JWT_SECRET_KEY` and restrict `CORS_ORIGINS`.
- Set `FACE_EMBEDDING_ENCRYPTION_KEY` before handling biometric data at scale.
- Configure `YAGMAIL_USER` and `YAGMAIL_PASSWORD` for onboarding and password-reset delivery. Excel imports will still run without mail credentials; they just skip sending credentials by email.
- Keep `TEMP_PASS_DISPLAY_ENABLED=0` in production unless temporary password display in API/UI is explicitly required.
- Keep `backend/.env` out of source control.

## License

Academic project. See `LICENSE`.