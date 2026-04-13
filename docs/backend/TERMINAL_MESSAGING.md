# Backend Terminal Messaging Design

This project now includes a reusable terminal messaging pattern for backend scripts and operational diagnostics.

## Design Goals

- Keep operational output readable during local runs and CI logs.
- Standardize message levels and formatting across scripts.
- Make pass/fail state obvious at a glance.
- Preserve plain-text readability when colors are unavailable.

## Implementation

Primary utility:
- `backend/app/utils/terminal_messaging.py`

Exported via:
- `backend/app/utils/__init__.py`

## Message Types

- `[INFO]` General progress updates.
- `[ OK ]` Successful checks or operations.
- `[WARN]` Non-blocking issues or skipped checks.
- `[FAIL]` Blocking errors or failed checks.

## Layout Pattern

1. Banner: script title and optional subtitle.
2. Sections: grouped validation areas.
3. Checks: one line per validation with details on failure.
4. Summary: totals for passed, failed, warnings.
5. Final status: explicit final pass/fail line.

## Example Usage

```python
from app.utils import TerminalMessenger

msg = TerminalMessenger()

msg.banner("Queue Resilience Diagnostics")
msg.section("Validation")

msg.check("Redis connection", passed=True)
msg.check("Stale job recovery", passed=False, details="recovered=0 status=running")

msg.summary("Queue resilience diagnostics", passed=1, failed=1, warnings=0)
msg.final_status(
    ok=False,
    success_message="Diagnostics passed.",
    failure_message="Diagnostics failed.",
)
```

## Adoption Guidance

For existing scripts using `print`, replace output progressively:

- Header blocks -> `banner(...)`
- Group labels -> `section(...)`
- Boolean checks -> `check(...)`
- End result -> `summary(...)` and `final_status(...)`

This keeps the migration low-risk while delivering immediately improved operator experience.
