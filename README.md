# Biometric Attendance System 📸🏫

A secure, highly-concurrent, and modern web application for automating student and staff attendance through **Facial Recognition**. Built with a React frontend and Python (Flask) backend, the system is designed for speed, accuracy, and easy administration.

---

## 🌟 Features

- **Real-Time Facial Recognition**: Fast and accurate attendance marking using FaceNet-512D embeddings with MediaPipe face detection.
- **Batch Inference Pipeline**: Vectorized TensorFlow inference and NumPy similarity matching for high-throughput classroom processing.
- **Role-Based Access Control (RBAC)**: Secure access for Super Admins, Department Admins, Lecturers, and Students.
- **Admin Dashboard**: Comprehensive management of departments, courses, papers, users, leaves, holidays, timetables, and attendance records.
- **Academic Calendar & Timetable**: OCR-based calendar extraction, Excel holiday import, and conflict-aware automated timetable generation.
- **Attendance Analytics**: Per-paper breakdowns, exam eligibility predictions, safe-bunk calculations, and exportable attendance matrices.
- **Mobile Responsive**: Fully optimized, touch-friendly UI for mobile attendance tracking.
- **Reporting & Export**: Built-in Excel (XLSX) and CSV exports, plus PDF report generation for administrative review.
- **Security First**: HttpOnly JWT cookies, CSRF protection, bcrypt password hashing, brute-force lockout, rate limiting, encrypted face embeddings, and NoSQL injection prevention.
- **Observability**: Structured JSON logging, Prometheus metrics, Sentry error tracking, and audit trail with rollback support.
- **Dockerized Environment**: Container-ready with Docker Compose for seamless deployment from development to production.

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Frontend (React + Vite)             │
│  React 19 · React Router · Axios · Framer Motion         │
│  Served by Nginx in production (port 8080/3000)          │
└─────────────────────────┬────────────────────────────────┘
                          │ REST API (JSON + multipart)
┌─────────────────────────▼────────────────────────────────┐
│                Backend (Flask + Gunicorn)                 │
│  JWT Auth · RBAC · Rate Limiting · CSRF                  │
│  Face Detection (MediaPipe) · Recognition (FaceNet)      │
│  Background Workers · Email Service                      │
│  Port 5000                                               │
└───────┬───────────────────────────┬──────────────────────┘
        │                           │
┌───────▼──────────┐      ┌────────▼─────────┐
│  MongoDB          │      │  Redis            │
│  Auth + Academic  │      │  Queue + Cache    │
│  + Attendance DBs │      │  + Rate Limiting  │
└──────────────────┘      └──────────────────┘
```

### Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 19, Vite 8, React Router | SPA with role-based dashboards |
| Backend | Python 3.12, Flask 3.1, Gunicorn | REST API, business logic |
| Face Detection | MediaPipe + Haar Cascade fallback | Real-time face localization |
| Face Recognition | keras-facenet (InceptionResNetV1) | 512D embedding generation |
| Database | MongoDB (PyMongo) | Auth, academic, attendance data |
| Cache/Queue | Redis | Background jobs, rate-limit backing |
| Auth | Flask-JWT-Extended | HttpOnly cookie-based JWT sessions |
| Observability | Sentry, Prometheus, structured logs | Error tracking, metrics, audit trail |

## 📚 Documentation Directory

The project includes extensive documentation covering all aspects of the architecture, operations, and governance.

### General & API Guides
- 📖 [Documentation Hub (Start Here)](docs/README.md)
- 📊 [Excel Export Guide](docs/EXCEL_EXPORT_GUIDE.md)
- 🔌 [OpenAPI Specification](docs/openapi.yaml) | [Full OpenAPI Spec](docs/openapi.full.yaml)

### Backend & Data Lifecycle
- 🗄️ [Data Lifecycle & Retention](docs/backend/DATA_LIFECYCLE.md)
- 🔄 [Database Migrations](docs/backend/MIGRATIONS.md)

### Frontend Architecture
- 🖥️ [Frontend Setup & Architecture](docs/frontend/FRONTEND_README.md)

### Governance & Compliance
- ⚖️ [Biometric Privacy & Compliance](docs/governance/BIOMETRIC_PRIVACY_AND_COMPLIANCE.md)
- 🔄 [API Workflow Guide](docs/governance/API_WORKFLOW_GUIDE.md)

### Observability & Monitoring
- 🔍 [Observability Overview](docs/observability/OBSERVABILITY.md)
- ⚡ [Observability Quickstart](docs/observability/OBSERVABILITY_QUICKSTART.md)

### Operations & Deployment
- ⚙️ [System Operations Manual](docs/operations/SYSTEM_OPERATIONS_MANUAL.md)
- 🚀 [Production Deployment Guide](docs/operations/DEPLOYMENT_PRODUCTION.md)
- 🐳 [Docker Run Step-by-Step](docs/operations/DOCKER_RUN_STEP_BY_STEP.md)
- ⌨️ [CLI Command Runbook](docs/operations/CLI_COMMAND_RUNBOOK.md)
- 🚨 [Incident Response & Recovery](docs/operations/INCIDENT_RESPONSE_AND_RECOVERY.md)

### Security Guidelines
- 🛡️ [Security Hardening Guide](docs/security/SECURITY_HARDENING.md)
- 🔐 [Security Quick Reference](docs/security/SECURITY_QUICK_REFERENCE.md)
- 📜 [Security Policy](SECURITY.md)

### Testing Strategy
- 🧪 [Testing Overview](docs/testing/TESTING.md)

## 🚀 Quick Start (Local Development)

### Prerequisites

Ensure you have the following installed:
- [Docker](https://www.docker.com/products/docker-desktop) and Docker Compose
- [Git](https://git-scm.com/)
- [Node.js 20+](https://nodejs.org/) (for local frontend development)
- [Python 3.12+](https://www.python.org/) (for local backend development)
- [MongoDB 7+](https://www.mongodb.com/) (local or Docker)

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd Biometric-Attendance-System
```

### Step 2: Environment Configuration

Copy the example environment files for both the frontend and backend:

**Backend:**
```bash
cp backend/.env.example backend/.env
```
> Update `backend/.env` with your secure credentials, including database URIs and JWT secrets. Defaults will work for local dev. See [Production Deployment Guide](docs/operations/DEPLOYMENT_PRODUCTION.md) for production-specific settings.

**Frontend:**
```bash
cp frontend/.env.example frontend/.env
```

### Step 3: Run with Docker Compose

Start the application stack:

```bash
docker-compose up --build -d
```

This will spin up:
- **MongoDB** — persistent database for auth, academic, and attendance data
- **Redis** — queue and rate-limit backing store
- **Backend** — Flask API served via Gunicorn (port `5000`)
- **Worker** — background job processor for async tasks
- **Frontend** — Vite React app served by Nginx (port `3000` dev / `8080` prod)

### Step 4: Seed Initial Admin

```bash
cd backend
python seedAdmin.py
```

### Step 5: Access the Application

- **Frontend Application**: [http://localhost:3000](http://localhost:3000)
- **Backend API Health**: [http://localhost:5000/api/auth/health](http://localhost:5000/api/auth/health)

### Step 6: Verify the System

```bash
# Backend tests (40 tests)
cd backend
.venv/Scripts/pytest -q

# Frontend lint + build + E2E (13 tests)
cd frontend
npm run lint
npm run build
npm run test:e2e
```

## 🧪 Test Suite Summary

| Suite | Framework | Tests | Status |
|---|---|---|---|
| Backend API + RBAC | pytest | 40 | ✅ All passing |
| Frontend Lint | ESLint | — | ✅ Zero warnings |
| Frontend Build | Vite 8 | — | ✅ Builds clean |
| Frontend E2E | Playwright | 13 | ✅ All passing |

## 🤝 Contributing

We welcome contributions! Please follow the standard workflow:
1. Review our [Code of Conduct](CODE_OF_CONDUCT.md).
2. Read our [Contributing Guidelines](CONTRIBUTING.md) to understand branch naming, PR processes, and codebase standards.

## 📜 License

This project is distributed under the terms of the [MIT License](LICENSE).
