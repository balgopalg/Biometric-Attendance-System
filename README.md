# Biometric Attendance System 📸🏫

A secure, highly-concurrent, and modern web application for automating student and staff attendance through Facial Recognition. Built with a React frontend and Python (Flask) backend, the system is designed for speed, accuracy, and easy administration.

## 🌟 Features

- **Real-Time Facial Recognition**: Fast and accurate attendance marking using state-of-the-art face biometrics.
- **Role-Based Access Control (RBAC)**: Secure access for Super Admins, Department Admins, Staff, and Students.
- **Admin Dashboard**: Comprehensive management of departments, users, leaves, holidays, and attendance records.
- **Mobile Responsive**: Fully optimized, touch-friendly UI for mobile attendance tracking.
- **Reporting & Export**: Built-in support for detailed Excel exports for administrative review.
- **Security First**: Protection against NoSQL injections, brute force attacks, with secure password handling and session management.
- **Dockerized Environment**: Container-ready application ensuring seamless deployment from development to production.

## 🏗️ Architecture

- **Frontend**: React.js with Vite, styled for modern responsiveness and mobile-first experience.
- **Backend**: Python (Flask) with Gunicorn for handling highly concurrent REST API requests.
- **Database**: MongoDB (Secure, authenticated).
- **Background Jobs**: Asynchronous processing via background workers for heavy tasks like bulk imports and dataset processing.

## 📚 Comprehensive Documentation Directory

The project includes extensive documentation covering all aspects of the architecture, operations, and governance.

### General & API Guides
- 📖 [Documentation Hub (Start Here)](docs/README.md)
- 📊 [Excel Export Guide](docs/EXCEL_EXPORT_GUIDE.md)
- 🔌 [OpenAPI Specification](docs/openapi.yaml) | [Full OpenAPI Spec](docs/openapi.full.yaml)

### Backend & Data Lifecycle
- 🗄️ [Data Lifecycle & Retention](docs/backend/DATA_LIFECYCLE.md)
- 🔄 [Database Migrations](docs/backend/MIGRATIONS.md)
- 💻 [Terminal Messaging](docs/backend/TERMINAL_MESSAGING.md)

### Frontend Architecture
- 🖥️ [Frontend Setup & Architecture](docs/frontend/FRONTEND_README.md)

### Governance & Compliance
- ⚖️ [Biometric Privacy & Compliance](docs/governance/BIOMETRIC_PRIVACY_AND_COMPLIANCE.md)
- 🚀 [API Lifecycle Policy](docs/governance/API_LIFECYCLE_POLICY.md)
- 🔄 [API Workflow Guide](docs/governance/API_WORKFLOW_GUIDE.md)
- 📦 [Release Management Policy](docs/governance/RELEASE_MANAGEMENT_POLICY.md)

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
- 🏃 [Testing Quickstart](docs/testing/TESTING_QUICKSTART.md)
- 🔙 [Backend Tests Documentation](docs/testing/BACKEND_TESTS_README.md)
- 🎨 [Frontend Tests Documentation](docs/testing/FRONTEND_TESTS_README.md)

## 🚀 Quick Start (Local Development)

### Prerequisites

Ensure you have the following installed:
- [Docker](https://www.docker.com/products/docker-desktop) and Docker Compose
- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) (for local frontend development)
- [Python 3.10+](https://www.python.org/) (for local backend development)

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
*(Update `backend/.env` with your secure credentials, including database URIs and JWT secrets if necessary. Defaults will work for local dev.)*

**Frontend:**
```bash
cp frontend/.env.example frontend/.env
```

### Step 3: Run with Docker Compose

Start the application stack using Docker Compose:

```bash
docker-compose up --build -d
```

This will spin up:
- The MongoDB database.
- The Python Flask Backend API (port `5000`).
- The Backend Worker for async tasks.
- The Vite React Frontend (port `3000`).

### Step 4: Access the Application

- **Frontend Application**: [http://localhost:3000](http://localhost:3000)
- **Backend API Base**: [http://localhost:5000/api/v1](http://localhost:5000/api/v1)

### Default Credentials
Upon initial seed, default admin credentials might be available if `TEMP_PASS_DISPLAY_ENABLED=1` is configured in your `.env` for local testing.

## 🤝 Contributing

We welcome contributions! Please follow the standard workflow:
1. Review our [Code of Conduct](CODE_OF_CONDUCT.md).
2. Read our [Contributing Guidelines](CONTRIBUTING.md) to understand branch naming, PR processes, and codebase standards.
3. Check the [Codebase Issues Log](CODEBASE_ISSUES.md) for context on recently resolved technical debt.

## 📜 License

This project is distributed under the terms of the [MIT License](LICENSE) (or see `LICENSE` file for details).
