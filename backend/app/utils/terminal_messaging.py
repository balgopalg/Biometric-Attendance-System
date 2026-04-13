"""Professional terminal messaging primitives for backend scripts.

Provides consistent, readable terminal output with optional ANSI colors,
structured sections, and summary blocks for operational diagnostics.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime


class _Ansi:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"

    FG_GREEN = "\033[32m"
    FG_YELLOW = "\033[33m"
    FG_RED = "\033[31m"
    FG_CYAN = "\033[36m"
    FG_BLUE = "\033[34m"


class TerminalMessenger:
    """Prints consistent, professional terminal messages for backend tasks."""

    def __init__(self, use_color: bool | None = None, stream=None):
        self.stream = stream or sys.stdout
        self.use_color = self._should_use_color() if use_color is None else bool(use_color)

    def banner(self, title: str, subtitle: str | None = None) -> None:
        width = 72
        self._write("=" * width)
        self._write(self._style(title.upper(), _Ansi.BOLD + _Ansi.FG_BLUE))
        if subtitle:
            self._write(subtitle)
        self._write("=" * width)

    def section(self, title: str) -> None:
        self._write("")
        self._write(self._style(f"[{title}]", _Ansi.BOLD + _Ansi.FG_CYAN))

    def info(self, message: str) -> None:
        self._write(f"[INFO] {message}")

    def success(self, message: str) -> None:
        self._write(self._style(f"[ OK ] {message}", _Ansi.FG_GREEN))

    def warning(self, message: str) -> None:
        self._write(self._style(f"[WARN] {message}", _Ansi.FG_YELLOW))

    def error(self, message: str) -> None:
        self._write(self._style(f"[FAIL] {message}", _Ansi.FG_RED))

    def check(self, name: str, passed: bool, details: str | None = None) -> None:
        if passed:
            self.success(name)
            return

        if details:
            self.error(f"{name} | {details}")
        else:
            self.error(name)

    def summary(self, title: str, passed: int, failed: int, warnings: int = 0) -> None:
        total = passed + failed
        self._write("")
        self._write("-" * 72)
        self._write(self._style(title.upper(), _Ansi.BOLD))
        self._write(f"Timestamp : {datetime.utcnow().isoformat()}Z")
        self._write(f"Passed    : {passed}")
        self._write(f"Failed    : {failed}")
        self._write(f"Warnings  : {warnings}")
        self._write(f"Total     : {total}")
        self._write("-" * 72)

    def final_status(self, ok: bool, success_message: str, failure_message: str) -> None:
        self._write("")
        if ok:
            self.success(success_message)
        else:
            self.error(failure_message)

    def _write(self, text: str) -> None:
        self.stream.write(f"{text}\n")

    def _style(self, text: str, style_code: str) -> str:
        if not self.use_color:
            return text
        return f"{style_code}{text}{_Ansi.RESET}"

    def _should_use_color(self) -> bool:
        if os.environ.get("NO_COLOR") is not None:
            return False

        is_tty = hasattr(self.stream, "isatty") and self.stream.isatty()
        if not is_tty:
            return False

        # Most modern Windows terminals support ANSI, and this keeps output
        # readable even when color is disabled.
        return True
