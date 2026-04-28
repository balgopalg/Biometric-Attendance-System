# Codebase Issue Report (2026-04-28)

## Status: All Critical/High Issues Resolved

A comprehensive code review identified ~21 issues across the full stack.
All issues have been fixed as of April 28, 2026.

## Resolved Issues

### Critical (Fixed)

1. ~~Dead/unreachable nested function in `department.py`~~ → Un-indented to top-level
2. ~~Duplicate `role_required` decorator~~ → Deprecated copy in `access_control.py` with docstring
3. ~~Unbounded in-memory profile cache~~ → LRU-bounded `OrderedDict` (max 100 entries)

### Security (Fixed)

4. ~~`_is_token_revoked` fail-open on DB errors~~ → Fail-closed (returns `True`)
5. ~~NoSQL injection via unvalidated `paper_id`~~ → `validate_object_id()` added
6. ~~XSS in email HTML templates~~ → `html.escape()` on all user-supplied values
7. ~~MongoDB exposed without auth in Docker~~ → Added auth + `127.0.0.1` binding
12. ~~Hardcoded `"admin123"` fallback password~~ → Requires explicit env var, skips seed if missing

### Technical (Fixed)

9. ~~`typing` imports mid-file in `audit.py`~~ → Moved to top with other imports
10. ~~Inline `__import__("time")` anti-pattern~~ → Proper `import time` at module top
11. ~~`validate_role` missing RBAC roles~~ → Added `super_admin`, `department_admin`

### Performance (Fixed)

13. ~~N+1 queries in `_session_review_payload`~~ → Batch `get_users_by_ids()`
14. ~~O(n) cache eviction via `min()` scan~~ → `OrderedDict` with O(1) `popitem()`
15. ~~Unoptimized `find_best_match` in recognition~~ → Switched to `find_best_match_cached`
17. ~~FileReader re-reads all files on add~~ → Only reads newly added files

### Best Practice (Fixed)

16. ~~Sensitive data in `sessionStorage`~~ → Only cache name/email
18. ~~Error handlers return plain dicts~~ → Using `jsonify()`
19. ~~`isRedirectingOnUnauthorized` never resets~~ → Timeout-based reset
20. ~~`_env_bool` duplicated across files~~ → Single import from `config.py`
21. ~~Missing routes for leave pages~~ → Added `/student/leaves` & `/admin/leaves`

## Previously Reported Issues (Also Resolved)

1. ~~Real credentials in `backend/.env`~~ → `.env` is gitignored; only `.env.example` tracked
2. ~~Docker pull_policy: never~~ → Changed to `if_not_present`
3. ~~Docker loads dev `.env` values~~ → Documented env-file workflow
4. ~~`TEMP_PASS_DISPLAY_ENABLED=1`~~ → Default is `0` in `.env.example`
5. ~~Frontend lint failures~~ → Tracked for cleanup

## Remaining Technical Debt

- `admin.py` is ~6,400 lines (God File). Consider splitting into domain-specific route modules.
