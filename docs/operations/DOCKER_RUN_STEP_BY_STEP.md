# Docker Run Guide (Step By Step)

This guide explains how to run the full project using Docker Compose.

## 1. Prerequisites

Install the following on your machine:
- Docker Desktop (latest stable)
- Docker Compose (included with Docker Desktop)

Verify installation:

```bash
docker --version
docker compose version
```

## 2. Open Project Root

From terminal, go to project root where `docker-compose.yml` exists:

```bash
cd "C:\Users\guruv\Desktop\smart-attendance-using-face-biometric\Biometric-Attendance-System"
```

## 3. Create Backend Environment File

The compose stack reads settings from `backend/.env`.

### Option A: Production template

PowerShell:

```powershell
Copy-Item backend/.env.production.example backend/.env
```

### Option B: Staging template

PowerShell:

```powershell
Copy-Item backend/.env.staging.example backend/.env
```

Then edit `backend/.env` and set at minimum:
- `JWT_SECRET_KEY` (strong random value, 64+ chars)
- `CORS_ORIGINS` (for local compose keep `http://localhost:8080`)
- `JWT_COOKIE_DOMAIN` (leave blank for local)
- `SENTRY_DSN` (optional, can be blank)
- `RESEND_API_KEY` (optional; enables welcome and password-reset emails)
- `RESEND_FROM_EMAIL` (optional; verified sender recommended)
- `TEMP_PASS_DISPLAY_ENABLED` (`0` recommended; set to `1` to return temp passwords in admin API responses)

Note: Excel student/lecturer imports require email delivery to be configured.

## 4. Build Docker Images

```bash
docker compose build
```

This builds:
- backend image
- frontend image

## 5. Start All Services

```bash
docker compose up -d
```

Services started:
- `mongo`
- `redis`
- `backend`
- `worker`
- `frontend`

## 6. Check Service Status

```bash
docker compose ps
```

Wait until services are healthy/running.

## 7. Check Logs (if needed)

```bash
docker compose logs backend --tail=200
docker compose logs worker --tail=200
docker compose logs frontend --tail=200
```

For live logs:

```bash
docker compose logs -f
```

Stop live log stream with `Ctrl + C`.

## 8. Verify Application

Open browser:
- Frontend: `http://localhost:8080`

Optional API health check:
- `http://localhost:5000/api/auth/health`

## 9. Seed Initial Admin (First Time Only)

Run inside backend container:

```bash
docker compose exec backend python seedAdmin.py
```

Follow prompts to create admin credentials.

## 10. Basic Smoke Validation

After login as admin, validate:
- Dashboard loads
- Course/paper/student pages open
- Job metrics endpoint works from UI

## 11. Stop Services

```bash
docker compose down
```

## 12. Stop And Remove Volumes (Danger: deletes data)

Use only when you want a clean reset:

```bash
docker compose down -v
```

## 13. Restart Quickly

```bash
docker compose up -d
```

## 14. Rebuild After Code Changes

If you changed Docker-relevant files or dependencies:

```bash
docker compose build --no-cache
docker compose up -d
```

## Troubleshooting

### Port already in use
- If `8080`, `5000`, `27017`, or `6379` are busy, stop conflicting process or change port mappings in `docker-compose.yml`.

### Backend fails on startup
- Check `backend/.env` values.
- Ensure `JWT_SECRET_KEY` is set and strong.
- Check logs:

```bash
docker compose logs backend --tail=300
```

### Frontend cannot call API
- Confirm frontend container is running.
- Confirm backend service is healthy.
- Confirm Nginx proxy config in `frontend/nginx.conf`.

### Worker not processing jobs
- Check Redis is healthy.
- Ensure `TASK_QUEUE_ENABLED=1` and `TASK_QUEUE_REDIS_URL=redis://redis:6379/0` in `backend/.env`.
- Check worker logs:

```bash
docker compose logs worker --tail=300
```
