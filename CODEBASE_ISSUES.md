# Codebase Issue Report (2026-04-28)

## Checks Run

- Backend tests: pytest -q (40 passed, 2 warnings)
- Frontend lint: npm run lint (3 errors)
- Docs link scan: no missing link targets (excluding .venv/node_modules/dist)

## Issues (Ordered by Priority)

1) Critical - Real credentials present in backend/.env
- Location: [backend/.env](backend/.env#L115-L116)
- Why it matters: The email and app password are live secrets. If this file is ever committed or shared, it is a credential leak.
- Fix: Remove secrets from backend/.env, rotate the credentials immediately, and keep only placeholder values in env examples.

2) High - Docker Compose will fail on fresh machines due to pull_policy: never
- Location: [docker-compose.yml](docker-compose.yml#L4), [docker-compose.yml](docker-compose.yml#L18)
- Why it matters: mongo/redis have no build context; with pull_policy set to never, a new environment cannot pull the images and compose fails.
- Fix: Remove pull_policy for these services or set it to if_not_present (or always) so missing images are pulled.

3) Medium - Docker Compose loads backend/.env with dev-only values
- Location: [docker-compose.yml](docker-compose.yml#L35-L36), [backend/.env](backend/.env#L8-L21)
- Why it matters: Docker Compose uses backend/.env by default, which includes development flags and a weak JWT secret. This is an easy footgun for staging/prod.
- Fix: Use a dedicated compose env file (for example backend/.env.production) and document the required secrets. Consider env-specific compose overrides.

4) Medium - Temp password display enabled in backend/.env
- Location: [backend/.env](backend/.env#L21)
- Why it matters: TEMP_PASS_DISPLAY_ENABLED=1 can expose temporary passwords in API responses or UI. This should be off outside of local-only debug.
- Fix: Set TEMP_PASS_DISPLAY_ENABLED=0 for any shared environment; keep it on only for isolated local debugging.

5) Low - Frontend lint failures from unused variables
- Location: [frontend/src/components/calendar/AcademicCalendarPanel.jsx](frontend/src/components/calendar/AcademicCalendarPanel.jsx#L99), [frontend/src/components/calendar/AcademicCalendarPanel.jsx](frontend/src/components/calendar/AcademicCalendarPanel.jsx#L227), [frontend/src/components/calendar/AcademicCalendarPanel.jsx](frontend/src/components/calendar/AcademicCalendarPanel.jsx#L290)
- Why it matters: Lint errors break CI and hide actual issues. Unused variables often indicate incomplete feature work or stale code.
- Fix: Remove unused declarations or wire them into the UI logic (buildDateCursor, isToday, scopeDepartmentId).

6) Low - Backend dependency warnings during pytest
- Location: Dependency warning emitted during pytest (google protobuf types deprecated in Python 3.14)
- Why it matters: These are not failures today, but may break in future Python versions.
- Fix: Track upstream dependency updates and plan a bump before Python 3.14 migration.
