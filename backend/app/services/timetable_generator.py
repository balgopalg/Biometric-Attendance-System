"""Timetable generation utilities."""

from __future__ import annotations

import random
from typing import Any, Dict, List, Optional, Tuple

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


def _to_minutes(value: str) -> int:
    text = str(value or "").strip()
    if ":" not in text:
        raise ValueError(f"Invalid time format: {value}")
    hh, mm = text.split(":", 1)
    hours = int(hh)
    minutes = int(mm)
    if hours < 0 or hours > 23 or minutes < 0 or minutes > 59:
        raise ValueError(f"Invalid time format: {value}")
    return (hours * 60) + minutes


def _to_hhmm(total_minutes: int) -> str:
    hours = total_minutes // 60
    minutes = total_minutes % 60
    return f"{hours:02d}:{minutes:02d}"


def _overlaps(start: int, end: int, block_start: int, block_end: int) -> bool:
    return start < block_end and end > block_start


def _score_against_busy_slots(
    template: Dict[str, Any], busy_slots: List[Dict[str, Any]]
) -> int:
    if not busy_slots:
        return 0

    score = 0
    template_day = int(template.get("day_index", -1))
    template_start = int(template.get("start_minutes", -1))
    template_end = int(template.get("end_minutes", -1))

    for slot in busy_slots:
        if int(slot.get("day_index", -2)) != template_day:
            continue
        if _overlaps(
            template_start,
            template_end,
            int(slot.get("start_minutes", -1)),
            int(slot.get("end_minutes", -1)),
        ):
            score += 1

    return score


def build_slots_template(
    *,
    class_duration_minutes: int,
    class_start_time: str,
    class_end_time: str,
    recess_start_time: Optional[str] = None,
    recess_end_time: Optional[str] = None,
    weekdays: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    if class_duration_minutes <= 0:
        raise ValueError("class_duration_minutes must be greater than 0")

    start_minutes = _to_minutes(class_start_time)
    end_minutes = _to_minutes(class_end_time)
    if end_minutes <= start_minutes:
        raise ValueError("class_end_time must be later than class_start_time")

    recess_start_minutes = None
    recess_end_minutes = None
    if recess_start_time and recess_end_time:
        recess_start_minutes = _to_minutes(recess_start_time)
        recess_end_minutes = _to_minutes(recess_end_time)
        if recess_end_minutes <= recess_start_minutes:
            raise ValueError(
                "recess_end_time must be later than recess_start_time"
            )

    days = weekdays or WEEKDAYS
    normalized_days = [str(day).strip() for day in days if str(day).strip()]
    if not normalized_days:
        raise ValueError("At least one weekday must be provided")

    templates: List[Dict[str, Any]] = []
    for day_index, day_name in enumerate(normalized_days):
        pointer = start_minutes
        while pointer + class_duration_minutes <= end_minutes:
            slot_start = pointer
            slot_end = pointer + class_duration_minutes

            if (
                recess_start_minutes is not None
                and recess_end_minutes is not None
            ):
                if _overlaps(
                    slot_start,
                    slot_end,
                    recess_start_minutes,
                    recess_end_minutes,
                ):
                    pointer = max(pointer + 1, recess_end_minutes)
                    continue

            templates.append(
                {
                    "day": day_name,
                    "day_index": day_index,
                    "start_minutes": slot_start,
                    "end_minutes": slot_end,
                    "start_time": _to_hhmm(slot_start),
                    "end_time": _to_hhmm(slot_end),
                }
            )
            pointer += class_duration_minutes

    return templates


def generate_timetable_slots(
    *,
    papers: List[dict],
    class_duration_minutes: int,
    class_start_time: str,
    class_end_time: str,
    recess_start_time: Optional[str] = None,
    recess_end_time: Optional[str] = None,
    weekdays: Optional[List[str]] = None,
    max_classes_per_day: Optional[int] = None,
    randomize_paper_order: bool = False,
    random_seed: Optional[int] = None,
    conflict_context: Optional[Dict[str, Any]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    if not papers:
        raise ValueError(
            "At least one paper is required to generate timetable"
        )

    slot_templates = build_slots_template(
        class_duration_minutes=class_duration_minutes,
        class_start_time=class_start_time,
        class_end_time=class_end_time,
        recess_start_time=recess_start_time,
        recess_end_time=recess_end_time,
        weekdays=weekdays,
    )

    if not slot_templates:
        raise ValueError(
            "No class slots available for the given time boundaries"
        )

    filtered_templates = slot_templates
    if max_classes_per_day is not None:
        if int(max_classes_per_day) <= 0:
            raise ValueError("max_classes_per_day must be greater than 0")
        if not filtered_templates:
            raise ValueError(
                "No class slots available after applying max_classes_per_day"
            )

    ordered_papers = sorted(
        papers,
        key=lambda p: (
            str(p.get("semester") or ""),
            str(p.get("code") or ""),
            str(p.get("name") or ""),
        ),
    )
    if randomize_paper_order:
        random.Random(random_seed).shuffle(ordered_papers)

    generated_slots: List[Dict[str, Any]] = []
    day_assigned_counts: Dict[int, int] = {}
    lecturer_assigned_counts: Dict[str, int] = {}
    lecturer_busy_slots = (conflict_context or {}).get(
        "lecturer_busy_slots"
    ) or {}
    lecturer_busy_slots = {
        str(key): value if isinstance(value, list) else []
        for key, value in lecturer_busy_slots.items()
    }

    def _candidate_sort_key(
        paper: dict, template: dict, order_index: int
    ) -> tuple:
        lecturer_id = str(paper.get("lecturer_id") or "")
        busy_slots = lecturer_busy_slots.get(lecturer_id, [])
        return (
            _score_against_busy_slots(template, busy_slots),
            lecturer_assigned_counts.get(lecturer_id, 0),
            order_index,
        )

    for idx, template in enumerate(filtered_templates):
        day_index = int(template.get("day_index", 0))
        assign_paper = True
        if max_classes_per_day is not None:
            assigned = day_assigned_counts.get(day_index, 0)
            assign_paper = assigned < int(max_classes_per_day)

        paper = None
        if assign_paper:
            scored_candidates = sorted(
                enumerate(ordered_papers),
                key=lambda item: _candidate_sort_key(
                    item[1], template, item[0]
                ),
            )
            paper = scored_candidates[0][1] if scored_candidates else None
        if assign_paper:
            day_assigned_counts[day_index] = (
                day_assigned_counts.get(day_index, 0) + 1
            )
            lecturer_id = str((paper or {}).get("lecturer_id") or "")
            if lecturer_id:
                lecturer_assigned_counts[lecturer_id] = (
                    lecturer_assigned_counts.get(lecturer_id, 0) + 1
                )

        generated_slots.append(
            {
                **template,
                "paper_id": (paper or {}).get("_id"),
                "lecturer_id": (paper or {}).get("lecturer_id") or None,
                "paper_code": (paper or {}).get("code") or "",
                "paper_name": (paper or {}).get("name") or "",
                "location": "",
                "generated": True,
            }
        )

    metadata = {
        "total_slots": len(generated_slots),
        "days": sorted({slot["day"] for slot in generated_slots}),
        "class_duration_minutes": class_duration_minutes,
        "class_start_time": class_start_time,
        "class_end_time": class_end_time,
        "recess_start_time": recess_start_time or "",
        "recess_end_time": recess_end_time or "",
        "paper_count": len(ordered_papers),
        "max_classes_per_day": (
            int(max_classes_per_day)
            if max_classes_per_day is not None
            else None
        ),
        "assigned_slots": len(
            [slot for slot in generated_slots if slot.get("paper_id")]
        ),
        "randomized_paper_order": bool(randomize_paper_order),
        "random_seed": int(random_seed) if random_seed is not None else None,
    }
    return generated_slots, metadata
