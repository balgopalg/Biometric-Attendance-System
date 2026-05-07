# Contributing

Thank you for your interest in contributing to the Biometric Attendance System! Please review the following guidelines before submitting changes.

## Getting Started

1. Fork the repository and clone it locally.
2. Set up your development environment following the [Quick Start](README.md#-quick-start-local-development) guide.
3. Create a feature branch from `develop`.

## Development Workflow

1. **Branch**: Create a feature branch from `develop` (e.g., `feat/add-drowsiness-detection`).
2. **Develop**: Keep changes focused and atomic. One PR per feature or fix.
3. **Test**: Add or update tests for behavior changes.
4. **Validate**: Run all checks locally before opening a PR:
   ```bash
   # Backend
   cd backend
   .venv/Scripts/pytest -q

   # Frontend
   cd frontend
   npm run lint
   npm run build
   npm run test:e2e
   ```
5. **Submit**: Open a Pull Request against `develop`.

## Commit Guidelines

Use clear, scoped commit messages with conventional prefixes:

| Prefix | Usage |
|---|---|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code restructuring without behavior change |
| `test:` | Adding or updating tests |
| `chore:` | Build, config, or tooling changes |
| `perf:` | Performance improvement |
| `security:` | Security fix or hardening |

Example: `feat: add drowsiness detection to attendance session`

## Pull Requests

- Describe the problem and solution clearly.
- Link related issues (e.g., `Closes #42`).
- Include test evidence (command output or screenshots when relevant).
- Request review from code owners listed in `CODEOWNERS`.

## Code Quality

- Preserve existing project style and conventions.
- Add docstrings to all new endpoint functions and public methods.
- Avoid unrelated formatting-only changes in feature PRs.
- Do not commit secrets, runtime data, `.env` files, or generated artifacts.
- Ensure all new dependencies are added to `backend/requirements.txt` with purpose comments.

## Architecture Notes

- Backend routes are organized by domain in `backend/app/routes/`.
- Models are thin wrappers around MongoDB in `backend/app/models/`.
- Services contain business logic in `backend/app/services/`.
- Frontend uses React 19 with role-based dashboards under `frontend/src/`.
- See [docs/README.md](docs/README.md) for the full documentation index.
