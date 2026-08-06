# Biometric Attendance System

A web-based attendance management system that uses facial recognition to automate classroom and staff attendance. The project consists of a React frontend and a Flask (Python) backend, supported by MongoDB and Redis.

## Features

- Real-time facial recognition using FaceNet-512D and MediaPipe.
- Batch processing for high-throughput classroom attendance.
- Role-Based Access Control (RBAC) for Super Admins, Department Admins, Lecturers, and Students.
- Admin dashboard for managing departments, courses, users, and timetables.
- Automated timetable generation and conflict detection.
- Attendance analytics and reporting with Excel (XLSX) and PDF export capabilities.
- Dockerized setup for local development and production deployment.

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS, Framer Motion
- **Backend:** Python 3.12, Flask, Gunicorn
- **Computer Vision:** MediaPipe, keras-facenet (InceptionResNetV1)
- **Database:** MongoDB
- **Cache & Queue:** Redis
- **Authentication:** JWT (HttpOnly cookies)

## Project Structure

- `/frontend` - React SPA
- `/backend` - Flask REST API, worker processes, and face recognition models
- `/docs` - Additional system documentation and guides

## Local Setup

### Prerequisites

- Docker and Docker Compose
- Node.js 20+
- Python 3.12+

### 1. Clone the repository

```bash
git clone <repository-url>
cd Biometric-Attendance-System
```

### 2. Configure Environment Variables

Copy the example environment files for both frontend and backend.

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```
*(Update `backend/.env` with your local database URIs and JWT secrets if necessary. The default values work out-of-the-box for local development.)*

### 3. Run the application

Start the services using Docker Compose:

```bash
docker-compose up --build -d
```

This starts MongoDB, Redis, the Flask backend API, the background worker, and the frontend development server.

### 4. Seed the initial admin account

```bash
cd backend
python seedAdmin.py
```

### 5. Access the services

- **Frontend:** http://localhost:8080 (or port 3000 depending on dev/prod configuration)
- **Backend API:** http://localhost:5000
- **Health Check:** http://localhost:5000/api/auth/health

## Running Tests

The repository includes test suites for both frontend and backend.

**Backend (pytest):**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest -q
```

**Frontend (ESLint, Vite Build, Playwright E2E):**
```bash
cd frontend
npm install
npm run lint
npm run build
npm run test:e2e
```

## System Architecture

### High-Level Architecture Flow

```
┌─────────────────────┐       ┌──────────────────────┐       ┌──────────────────┐
│  React Frontend     │───────│   Flask Backend API  │───────│  MongoDB (4x)    │
│  (Vite + Tailwind)  │ HTTPS │   (Gunicorn)         │       │  + Redis Cache   │
│  - Auth Context     │       │                      │       │  + Job Queue     │
│  - Dashboards       │       │  ├─ Auth Routes      │       │                  │
│  - Webcam/MediaPipe │◄─────►│  ├─ Admin Routes     │       │  - biometric_auth│
│  - Face Capture     │       │  ├─ Lecturer Routes  │       │  - academic_data │
│  - Image Upload     │       │  ├─ Student Routes   │       │  - attendance_ops│
│                     │       │  ├─ Recognition      │       │  - audit_logs    │
│                     │       │  └─ Timetable        │       │                  │
│                     │       │                      │       │                  │
│                     │       │  ┌──────────────────┐│       │                  │
│                     │       │  │ FaceNet Model    ││       │                  │
│                     │       │  │ (InceptionResNet)││       │                  │
│                     │       │  └──────────────────┘│       │                  │
└─────────────────────┘       └──────────────────────┘       └──────────────────┘
```

### Key Workflows

#### 1. User Authentication Flow
```
1. User submits credentials (email + password)
   ↓
2. Backend validates against bcrypt hash in biometric_auth DB
   ↓
3. On success: Generate JWT tokens (access + refresh)
   ↓
4. Return tokens + user profile (role, department, student_id)
   ↓
5. Frontend stores in sessionStorage (access) + localStorage (refresh)
   ↓
6. All subsequent requests include Authorization header
   ↓
7. Backend validates JWT + checks RBAC permissions
```

#### 2. Face Enrollment Pipeline
```
User Role: Department Admin / System Admin
   ↓
1. Bulk import CSV (email, name, roll_number) OR Manual entry
   ↓
2. For each student:
   a. Capture 5+ face angles from webcam (MediaPipe detection)
   b. Generate 512D embedding vectors (FaceNet model)
   c. Encrypt embeddings with AES-256-GCM
   d. Store in academic DB with encryption key ID
   ↓
3. Retrain FaceNet classifier (pickle to disk cache)
   ↓
4. Mark enrollment status: ENROLLED / PENDING / FAILED
   ↓
5. Send welcome email with temporary password
```

#### 3. Live Attendance Session Flow
```
User Role: Lecturer
   ↓
1. Start Session: Click "Start Attendance" → Session record created
   ↓
2. Real-Time Capture Loop (every 100-200ms):
   a. Capture frame from webcam
   b. Detect face using MediaPipe Face Mesh
   c. Crop face (160×160px)
   d. Generate 512D embedding using FaceNet
   e. Search embeddings DB using cosine similarity
   f. If confidence > threshold (0.6):
      - Match found → Log attendance with timestamp
      - Update UI: Show student name, confidence score
   ↓
3. Manual Mark (if face detection fails):
   a. Lecturer types student email
   b. System validates PIN (4-digit security code)
   c. Manual attendance record created with "MANUAL" flag
   ↓
4. End Session & Review:
   a. Lecturer reviews all marked attendance
   b. Can edit within 30-minute window (soft delete + re-add)
   ↓
5. Commit:
   a. Lecturer confirms final attendance list
   b. Records locked, cannot edit after
   c. Audit log entry created (immutable)
```

#### 4. Student Leave Request Flow
```
User Role: Student
   ↓
1. Submit Leave Request:
   a. Select date range (start-end dates)
   b. Choose leave type (sick, casual, medical)
   c. Upload supporting documents (if applicable)
   ↓
2. Eligibility Check:
   a. System calculates available leave balance
   b. If insufficient: Request rejected
   c. If sufficient: Move to approval pending
   ↓
3. Approval Workflow:
   a. Sent to Department Admin for review
   b. If approved: Attendance marked as LEAVE (non-absent)
   c. If rejected: Can submit appeal
   ↓
4. Appeal Process (if rejected):
   a. Student provides additional reason
   b. Escalated to System Admin
   c. Final decision made
   ↓
5. Result:
   a. Student notified via email + dashboard notification
   b. Attendance stats updated accordingly
```

#### 5. Classroom Image Upload Flow
```
User Role: Student (for absence verification)
   ↓
1. Click "Upload Classroom Image" button
   ↓
2. Modal opens with rear camera default:
   a. Video feed displays (real-time)
   b. User captures image
   c. Sizing remains consistent (4/3 aspect ratio)
   ↓
3. Image Verification:
   a. Send to backend for FaceNet matching
   b. Verify student face is in image
   c. Check timestamp is valid (recent)
   ↓
4. Link to Leave Request:
   a. Image associates with pending leave request
   b. Department Admin reviews before approval
   ↓
5. Store:
   a. Image encrypted with AES-256-GCM
   b. Metadata: student_id, timestamp, leave_request_id
```

### Data Models & Relationships

#### Database 1: biometric_auth
```
users {
  _id: ObjectId
  email: string (unique)
  password_hash: string (bcrypt)
  full_name: string
  role: enum [STUDENT, LECTURER, DEPT_ADMIN, SYS_ADMIN]
  department_id: ObjectId (FK → departments)
  created_at: datetime
  last_login: datetime
  is_active: boolean
}

sessions {
  _id: ObjectId
  user_id: ObjectId (FK → users)
  token: string
  refresh_token: string
  expires_at: datetime
  ip_address: string
  user_agent: string
}
```

#### Database 2: biometric_academic
```
departments {
  _id: ObjectId
  name: string (unique)
  head_id: ObjectId (FK → users [LECTURER])
  admin_id: ObjectId (FK → users [DEPT_ADMIN])
  created_at: datetime
}

courses {
  _id: ObjectId
  department_id: ObjectId (FK → departments)
  code: string
  name: string
  semester: integer
  academic_session: string
  created_at: datetime
}

papers {  # Subjects/Classes
  _id: ObjectId
  course_id: ObjectId (FK → courses)
  code: string
  name: string
  lecturer_id: ObjectId (FK → users [LECTURER])
  credits: integer
}

student_profiles {
  _id: ObjectId
  user_id: ObjectId (FK → users [STUDENT])
  roll_number: string
  enrollment_status: enum [ENROLLED, PENDING, FAILED]
  face_embeddings: [
    {
      embedding: [512 floats] (AES-256 encrypted),
      encryption_key_id: string,
      captured_at: datetime,
      quality_score: float
    }
  ]
  enrollment_date: datetime
  last_updated: datetime
}
```

#### Database 3: biometric_attendance_ops
```
attendance_sessions {
  _id: ObjectId
  lecturer_id: ObjectId (FK → users)
  paper_id: ObjectId (FK → papers)
  start_time: datetime
  end_time: datetime
  status: enum [ACTIVE, PAUSED, COMMITTED, ROLLED_BACK]
  total_marked: integer
  session_key: string (unique, for offline sync)
}

attendance_logs {
  _id: ObjectId
  session_id: ObjectId (FK → attendance_sessions)
  student_id: ObjectId (FK → users)
  timestamp: datetime
  mark_type: enum [AUTO, MANUAL, OVERRIDE]
  confidence_score: float (for AUTO)
  roll_call_status: enum [PRESENT, ABSENT, LATE, LEAVE]
}

leave_requests {
  _id: ObjectId
  student_id: ObjectId (FK → users)
  start_date: date
  end_date: date
  leave_type: string
  status: enum [PENDING, APPROVED, REJECTED, APPEALED]
  reason: string
  supporting_docs: [url]
  approved_by: ObjectId (FK → users [DEPT_ADMIN/SYS_ADMIN])
  approval_date: datetime
}
```

#### Database 4: biometric_audit
```
audit_logs {
  _id: ObjectId
  action: string (e.g., "ATTENDANCE_MARKED", "USER_CREATED")
  actor_id: ObjectId (FK → users)
  actor_role: string
  resource_type: string (e.g., "attendance_session")
  resource_id: ObjectId
  old_state: object (before modification)
  new_state: object (after modification)
  timestamp: datetime
  ip_address: string
  is_immutable: boolean (cannot modify after commit)
  hash_signature: string (for tampering detection)
}
```

## System Security Architecture

### Encryption Strategy
- **In Transit:** TLS 1.3 (HTTPS via Nginx reverse proxy)
- **At Rest:**
  - Face embeddings: AES-256-GCM (key from environment)
  - Passwords: bcrypt (12-round salting, no key-based encryption)
  - Session data: Redis in-memory (no persistence needed)

### Access Control (RBAC)
| Role | Permissions |
|------|------------|
| **Student** | View own attendance, submit leave requests, upload classroom images |
| **Lecturer** | Start attendance sessions, mark attendance, view class timetable, export reports |
| **Dept Admin** | Manage users/courses/timetables in department, approve leaves, manage department admins |
| **Sys Admin** | Full system access, manage departments, system-wide settings, audit logs |

### Rate Limiting
- Login: 5 attempts per 5 minutes per IP
- API endpoints: 100 requests per minute per user
- Face match: 1 request per 100ms per session

## API Documentation

### Authentication Endpoints
```
POST /auth/login
  Request: { email, password }
  Response: { access_token, refresh_token, user }

POST /auth/logout
  Request: { }
  Response: { message: "Logged out successfully" }

POST /auth/refresh
  Request: { }
  Response: { access_token }
```

### Attendance Endpoints
```
POST /lecturer/attendance/start
  Request: { paper_id }
  Response: { session_id, session_key }

POST /lecturer/attendance/mark-manual
  Request: { session_id, student_email, pin }
  Response: { success, message }

POST /lecturer/attendance/commit
  Request: { session_id }
  Response: { committed_count, audit_log_id }

GET /lecturer/attendance/sessions
  Response: [{ session_id, paper, start_time, marked_count }]
```

### Recognition Endpoints
```
POST /recognition/match
  Request: { embedding [512D array], session_id }
  Response: { matched_student_id, confidence, timestamp }

POST /recognition/upload-classroom-image
  Request: { file, leave_request_id }
  Response: { image_id, verification_status }
```

### Admin Endpoints
```
GET /admin/students
  Response: [{ user_id, name, email, enrollment_status }]

POST /admin/students/bulk-import
  Request: { csv_file }
  Response: { imported_count, failed_count, errors }

POST /admin/attendance/export
  Request: { date_range, paper_id, format: "xlsx"|"pdf" }
  Response: { file_url }
```

## Performance Characteristics

| Operation | Latency (p95) | Throughput |
|-----------|---------------|----|
| Face match (one face) | 400ms | 50 faces/min/core |
| Attendance mark | 150ms | 5000 records/min (batch) |
| Timetable query | 300ms | 1000 requests/min |
| Report generation | 2-5s | 10 reports/min |
| Database query (indexed) | <50ms | N/A |

## Scaling Strategy

### Horizontal Scaling
- Multiple Flask instances behind Nginx load balancer
- MongoDB sharding by `department_id`
- Redis Cluster for distributed caching
- RQ worker pool with auto-scaling

### Vertical Scaling
- Increase FaceNet batch size for GPU
- More CPU cores for concurrent face matching
- Increase Redis memory for larger embedding cache

### Expected Capacity
- Concurrent sessions: 1000+ (with clustering)
- Daily attendance records: 100k+ with batch marking
- Concurrent users: 5000+

## Documentation

For more detailed information, refer to the documentation directory:
- [Architecture Overview](ARCHITECTURE_OVERVIEW.md) - Detailed system design with diagrams
- [Detailed Project Review](DETAILED_REVIEW.md) - Comprehensive functional/non-functional analysis
- [API Docs](docs/README.md)
- [Frontend Architecture](docs/frontend/FRONTEND_README.md)
- [System Operations & Deployment](docs/operations/SYSTEM_OPERATIONS_MANUAL.md)
- [Security Guidelines](docs/security/SECURITY_HARDENING.md)

## License

**Copyright (c) 2026. All Rights Reserved.**

This is a proprietary project. The source code is provided strictly for evaluation and review purposes. Unauthorized copying, modification, distribution, or commercial use is strictly prohibited. See the [LICENSE](LICENSE) file for more details.
