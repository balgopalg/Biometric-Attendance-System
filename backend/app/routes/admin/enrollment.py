from app.models.enrollment import encode_face_embedding
from app.services.face_recognition import find_best_match

from . import admin_bp
from ._helpers import *


@admin_bp.route("/students/enroll", methods=["POST"])
@role_required("department_admin", "student")
def enroll_student_face(user):
    """Accept a student photo, extract FaceNet embedding, and store it."""
    d = request.get_json(silent=True) or {}
    user_id = d.get("user_id")
    photo_b64 = d.get("photo")  # base64 encoded image
    dataset_photos = d.get("dataset_photos") or []

    if not user_id or not photo_b64:
        return jsonify({"error": "user_id and photo are required"}), 400

    resolved_user_id, profile = _resolve_user_identity(user_id)
    if not resolved_user_id:
        return jsonify({"error": "Student not found"}), 404

    # Security check: Students can only enroll themselves
    if user["role"] == "student" and str(user["_id"]) != str(resolved_user_id):
        return (
            jsonify(
                {
                    "error": "Access Denied: You can only enroll your own face profile."
                }
            ),
            403,
        )

    try:
        img = decode_base64_image(photo_b64)
    except ValueError:
        # User error: invalid/corrupt image, do not log traceback
        return (
            jsonify(
                {
                    "error": "Invalid image format. Please upload a valid PNG or JPEG photo."
                }
            ),
            400,
        )
    except Exception:
        # Unexpected error: log traceback
        current_app.logger.exception("Unexpected error during image decoding")
        return (
            jsonify(
                {
                    "error": "Unexpected error while processing image. Please try again or contact support."
                }
            ),
            500,
        )

    try:
        detector = get_detector()
        faces = detector.detect_faces(img)
    except Exception as exc:
        current_app.logger.exception("Face detector failed")
        return jsonify({"error": f"Face detector unavailable: {exc}"}), 500

    if not faces:
        return jsonify({"error": "No face detected in the photo"}), 400

    # Use the first (largest confidence) face
    face_crop = faces[0]["crop"]
    try:
        embedding = generate_embedding(face_crop)

        # Check for face uniqueness within the same context (dept, course, semester)
        force = _to_bool(d.get("force", False))
        if not force:
            query = {
                "user_id": {"$ne": resolved_user_id},
                "course_id": profile.get("course_id"),
                "current_semester": profile.get("current_semester"),
            }
            if profile.get("department_id"):
                query["department_id"] = profile.get("department_id")

            other_profiles = list(
                get_collection("academic", "student_profiles").find(
                    query,
                    {"user_id": 1, "face_embeddings": 1, "reg_number": 1},
                )
            )

            if other_profiles:
                match = find_best_match(
                    embedding, other_profiles, threshold=0.7
                )
                if match:
                    matching_user = find_user_by_id(match["user_id"])
                    other_name = matching_user.get("name", "another student")
                    other_reg = match.get("reg_number") or "N/A"

                    # If current user is a student, we don't allow "force" via popup
                    if user["role"] == "student":
                        return (
                            jsonify(
                                {
                                    "error": f"This face profile already exists for user {other_name} (Reg No: {other_reg}). Please re-enroll with a clearer photo."
                                }
                            ),
                            400,
                        )

                    return (
                        jsonify(
                            {
                                "match_found": True,
                                "similarity": match["similarity"],
                                "matching_user": f"{other_name} (Reg No: {other_reg})",
                                "error": f"Face profile matches {other_name} [{other_reg}] ({match['similarity']*100:.1f}% similarity).",
                                "message": f"Face matches {other_name} ({other_reg}) with {match['similarity']*100:.1f}% similarity. Enroll anyway?",
                            }
                        ),
                        409,
                    )

        add_face_embedding(resolved_user_id, embedding)
    except Exception as exc:
        current_app.logger.exception("Embedding persistence failed")
        return (
            jsonify({"error": f"Failed to store face embedding: {exc}"}),
            500,
        )

    dataset_saved_count = 0
    dataset_warning = None
    if isinstance(dataset_photos, list) and dataset_photos:
        try:
            dataset_user_key = _as_text(resolved_user_id)

            dataset_crops = []
            last_valid_crop = face_crop
            for frame_b64 in dataset_photos[:50]:
                if not isinstance(frame_b64, str) or not frame_b64:
                    if last_valid_crop is not None:
                        dataset_crops.append(last_valid_crop)
                    continue
                try:
                    frame_img = decode_base64_image(frame_b64)
                    frame_faces = detector.detect_faces(frame_img)
                    if frame_faces:
                        last_valid_crop = frame_faces[0]["crop"]
                        dataset_crops.append(last_valid_crop)
                    elif last_valid_crop is not None:
                        dataset_crops.append(last_valid_crop)
                except Exception:
                    if last_valid_crop is not None:
                        dataset_crops.append(last_valid_crop)
                    continue

            if not dataset_crops and last_valid_crop is not None:
                dataset_crops.append(last_valid_crop)

            while len(dataset_crops) < 50 and last_valid_crop is not None:
                dataset_crops.append(last_valid_crop)

            if dataset_crops:
                saved_paths = save_cropped_face_dataset(
                    dataset_user_key,
                    dataset_crops,
                    dataset_root="dataset",
                    subfolder="students",
                    max_images=50,
                )
                dataset_saved_count = len(saved_paths)
        except Exception as exc:
            current_app.logger.exception(
                "Dataset save failed during face enrollment"
            )
            dataset_warning = f"Dataset save failed: {exc}"

    log_action(
        "ENROLL_FACE",
        str(user["_id"]),
        target_user=resolved_user_id,
        details="Face embedding added",
    )
    _clear_query_cache()

    response = {
        "message": "Face enrolled successfully",
        "faces_detected": len(faces),
        "dataset_saved_count": dataset_saved_count,
    }
    if dataset_warning:
        response["dataset_warning"] = dataset_warning

    return jsonify(response), 200


@admin_bp.route("/students/upload-photo", methods=["POST"])
@role_required("department_admin")
def upload_student_photo(user):
    """Upload and store a single student photo in uploads folder."""
    student_name = _as_text(request.form.get("student_name", ""))
    if not student_name:
        return jsonify({"error": "student_name is required"}), 400

    if "image" not in request.files:
        return jsonify({"error": "image file is required"}), 400

    file = request.files["image"]
    if not file or file.filename == "":
        return jsonify({"error": "No image file selected"}), 400

    file_bytes = file.read()
    if not file_bytes:
        return jsonify({"error": "Uploaded image is empty"}), 400

    try:
        image_rgb = decode_image_bytes(file_bytes)
    except ValueError:
        return jsonify({"error": "Invalid image file"}), 400

    image = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)

    uploads_dir = current_app.config.get("UPLOAD_FOLDER", "uploads")
    saved_path = save_student_upload(
        student_name, image, uploads_dir=uploads_dir
    )

    log_action(
        "UPLOAD_STUDENT_PHOTO",
        # Use ID of person who uploaded
        str(user["_id"]),
        details=f"Stored photo for {student_name} as {saved_path}",
    )

    return (
        jsonify(
            {
                "message": "Student photo uploaded successfully",
                "file_path": saved_path,
                "file_name": os.path.basename(saved_path),
            }
        ),
        201,
    )


def _add_lecturer_face_embedding(user_id, embedding, photo_url=None):
    users = get_collection("auth", "users")
    push_fields = {"face_embeddings": encode_face_embedding(embedding)}
    if photo_url:
        push_fields["photo_urls"] = photo_url

    users.update_one(
        {"_id": ObjectId(user_id)},
        {"$push": push_fields},
    )


@admin_bp.route("/lecturers/enroll", methods=["POST"])
@role_required("department_admin", "lecturer")
def enroll_lecturer_face(user):
    """Accept a lecturer photo, extract FaceNet embedding, and store it."""
    d = request.get_json(silent=True) or {}
    user_id = d.get("user_id") or d.get("lecturer_id") or d.get("id")
    photo_b64 = d.get("photo")
    dataset_photos = d.get("dataset_photos") or []

    if not user_id or not photo_b64:
        return jsonify({"error": "user_id and photo are required"}), 400

    resolved_user_id, profile = _resolve_user_identity(user_id)
    if not resolved_user_id:
        return jsonify({"error": "Lecturer not found"}), 404

    try:
        img = decode_base64_image(photo_b64)
    except ValueError:
        # User error: invalid/corrupt image, do not log traceback
        return (
            jsonify(
                {
                    "error": "Invalid image format. Please upload a valid PNG or JPEG photo."
                }
            ),
            400,
        )
    except Exception:
        # Unexpected error: log traceback
        current_app.logger.exception("Unexpected error during image decoding")
        return (
            jsonify(
                {
                    "error": "Unexpected error while processing image. Please try again or contact support."
                }
            ),
            500,
        )

    try:
        detector = get_detector()
        faces = detector.detect_faces(img)
    except Exception as exc:
        current_app.logger.exception("Face detector failed")
        return jsonify({"error": f"Face detector unavailable: {exc}"}), 500

    if not faces:
        return jsonify({"error": "No face detected in the photo"}), 400

    # Use the first (largest confidence) face
    face_crop = faces[0]["crop"]
    try:
        embedding = generate_embedding(face_crop)

        # Check for face uniqueness across all lecturers
        force = _to_bool(d.get("force", False))
        if not force:
            # Get all lecturers with face embeddings
            all_lecturers = list(
                get_collection("auth", "users").find(
                    {
                        "role": "lecturer",
                        "face_embeddings": {"$exists": True, "$ne": []},
                    },
                    {"_id": 1, "face_embeddings": 1, "name": 1},
                )
            )

            if all_lecturers:
                other_lecturers = [
                    l
                    for l in all_lecturers
                    if str(l.get("_id")) != str(resolved_user_id)
                ]
                if other_lecturers:
                    match = find_best_match(
                        embedding, other_lecturers, threshold=0.7
                    )
                    if match:
                        matching_user = find_user_by_id(match["user_id"])
                        other_name = matching_user.get(
                            "name", "another lecturer"
                        )

                        return (
                            jsonify(
                                {
                                    "match_found": True,
                                    "similarity": match["similarity"],
                                    "matching_user": other_name,
                                    "error": f"Face profile matches {other_name} ({match['similarity']*100:.1f}% similarity).",
                                    "message": f"Face matches {other_name} with {match['similarity']*100:.1f}% similarity. Enroll anyway?",
                                }
                            ),
                            409,
                        )

        _add_lecturer_face_embedding(resolved_user_id, embedding)
    except Exception as exc:
        current_app.logger.exception("Lecturer embedding persistence failed")
        return (
            jsonify({"error": f"Failed to store face embedding: {exc}"}),
            500,
        )

    dataset_saved_count = 0
    dataset_warning = None
    dataset_user_key = _as_text(resolved_user_id)

    if isinstance(dataset_photos, list) and dataset_photos:
        try:
            dataset_crops = []
            last_valid_crop = face_crop
            for frame_b64 in dataset_photos[:50]:
                if not isinstance(frame_b64, str) or not frame_b64:
                    if last_valid_crop is not None:
                        dataset_crops.append(last_valid_crop)
                    continue
                try:
                    frame_img = decode_base64_image(frame_b64)
                    frame_faces = detector.detect_faces(frame_img)
                    if frame_faces:
                        last_valid_crop = frame_faces[0]["crop"]
                        dataset_crops.append(last_valid_crop)
                    elif last_valid_crop is not None:
                        dataset_crops.append(last_valid_crop)
                except Exception:
                    if last_valid_crop is not None:
                        dataset_crops.append(last_valid_crop)
                    continue

            if not dataset_crops and last_valid_crop is not None:
                dataset_crops.append(last_valid_crop)

            while len(dataset_crops) < 50 and last_valid_crop is not None:
                dataset_crops.append(last_valid_crop)

            if dataset_crops:
                saved_paths = save_cropped_face_dataset(
                    dataset_user_key,
                    dataset_crops,
                    dataset_root="dataset",
                    subfolder="lecturers",
                    max_images=50,
                )
                dataset_saved_count = len(saved_paths)
        except Exception as exc:
            current_app.logger.exception(
                "Dataset save failed during lecturer face enrollment"
            )
            dataset_warning = f"Dataset save failed: {exc}"
    else:
        # Single photo upload — save the detected face crop to the dataset folder
        try:
            saved_paths = save_cropped_face_dataset(
                dataset_user_key,
                [face_crop] * 50,
                dataset_root="dataset",
                subfolder="lecturers",
                max_images=50,
            )
            dataset_saved_count = len(saved_paths)
        except Exception as exc:
            current_app.logger.exception(
                "Dataset save failed during lecturer single-photo enrollment"
            )
            dataset_warning = f"Dataset save failed: {exc}"

    log_action(
        "ENROLL_LECTURER_FACE",
        str(user["_id"]),
        target_user=_as_text(resolved_user_id),
        details="Face embedding added",
    )
    _clear_query_cache()

    response = {
        "message": "Face enrolled successfully",
        "faces_detected": len(faces),
        "dataset_saved_count": dataset_saved_count,
    }
    if dataset_warning:
        response["dataset_warning"] = dataset_warning

    return jsonify(response), 200


@admin_bp.route("/students/<sid>/train-face", methods=["POST"])
@admin_bp.route("/students/<sid>/train", methods=["POST"])
@admin_bp.route("/student/<sid>/train-face", methods=["POST"])
@role_required("department_admin")
@validate_ids("sid")
def train_face_from_dataset(user, sid):
    """Train student face embeddings from dataset/<user_id> images and save to DB."""
    user_id, _ = _resolve_user_identity(sid)
    if not user_id:
        return jsonify({"error": "Student not found"}), 404

    d = request.get_json(silent=True) or {}
    async_requested = _to_bool(d.get("async", False))

    if async_requested:
        job_id = _launch_background_job(
            current_app._get_current_object(),
            "train_face_from_dataset",
            {
                "actor_id": str(user["_id"]),
                "user_id": str(user_id),
            },
        )
        _update_training_job_progress(
            job_id,
            total_faces=1,
            processed_faces=0,
            trained_faces=0,
            failed_faces=0,
            stage="queued",
            message="Queued",
        )
        return (
            jsonify(
                {
                    "message": "Face training queued",
                    "job_id": job_id,
                    "status_url": f"/api/admin/jobs/{job_id}",
                    "requested_count": 1,
                }
            ),
            202,
        )

    try:
        train_result = _train_single_face_job(str(user["_id"]), user_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return (
        jsonify(
            {
                "message": "Face training completed",
                "trained_embeddings": train_result["trained_embeddings"],
                "skipped_images": train_result["skipped_images"],
                "dataset_dir": train_result["dataset_dir"],
            }
        ),
        200,
    )


@admin_bp.route("/students/train-face/bulk", methods=["POST"])
@admin_bp.route("/students/bulk-train-face", methods=["POST"])
@role_required("department_admin")
def bulk_train_face_from_dataset(user):
    """Train face embeddings in bulk for selected students from their dataset folders."""
    d = request.get_json(silent=True) or {}
    raw_ids = d.get("user_ids") or []
    user_ids = [_as_text(sid) for sid in raw_ids if _as_text(sid)]
    if not user_ids:
        return jsonify({"error": "user_ids is required"}), 400

    async_requested = _to_bool(d.get("async", False))
    if async_requested:
        job_id = _launch_background_job(
            current_app._get_current_object(),
            "bulk_train_face",
            {
                "requested_count": len(user_ids),
                "actor_id": str(user["_id"]),
                "user_ids": user_ids,
            },
        )
        _update_training_job_progress(
            job_id,
            total_faces=len(user_ids),
            processed_faces=0,
            trained_faces=0,
            failed_faces=0,
            stage="queued",
            message="Queued",
        )
        return (
            jsonify(
                {
                    "message": "Bulk training queued",
                    "job_id": job_id,
                    "status_url": f"/api/admin/jobs/{job_id}",
                    "requested_count": len(user_ids),
                }
            ),
            202,
        )

    result = _train_bulk_faces_job(str(user["_id"]), user_ids)
    _clear_query_cache()
    return jsonify(result), 200


@admin_bp.route("/students/train-face/rebuild-all", methods=["POST"])
@role_required("department_admin")
def rebuild_all_face_embeddings(user):
    """Rebuild face embeddings for every student profile from their dataset folders."""
    d = request.get_json(silent=True) or {}
    async_requested = _to_bool(d.get("async", False))

    if async_requested:
        job_id = _launch_background_job(
            current_app._get_current_object(),
            "rebuild_all_face_embeddings",
            {"actor_id": str(user["_id"])},
        )
        profiles = get_all_profiles(["user_id"])
        _update_training_job_progress(
            job_id,
            total_faces=len(profiles),
            processed_faces=0,
            trained_faces=0,
            failed_faces=0,
            stage="queued",
            message="Queued",
        )
        return (
            jsonify(
                {
                    "message": "Face embeddings rebuild queued",
                    "job_id": job_id,
                    "status_url": f"/api/admin/jobs/{job_id}",
                    "requested_count": len(profiles),
                }
            ),
            202,
        )

    result = _rebuild_all_faces_job(str(user["_id"]))
    if result.get("error"):
        return jsonify({"error": result["error"]}), 404
    _clear_query_cache()
    return jsonify(result), 200


@admin_bp.route("/lecturers/<lid>/train-face", methods=["POST"])
@admin_bp.route("/lecturers/<lid>/train", methods=["POST"])
@role_required("department_admin")
@validate_ids("lid")
def train_lecturer_face_from_dataset(user, lid):
    """Train lecturer face embeddings from dataset/lecturers/<lid> images and save to DB."""
    user_id, _ = _resolve_user_identity(lid)
    if not user_id:
        return jsonify({"error": "Lecturer not found"}), 404

    d = request.get_json(silent=True) or {}
    async_requested = _to_bool(d.get("async", False))

    if async_requested:
        job_id = _launch_background_job(
            current_app._get_current_object(),
            "train_face_from_dataset",
            {
                "actor_id": str(user["_id"]),
                "user_id": str(user_id),
            },
        )
        _update_training_job_progress(
            job_id,
            total_faces=1,
            processed_faces=0,
            trained_faces=0,
            failed_faces=0,
            stage="queued",
            message="Queued",
        )
        return (
            jsonify(
                {
                    "message": "Face training queued",
                    "job_id": job_id,
                    "status_url": f"/api/admin/jobs/{job_id}",
                    "requested_count": 1,
                }
            ),
            202,
        )

    try:
        train_result = _train_single_face_job(str(user["_id"]), user_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return (
        jsonify(
            {
                "message": "Face training completed",
                "trained_embeddings": train_result["trained_embeddings"],
                "skipped_images": train_result["skipped_images"],
                "dataset_dir": train_result["dataset_dir"],
            }
        ),
        200,
    )


@admin_bp.route("/lecturers/train-face/bulk", methods=["POST"])
@admin_bp.route("/lecturers/bulk-train-face", methods=["POST"])
@role_required("department_admin")
def bulk_train_lecturer_face_from_dataset(user):
    """Train face embeddings in bulk for selected lecturers from their dataset folders."""
    d = request.get_json(silent=True) or {}
    raw_ids = d.get("user_ids") or []
    user_ids = [_as_text(lid) for lid in raw_ids if _as_text(lid)]
    if not user_ids:
        return jsonify({"error": "user_ids is required"}), 400

    async_requested = _to_bool(d.get("async", False))
    if async_requested:
        job_id = _launch_background_job(
            current_app._get_current_object(),
            "bulk_train_face",
            {
                "requested_count": len(user_ids),
                "actor_id": str(user["_id"]),
                "user_ids": user_ids,
            },
        )
        _update_training_job_progress(
            job_id,
            total_faces=len(user_ids),
            processed_faces=0,
            trained_faces=0,
            failed_faces=0,
            stage="queued",
            message="Queued",
        )
        return (
            jsonify(
                {
                    "message": "Bulk training queued",
                    "job_id": job_id,
                    "status_url": f"/api/admin/jobs/{job_id}",
                    "requested_count": len(user_ids),
                }
            ),
            202,
        )

    result = _train_bulk_faces_job(str(user["_id"]), user_ids)
    _clear_query_cache()
    return jsonify(result), 200


@admin_bp.route("/lecturers/train-face/rebuild-all", methods=["POST"])
@role_required("department_admin")
def rebuild_all_lecturer_face_embeddings(user):
    """Rebuild face embeddings for every lecturer from their dataset folders."""
    d = request.get_json(silent=True) or {}
    async_requested = _to_bool(d.get("async", False))

    if async_requested:
        job_id = _launch_background_job(
            current_app._get_current_object(),
            "rebuild_all_lecturer_face_embeddings",
            {"actor_id": str(user["_id"])},
        )
        # Assuming we need to get total lecturers for progress. It's fetched in the background job,
        # but we can do a quick count.
        lecturers = get_users_by_role("lecturer")
        _update_training_job_progress(
            job_id,
            total_faces=len(lecturers),
            processed_faces=0,
            trained_faces=0,
            failed_faces=0,
            stage="queued",
            message="Queued",
        )
        return (
            jsonify(
                {
                    "message": "Lecturer face embeddings rebuild queued",
                    "job_id": job_id,
                    "status_url": f"/api/admin/jobs/{job_id}",
                    "requested_count": len(lecturers),
                }
            ),
            202,
        )

    result = _rebuild_all_lecturer_faces_job(str(user["_id"]))
    if result.get("error"):
        return jsonify({"error": result["error"]}), 404
    _clear_query_cache()
    return jsonify(result), 200


@admin_bp.route("/capture-faces", methods=["POST"])
@role_required("department_admin")
def capture_faces_dataset(user):
    """Capture webcam dataset images for a named user into dataset/<user_name>."""
    d = request.get_json(silent=True) or {}
    user_name = _as_text(d.get("user_name", ""))
    total_images = _to_int(d.get("total_images"), 50)

    if not user_name:
        return jsonify({"error": "user_name is required"}), 400
    if total_images <= 0:
        return jsonify({"error": "total_images must be greater than 0"}), 400

    try:
        saved_paths = capture_faces_for_user(
            user_name=user_name,
            dataset_root="dataset",
            total_images=total_images,
            delay_seconds=0.1,
        )
    except Exception as exc:
        current_app.logger.exception("Dataset capture failed")
        return jsonify({"error": f"Dataset capture failed: {exc}"}), 500

    log_action(
        "CAPTURE_FACE_DATASET",
        str(user["_id"]),
        details=f"Captured {len(saved_paths)} images for {user_name}",
    )

    return (
        jsonify(
            {
                "message": "Face dataset captured successfully",
                "captured_count": len(saved_paths),
                "dataset_folder": (
                    os.path.dirname(saved_paths[0])
                    if saved_paths
                    else "dataset"
                ),
            }
        ),
        200,
    )
