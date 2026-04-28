# Documentation Hub

This folder is the single source of truth for project documentation.

## Structure

| Directory | Contents |
|---|---|
| `governance/` | API lifecycle, workflow standards, release policy, compliance baseline |
| `operations/` | Deployment guide, Docker runbook, CLI reference, incident response |
| `security/` | Security hardening guide, implementation summary, quick reference |
| `testing/` | E2E testing strategy, backend/frontend test guides |
| `observability/` | Observability architecture, metrics, structured logging |
| `backend/` | Backend lifecycle and migration documents |
| `frontend/` | Frontend setup and operational notes |
| `reports/` | Delivery summaries, readiness checklist, project reviews |

## Key Documents

| Audience | Document |
|---|---|
| System operators | `operations/SYSTEM_OPERATIONS_MANUAL.md` |
| API integrators | `governance/API_WORKFLOW_GUIDE.md` |
| Deployment owners | `operations/DEPLOYMENT_PRODUCTION.md` |
| Security reviewers | `security/SECURITY_HARDENING.md` |
| QA engineers | `testing/TESTING_QUICKSTART.md` |
| Frontend implementers | `frontend/FRONTEND_README.md` |
| Export workflows | `EXCEL_EXPORT_GUIDE.md` |

## API Specifications

- `openapi.yaml` — Core API contract (routes, schemas)
- `openapi.full.yaml` — Extended API contract with all endpoints

## Recent Updates (April 2026)

- All 21 code review issues resolved (security, performance, technical debt)
- MongoDB authentication enabled in Docker Compose
- Email templates hardened against XSS via `html.escape()`
- N+1 query patterns eliminated in session review endpoints
- LRU-bounded caching for profile and query caches
- Leave management routes added for students and admins
- 4-tier RBAC documentation updated (`student → lecturer → department_admin → super_admin`)

## Documentation Standards

- Keep all Markdown documentation under `/docs`
- Use absolute repo-root links like `/docs/<section>/<file>.md`
- Keep implementation scripts and runtime assets outside `/docs`
- Keep operational commands synchronized with `operations/CLI_COMMAND_RUNBOOK.md`
