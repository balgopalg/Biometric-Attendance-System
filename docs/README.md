# Documentation Hub

This directory contains the living documentation for the Biometric Attendance System.

## Sections

- `governance/` - API lifecycle, workflow standards, release policy, privacy and compliance.
- `security/` - Security hardening and implementation guidance.
- `testing/` - Backend and frontend test strategy, quick starts, and execution notes.
- `observability/` - Logging, metrics, and health check documentation.
- `backend/` - Backend lifecycle, data retention, terminal messaging, and migration notes.
- `frontend/` - Frontend architecture and setup notes.
- `operations/` - Deployment and operator runbooks.

## Recommended Entry Points

- [../README.md](../README.md) - Project overview and setup.
- [frontend/FRONTEND_README.md](frontend/FRONTEND_README.md) - Frontend architecture and local setup.
- [security/SECURITY_HARDENING.md](security/SECURITY_HARDENING.md) - Implemented security controls.
- [observability/OBSERVABILITY.md](observability/OBSERVABILITY.md) - Logging, metrics, and health checks.
- [testing/TESTING.md](testing/TESTING.md) - Test architecture and commands.
- [backend/MIGRATIONS.md](backend/MIGRATIONS.md) - Migration and schema evolution notes.
- [backend/DATA_LIFECYCLE.md](backend/DATA_LIFECYCLE.md) - Upload, dataset, and trainer retention.
- [EXCEL_EXPORT_GUIDE.md](EXCEL_EXPORT_GUIDE.md) - Admin export workflow.

## API Contracts

- [../docs/openapi.yaml](openapi.yaml) - Primary API contract.
- [../docs/openapi.full.yaml](openapi.full.yaml) - Extended API contract with the full endpoint surface.

## Documentation Rules

- Keep source-of-truth documentation here under `docs/`.
- Prefer code-derived descriptions over release summaries or review reports.
- Remove outdated project-review artifacts once their content is captured in the living guides.
