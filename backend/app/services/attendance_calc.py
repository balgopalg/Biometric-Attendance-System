"""Attendance calculation service — predictive analytics."""

import numpy as np

from app.models.attendance import count_attendance
from app.models.paper import get_paper_by_id


def get_attendance_percentage(student_id: str, paper_id: str) -> float:
    """Return attendance percentage for a student in a paper."""
    paper = get_paper_by_id(paper_id)
    if not paper or paper.get("total_classes", 0) == 0:
        return 0.0
    attended = count_attendance(student_id, paper_id)
    return round((attended / paper["total_classes"]) * 100, 2)


def classes_needed_for_threshold(
    student_id: str, paper_id: str, threshold: float = 75.0
) -> int:
    """
    Calculate how many MORE classes the student must attend to reach
    the given threshold percentage.  Returns 0 if already met.
    """
    paper = get_paper_by_id(paper_id)
    if not paper:
        return 0
    total = paper.get("total_classes", 0)
    attended = count_attendance(student_id, paper_id)

    if total == 0:
        return 0

    current_pct = (attended / total) * 100
    if current_pct >= threshold:
        return 0

    # Need: (attended + x) / (total + x) >= threshold / 100
    # Solving for x:  x >= (threshold * total - 100 * attended) / (100 - threshold)
    needed = (threshold * total - 100 * attended) / (100 - threshold)
    return max(0, int(np.ceil(needed)))


def safe_bunks_remaining(
    student_id: str, paper_id: str, threshold: float = 75.0
) -> int:
    """
    Calculate how many classes the student can MISS and still meet
    the threshold.  Returns 0 if already below threshold.
    """
    paper = get_paper_by_id(paper_id)
    if not paper:
        return 0
    total = paper.get("total_classes", 0)
    attended = count_attendance(student_id, paper_id)

    if total == 0:
        return 0

    # Max total classes student can have if they skip all remaining
    # We assume total won't change going forward for simplicity
    # attended / total >= threshold / 100  →  safe if attended >= threshold * total / 100
    min_needed = int(np.ceil(threshold * total / 100))
    return max(0, attended - min_needed)


