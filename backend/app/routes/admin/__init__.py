from flask import Blueprint

admin_bp = Blueprint("admin", __name__)

from . import (attendance, courses, departments, enrollment, jobs, lecturers,
               papers, students)
