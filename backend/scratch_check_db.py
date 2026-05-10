import os
from dotenv import load_dotenv
load_dotenv()
from app import create_app
from app.extensions import get_collection

app = create_app()
with app.app_context():
    papers = list(get_collection('academic', 'papers').find({}, {'name': 1, 'course_id': 1, 'department_id': 1}))
    print("PAPERS COUNT:", len(papers))
    if papers:
        print("FIRST PAPER:", papers[0])
        print("UNIQUE COURSE IDS IN PAPERS:", set(str(p.get('course_id')) for p in papers))
    
    courses = list(get_collection('academic', 'courses').find({}, {'name': 1, 'department_id': 1}))
    print("COURSES:", courses)
    
    depts = list(get_collection('academic', 'departments').find({}, {'name': 1}))
    print("DEPTS:", depts)
