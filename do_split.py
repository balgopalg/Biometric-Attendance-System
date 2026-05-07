import os
import shutil

src = "backend/app/routes/admin.py"
out_dir = "backend/app/routes/admin"

if not os.path.exists(out_dir):
    os.makedirs(out_dir)

with open(src, "r", encoding="utf-8") as f:
    lines = f.readlines()

def get_lines(start, end):
    # start and end are 1-indexed inclusive
    return "".join(lines[start-1:end])

helpers_code = get_lines(1, 1080)
# remove the admin_bp = Blueprint("admin", __name__) line
helpers_code = helpers_code.replace('admin_bp = Blueprint("admin", __name__)\n', '')

with open(os.path.join(out_dir, "_helpers.py"), "w", encoding="utf-8") as f:
    f.write(helpers_code)

header = "from . import admin_bp\nfrom ._helpers import *\n\n"

modules = {
    "courses.py": [(1081, 1353)],
    "papers.py": [(1354, 1676)],
    "lecturers.py": [(1677, 1964), (2870, 3088)],
    "students.py": [(1965, 2869), (3089, 3131)],
    "enrollment.py": [(3132, 3659), (4084, 4120)],
    "jobs.py": [(3660, 4083)],
    "attendance.py": [(4121, 6161)],
    "departments.py": [(6162, 6438)]
}

for mod, ranges in modules.items():
    with open(os.path.join(out_dir, mod), "w", encoding="utf-8") as f:
        f.write(header)
        for r in ranges:
            f.write(get_lines(r[0], r[1]))

init_code = """from flask import Blueprint

admin_bp = Blueprint("admin", __name__)

from . import courses
from . import papers
from . import lecturers
from . import students
from . import enrollment
from . import attendance
from . import jobs
from . import departments
"""

with open(os.path.join(out_dir, "__init__.py"), "w", encoding="utf-8") as f:
    f.write(init_code)

print("Split complete.")
