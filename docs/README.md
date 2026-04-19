# Documentation Hub

This folder is the single source of truth for project documentation.

## Latest Updates

- Timetable workflows documented for admin generation/editing, lecturer view, and student view.
- Export documentation now covers both client-side table export and backend attendance matrix export endpoints.
- Testing docs aligned with current execution baseline (backend `pytest`, frontend Playwright over HTTPS with serial-safe config).

## Structure

- governance/
  - API lifecycle, workflow standards, release policy, and compliance baseline.
- operations/
  - Deployment, docker runbook, CLI runbook, operations manual, incident response.
- security/
  - Security hardening guide, implementation summary, and quick reference.
- testing/
  - End-to-end testing strategy, quickstart, backend and frontend test guides.
- observability/
  - Observability architecture, quickstart, and implementation summary.
- backend/
  - Backend-specific lifecycle and migration documents.
- frontend/
  - Frontend-specific setup and operational notes.
- reports/
  - Delivery summaries, readiness checklist, and project review records.
- EXCEL_EXPORT_GUIDE.md
  - Frontend export utility usage and backend matrix export integration.

## Start Here

1. System operators: /docs/operations/SYSTEM_OPERATIONS_MANUAL.md
2. API integrators: /docs/governance/API_WORKFLOW_GUIDE.md
3. Deployment owners: /docs/operations/DEPLOYMENT_PRODUCTION.md
4. Security reviewers: /docs/security/SECURITY_HARDENING.md
5. QA engineers: /docs/testing/TESTING_QUICKSTART.md
6. Frontend implementers: /docs/frontend/FRONTEND_README.md
7. Export workflows: /docs/EXCEL_EXPORT_GUIDE.md

## Documentation Standards

- Keep all Markdown documentation under /docs.
- Prefer absolute repo-root links like /docs/<section>/<file>.md to avoid broken relative links.
- Keep implementation scripts and runtime assets outside /docs.
- Keep operational commands synchronized with /docs/operations/CLI_COMMAND_RUNBOOK.md.
