from flask import Blueprint

admin_bp = Blueprint("admin", __name__)

from . import courses
from . import papers
from . import lecturers
from . import students
from . import enrollment
from . import attendance
from . import jobs
from . import departments
