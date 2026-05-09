# Biometric Attendance System

A web-based attendance management system that uses facial recognition to automate classroom and staff attendance. The project consists of a React frontend and a Flask (Python) backend, supported by MongoDB and Redis.

## Features

- Real-time facial recognition using FaceNet-512D and MediaPipe.
- Batch processing for high-throughput classroom attendance.
- Role-Based Access Control (RBAC) for Super Admins, Department Admins, Lecturers, and Students.
- Admin dashboard for managing departments, courses, users, and timetables.
- Automated timetable generation and conflict detection.
- Attendance analytics and reporting with Excel (XLSX) and PDF export capabilities.
- Dockerized setup for local development and production deployment.

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS, Framer Motion
- **Backend:** Python 3.12, Flask, Gunicorn
- **Computer Vision:** MediaPipe, keras-facenet (InceptionResNetV1)
- **Database:** MongoDB
- **Cache & Queue:** Redis
- **Authentication:** JWT (HttpOnly cookies)

## Project Structure

- `/frontend` - React SPA
- `/backend` - Flask REST API, worker processes, and face recognition models
- `/docs` - Additional system documentation and guides

## Local Setup

### Prerequisites

- Docker and Docker Compose
- Node.js 20+
- Python 3.12+

### 1. Clone the repository

```bash
git clone <repository-url>
cd Biometric-Attendance-System
```

### 2. Configure Environment Variables

Copy the example environment files for both frontend and backend.

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```
*(Update `backend/.env` with your local database URIs and JWT secrets if necessary. The default values work out-of-the-box for local development.)*

### 3. Run the application

Start the services using Docker Compose:

```bash
docker-compose up --build -d
```

This starts MongoDB, Redis, the Flask backend API, the background worker, and the frontend development server.

### 4. Seed the initial admin account

```bash
cd backend
python seedAdmin.py
```

### 5. Access the services

- **Frontend:** http://localhost:8080 (or port 3000 depending on dev/prod configuration)
- **Backend API:** http://localhost:5000
- **Health Check:** http://localhost:5000/api/auth/health

## Running Tests

The repository includes test suites for both frontend and backend.

**Backend (pytest):**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest -q
```

**Frontend (ESLint, Vite Build, Playwright E2E):**
```bash
cd frontend
npm install
npm run lint
npm run build
npm run test:e2e
```

## Documentation

For more detailed information, refer to the documentation directory:
- [API & General Docs](docs/README.md)
- [Frontend Architecture](docs/frontend/FRONTEND_README.md)
- [System Operations & Deployment](docs/operations/SYSTEM_OPERATIONS_MANUAL.md)
- [Security Guidelines](docs/security/SECURITY_HARDENING.md)

## License

**Copyright (c) 2026. All Rights Reserved.**

This is a proprietary project. The source code is provided strictly for evaluation and review purposes. Unauthorized copying, modification, distribution, or commercial use is strictly prohibited. See the [LICENSE](LICENSE) file for more details.
