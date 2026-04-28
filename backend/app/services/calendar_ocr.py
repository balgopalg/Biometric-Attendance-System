"""OCR parsing helpers for academic calendar uploads."""

from __future__ import annotations

import io
import re
from calendar import month_name
from datetime import date, datetime
from typing import List, Optional

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

try:  # pragma: no cover - optional runtime dependency
    import pytesseract  # type: ignore
except Exception:  # pragma: no cover - optional runtime dependency
    pytesseract = None


MONTH_LOOKUP = {name.lower(): idx for idx, name in enumerate(month_name) if name}
DATE_RE = re.compile(r"(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{4})\s*(?:[-:–—]|to)\s*(?P<label>.+)", re.IGNORECASE)
OPTIONAL_HEADER_RE = re.compile(r"optional\s+holidays", re.IGNORECASE)
YEAR_RE = re.compile(r"(20\d{2})")


def _sanitize_text(text: str) -> str:
    lines = []
    for raw in (text or "").splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def _preprocess_image(image: Image.Image) -> Image.Image:
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray)
    gray = gray.filter(ImageFilter.SHARPEN)
    gray = ImageEnhance.Contrast(gray).enhance(1.8)
    return gray


def _ocr_text(image: Image.Image) -> str:
    if pytesseract is None:
        raise RuntimeError("pytesseract is not installed. Add pytesseract and Tesseract OCR to enable calendar extraction.")

    config = "--oem 3 --psm 6"
    return _sanitize_text(pytesseract.image_to_string(image, config=config))


def _parse_date_text(value: str) -> Optional[date]:
    for separator in ("/", "-"):
        parts = value.split(separator)
        if len(parts) != 3:
            continue
        try:
            first = int(parts[0])
            second = int(parts[1])
            year = int(parts[2])
            return date(year, second, first) if separator == "/" else date(year, second, first)
        except Exception:
            try:
                return date(int(parts[2]), int(parts[1]), int(parts[0]))
            except Exception:
                continue
    return None


def _extract_year(text: str, fallback: Optional[int] = None) -> int:
    matches = YEAR_RE.findall(text or "")
    if matches:
        for value in matches:
            year = int(value)
            if 1900 <= year <= 2100:
                return year
    if fallback:
        return int(fallback)
    return datetime.utcnow().year


def _month_name_for_date(value: date) -> str:
    return month_name[value.month]


def _extract_holiday_rows(text: str) -> List[dict]:
    items: List[dict] = []
    lines = [line for line in text.splitlines() if line.strip()]
    optional_mode = False
    for line in lines:
        if OPTIONAL_HEADER_RE.search(line):
            optional_mode = True
            continue
        if optional_mode and line.lower().startswith("note"):
            optional_mode = False
            continue

        match = DATE_RE.search(line)
        if not match:
            continue

        date_text = match.group("date")
        label = re.sub(r"\s+", " ", match.group("label") or "").strip(" -:\t")
        parsed_date = _parse_date_text(date_text)
        if not parsed_date:
            continue

        items.append({
            "date": parsed_date.isoformat(),
            "label": label or ("Optional Holiday" if optional_mode else "Holiday"),
            "month": _month_name_for_date(parsed_date),
            "is_optional": optional_mode,
            "source_line": line,
        })

    return items


def _extract_optional_block(text: str) -> List[str]:
    optional_lines: List[str] = []
    lines = [line for line in text.splitlines() if line.strip()]
    capture = False
    for line in lines:
      if OPTIONAL_HEADER_RE.search(line):
            capture = True
            continue
      if capture and line.lower().startswith("note"):
            break
      if capture:
            optional_lines.append(line)
    return optional_lines


def _sundays_for_year(year: int) -> List[str]:
    values: List[str] = []
    current = date(year, 1, 1)
    while current.year == year:
        if current.weekday() == 6:
            values.append(current.isoformat())
        current = current.fromordinal(current.toordinal() + 1)
    return values


def extract_calendar_draft(*, file_bytes: bytes, filename: str = "", year_hint: Optional[int] = None) -> dict:
    image = Image.open(io.BytesIO(file_bytes))
    image = _preprocess_image(image)
    text = _ocr_text(image)

    year = _extract_year(text, fallback=year_hint)
    holidays = _extract_holiday_rows(text)
    optional_lines = _extract_optional_block(text)

    return {
        "year": year,
        "source_filename": filename,
        "raw_text": text,
        "holidays": [item for item in holidays if not item.get("is_optional")],
        "optional_holidays": [item for item in holidays if item.get("is_optional")],
        "optional_holiday_lines": optional_lines,
        "sundays": _sundays_for_year(year),
        "source_dimensions": {"width": image.width, "height": image.height},
    }
