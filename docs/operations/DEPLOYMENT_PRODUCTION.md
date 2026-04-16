# Deployment Guide (Production Baseline)

## What This Deploys
- `mongo` for persistence
- `redis` for queue/rate-limit backing store
- `backend` Flask API served via Gunicorn
- `worker` background job processor
- `frontend` static React build served by Nginx with `/api` proxy to backend

## 1. Prepare Environment
1. Copy env template:
   - Staging: `backend/.env.staging.example` to `backend/.env`
   - Production: `backend/.env.production.example` to `backend/.env`
2. Set strong values:
   - `JWT_SECRET_KEY`
   - `SENTRY_DSN`
   - `CORS_ORIGINS`
   - `JWT_COOKIE_DOMAIN`
   - `YAGMAIL_USER` and `YAGMAIL_PASSWORD` (if onboarding/reset emails are enabled)
   - `YAGMAIL_SMTP_HOST`, `YAGMAIL_SMTP_PORT`, `YAGMAIL_SMTP_SSL`, `YAGMAIL_SMTP_STARTTLS` as needed for your SMTP provider
   - `TEMP_PASS_DISPLAY_ENABLED=0` (recommended for production)
3. Confirm security values:
   - `STRICT_JWT_SECRET=1`
   - `RATELIMIT_ENABLED=1`
   - `BRUTE_FORCE_PROTECTION_ENABLED=1`
   - `TASK_QUEUE_ENABLED=1`

## 2. Build And Start
From repository root:

```bash
docker compose build
docker compose up -d
```

## 3. Verify Health
- Frontend: `http://localhost:8080`
- Backend health: `http://localhost:5000/api/auth/health` (from backend container network or host if mapped)

Check services:

```bash
docker compose ps
docker compose logs backend --tail=200
docker compose logs worker --tail=200
```

## 4. Queue/Worker Verification
- Ensure Redis is healthy
- Verify worker consumes queue jobs
- Check admin metrics endpoint: `GET /api/admin/jobs/metrics`

## 5. Backup/Restore Operations
Use runbook commands in:
- `/docs/operations/CLI_COMMAND_RUNBOOK.md`

## 6. Rollback Strategy
- Deploy by version tags
- If regression occurs:
  1. Roll back to last known good image/tag
  2. Verify health endpoint and core workflows
  3. Run targeted recovery if data migration was involved

## 7. Release Checklist
- CI passed including tests/security scans
- OpenAPI specs updated if contract changed
- Incident/recovery and release policies reviewed
- Post-deploy smoke tests completed

## Notes
- For internet-facing production, terminate TLS at reverse proxy/load balancer and force HTTPS.
- Restrict Mongo/Redis network exposure to private network only.
- If mail credentials are unset, account creation and password reset still succeed, but credential emails are skipped.
- Excel student/lecturer import still works without mail credentials; imported accounts simply skip email delivery.
