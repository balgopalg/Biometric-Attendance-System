# API Workflow Guide: Payloads, Validation, and Examples

This guide documents key workflow payload contracts and practical examples.

## 1. Auth workflow

### 1.1 Login

- Endpoint: POST /api/auth/login
- Purpose: Create authenticated session via JWT cookie
- Required fields:
  - email
  - password
- Validation rules:
  - email must be valid format
  - rate limits and lockouts may block excessive retries

Request example:

```json
{
  "email": "admin@system.com",
  "password": "admin123"
}
```

Success example:

```json
{
  "user": {
    "_id": "69da681fcd4bb4ef527e972a",
    "name": "System Admin",
    "email": "admin@system.com",
    "role": "admin",
    "department": "Administration",
    "must_change_password": false
  }
}
```

### 1.2 Change password

- Endpoint: POST /api/auth/change-password
- Required fields:
  - current_password
  - new_password
  - confirm_password
- Validation rules:
  - all fields required
  - new_password must equal confirm_password
  - new password must satisfy security policy
  - new password must differ from current

Request example:

```json
{
  "current_password": "admin123",
  "new_password": "NewSecurePass123!",
  "confirm_password": "NewSecurePass123!"
}
```

## 2. Admin workflows

### 2.1 Create student

- Endpoint: POST /api/admin/students
- Required fields:
  - name
  - email
  - course_id
- Validation rules:
  - required fields must be non-empty
  - email must be unique
  - course must exist and be active

Request example:

```json
{
  "name": "Alice Student",
  "email": "alice@student.com",
  "course_id": "69da6f26cd4bb4ef527e972b",
  "department": "Computing"
}
```

Success response example:

```json
{
  "_id": "69da6f37cd4bb4ef527e972d",
  "name": "Alice Student",
  "email": "alice@student.com",
  "role": "student",
  "temp_password": "9e2a4a8d20",
  "profile": {
    "user_id": "69da6f37cd4bb4ef527e972d",
    "reg_number": "REG001",
    "current_semester": 1,
    "course_id": "69da6f26cd4bb4ef527e972b"
  }
}
```

### 2.2 Face enrollment

- Endpoint: POST /api/admin/students/enroll
- Required fields:
  - user_id
  - photo
- Optional fields:
  - dataset_photos
- Validation rules:
  - student must exist
  - photo must decode to valid image
  - at least one face must be detected

Request example:

```json
{
  "user_id": "69da6f37cd4bb4ef527e972d",
  "photo": "data:image/png;base64,iVBORw0KGgoAAA...",
  "dataset_photos": [
    "data:image/png;base64,iVBORw0KGgoAAA...",
    "data:image/png;base64,iVBORw0KGgoAAA..."
  ]
}
```

Success response example:

```json
{
  "message": "Face enrolled successfully",
  "faces_detected": 1,
  "dataset_saved_count": 50
}
```

### 2.3 Bulk promote students

- Endpoint: POST /api/admin/students/bulk-promote
- Required fields:
  - student_ids
- Optional fields:
  - from_semester
- Validation rules:
  - student_ids must be non-empty
  - students at max semester are skipped

Request example:

```json
{
  "student_ids": [
    "69da6f37cd4bb4ef527e972d",
    "69db4d8fdc4feb73eefa4864"
  ],
  "from_semester": 1
}
```

Success response example:

```json
{
  "message": "Promoted 2 students, removed 2 old-semester paper assignments, skipped 0 already at max semester",
  "promoted_count": 2,
  "removed_papers_count": 2,
  "skipped_count": 0,
  "skipped_max_semester_count": 0
}
```

### 2.4 Paper bulk assignment

- Endpoint: POST /api/admin/papers/bulk-assign
- Required fields:
  - paper_id
  - student_ids

Request example:

```json
{
  "paper_id": "69da7292cd4bb4ef527e9735",
  "student_ids": [
    "69da6f37cd4bb4ef527e972d"
  ]
}
```

### 2.5 Attendance matrix export

- Endpoints:
  - GET /api/admin/attendance-matrix
  - GET /api/admin/attendance-matrix/export
  - GET /api/admin/attendance-matrix/export-csv
- Required query params:
  - course_id
  - academic_session
  - semester

Query example:

```text
/api/admin/attendance-matrix?course_id=69da6f26cd4bb4ef527e972b&academic_session=2026-28&semester=1
```

### 2.6 Audit rollback

- Endpoint: POST /api/admin/audit-logs/{log_id}/rollback
- Validation rules:
  - log must exist
  - rollback must be allowed and within window

Success response example:

```json
{
  "message": "Rollback completed successfully"
}
```

## 3. Lecturer workflows

### 3.1 Set PIN

- Endpoint: PUT /api/lecturer/pin
- Required fields:
  - pin
- Validation rules:
  - exactly 4 digits

Request example:

```json
{
  "pin": "1234"
}
```

### 3.2 Start session

- Endpoint: POST /api/lecturer/session/start
- Required fields:
  - paper_id
- Validation rules:
  - paper must exist
  - paper course must be active
  - lecturer must be assigned to paper

Request example:

```json
{
  "paper_id": "69da7292cd4bb4ef527e9735"
}
```

### 3.3 Live frame recognition

- Endpoint: POST /api/lecturer/session/recognize
- Required fields:
  - session_id
  - frame

Request example:

```json
{
  "session_id": "ff290922-d579-4ad6-8c8e-d1658779c048",
  "frame": "data:image/png;base64,iVBORw0KGgoAAA..."
}
```

### 3.4 Classroom image recognition

- Endpoint: POST /api/lecturer/session/recognize-image
- Content type: multipart/form-data
- Required fields:
  - session_id
  - image (file)

### 3.5 Commit attendance

- Endpoint: POST /api/lecturer/session/commit
- Required fields:
  - session_id
  - pin
- Validation rules:
  - valid 4-digit lecturer PIN
  - valid active session

Request example:

```json
{
  "session_id": "ff290922-d579-4ad6-8c8e-d1658779c048",
  "pin": "1234"
}
```

### 3.6 Adjust committed session

- Endpoint: PUT /api/lecturer/session/{session_id}/adjust
- Required fields:
  - pin
  - student_ids
- Validation rules:
  - rollback window must be active
  - PIN must match lecturer PIN

Request example:

```json
{
  "pin": "1234",
  "student_ids": [
    "69da6f37cd4bb4ef527e972d"
  ]
}
```

## 4. Student workflows

### 4.1 Profile

- Endpoint: GET /api/student/profile
- Purpose:
  - Current student profile with course and subjects

### 4.2 Attendance summary

- Endpoint: GET /api/student/attendance
- Purpose:
  - Per-paper attendance and class session details

### 4.3 Predictions

- Endpoint: GET /api/student/predictions
- Purpose:
  - Classes needed for 75% and safe bunk count

### 4.4 Eligibility

- Endpoint: GET /api/student/exam-eligibility
- Purpose:
  - Per-paper eligible/not-eligible status

## 5. Headers and auth for API clients

For mutation endpoints, include:

- Cookie from login response
- X-CSRF-TOKEN header from csrf_access_token cookie

Example header set:

```text
Cookie: access_token_cookie=<jwt>; csrf_access_token=<csrf>
X-CSRF-TOKEN: <csrf>
Content-Type: application/json
```

## 6. Source of truth

- OpenAPI contract: [docs/openapi.yaml](docs/openapi.yaml)
- Functional operations manual: [/docs/operations/SYSTEM_OPERATIONS_MANUAL.md](/docs/operations/SYSTEM_OPERATIONS_MANUAL.md)
- Command runbook: [/docs/operations/CLI_COMMAND_RUNBOOK.md](/docs/operations/CLI_COMMAND_RUNBOOK.md)