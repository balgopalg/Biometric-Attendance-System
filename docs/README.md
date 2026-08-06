# Documentation Hub

Welcome to the Biometric Attendance System documentation. This directory contains the living documentation covering architecture, operations, security, testing, and governance.

**Last updated**: May 8, 2026

---

## Quick Navigation

| Need to... | Go to |
|---|---|
| **Set up the project** | [Project README](../README.md) |
| **Deploy to production** | [Production Deployment Guide](operations/DEPLOYMENT_PRODUCTION.md) |
| **Run tests** | [Testing Overview](testing/TESTING.md) |
| **Understand security** | [Security Hardening Guide](security/SECURITY_HARDENING.md) |
| **Export attendance data** | [Excel Export Guide](EXCEL_EXPORT_GUIDE.md) |
| **Set up monitoring** | [Observability Quickstart](observability/OBSERVABILITY_QUICKSTART.md) |
| **Understand the API** | [OpenAPI Spec](openapi.yaml) · [Full Spec](openapi.full.yaml) |

---

## Sections

### 📦 API Contracts
- [openapi.yaml](openapi.yaml) — Primary API contract (core workflows)
- [openapi.full.yaml](openapi.full.yaml) — Extended API contract (full endpoint surface)

### 🗄️ Backend
- [Data Lifecycle & Retention](backend/DATA_LIFECYCLE.md) — Upload, dataset, and trainer retention policies
- [Database Migrations](backend/MIGRATIONS.md) — Schema evolution and migration scripts

### 🖥️ Frontend
- [Frontend Setup & Architecture](frontend/FRONTEND_README.md) — React app structure, components, and local setup

### ⚖️ Governance & Compliance
- [API Workflow Guide](governance/API_WORKFLOW_GUIDE.md) — Request/response flow standards with Mermaid diagrams
- [Biometric Privacy & Compliance](governance/BIOMETRIC_PRIVACY_AND_COMPLIANCE.md) — GDPR/privacy considerations

### 🔍 Observability & Monitoring
- [Observability Overview](observability/OBSERVABILITY.md) — Logging, metrics, and health checks
- [Observability Quickstart](observability/OBSERVABILITY_QUICKSTART.md) — Fast setup for Prometheus + Grafana

### ⚙️ Operations & Deployment
- [System Operations Manual](operations/SYSTEM_OPERATIONS_MANUAL.md) — Day-to-day operational procedures
- [Production Deployment Guide](operations/DEPLOYMENT_PRODUCTION.md) — Docker Compose production baseline
- [Docker Run Step-by-Step](operations/DOCKER_RUN_STEP_BY_STEP.md) — Container startup walkthrough
- [CLI Command Runbook](operations/CLI_COMMAND_RUNBOOK.md) — Backup, restore, and maintenance commands
- [Incident Response & Recovery](operations/INCIDENT_RESPONSE_AND_RECOVERY.md) — Outage handling playbook

### 🛡️ Security
- [Security Hardening Guide](security/SECURITY_HARDENING.md) — Implemented controls and configuration
- [Security Quick Reference](security/SECURITY_QUICK_REFERENCE.md) — Cheat sheet for security settings

### 🧪 Testing
- [Testing Overview](testing/TESTING.md) — Test architecture, fixtures, CI/CD integration, and extending tests

### 📊 Guides
- [Excel Export Guide](EXCEL_EXPORT_GUIDE.md) — Admin workflow for attendance matrix exports

---

## Documentation Rules

1. Keep source-of-truth documentation here under `docs/`.
2. Prefer code-derived descriptions over release summaries or review reports.
3. Update test counts and version references when the codebase changes.
4. Remove outdated project-review artifacts once their content is captured in the living guides.
