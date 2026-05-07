from . import admin_bp
from ._helpers import *

@admin_bp.route("/students/enroll", methods=["POST"])
@role_required("department_admin")
def enroll_student_face(user):
    """Accept a student photo, extract FaceNet embedding, and store it."""
    d = request.get_json(silent=True) or {}
    user_id = d.get("user_id")
    photo_b64 = d.get("photo")  # base64 encoded image
    dataset_photos = d.get("dataset_photos") or []

    if not user_id or not photo_b64:
        return jsonify({"error": "user_id and photo are required"}), 400

    resolved_user_id, _ = _resolve_user_identity(user_id)
    if not resolved_user_id:
        return jsonify({"error": "Student not found"}), 404

    try:
        img = decode_base64_image(photo_b64)
    except ValueError:
        # User error: invalid/corrupt image, do not log traceback
        return jsonify({"error": "Invalid image format. Please upload a valid PNG or JPEG photo."}), 400
    except Exception:
        # Unexpected error: log traceback
        current_app.logger.exception("Unexpected error during image decoding")
        return jsonify({"error": "Unexpected error while processing image. Please try again or contact support."}), 500

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
        add_face_embedding(resolved_user_id, embedding)
    except Exception as exc:
        current_app.logger.exception("Embedding persistence failed")
        return jsonify({"error": f"Failed to store face embedding: {exc}"}), 500

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
                    max_images=50,
                )
                dataset_saved_count = len(saved_paths)
        except Exception as exc:
            current_app.logger.exception("Dataset save failed during face enrollment")
            dataset_warning = f"Dataset save failed: {exc}"

    log_action("ENROLL_FACE", str(user["_id"]), target_user=resolved_user_id,
               details="Face embedding added")
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
    saved_path = save_student_upload(student_name, image, uploads_dir=uploads_dir)

    log_action(
        "UPLOAD_STUDENT_PHOTO",
        str(user["_id"]),
        details=f"Stored photo for {student_name} as {saved_path}",
    )

    return jsonify({
        "message": "Student photo uploaded successfully",
        "file_path": saved_path,
        "file_name": os.path.basename(saved_path),
    }), 201


def _train_single_face_job(actor_id, user_id, job_id=None):
    _raise_if_job_cancelled(job_id)
    if job_id:
        _update_training_job_progress(
            job_id,
            total_faces=1,
            processed_faces=0,
            trained_faces=0,
            failed_faces=0,
            stage="training",
            message="Training 1 of 1 face",
        )

    train_result = _train_embeddings_from_dataset_for_user(user_id)
    _raise_if_job_cancelled(job_id)
    if job_id:
        _update_training_job_progress(
            job_id,
            total_faces=1,
            processed_faces=1,
            trained_faces=1,
            failed_faces=0,
            stage="saving",
            message="Saving trainer artifact",
        )
    trainer_result = _refresh_face_trainer_artifact()
    _raise_if_job_cancelled(job_id)
    if job_id:
        _update_training_job_progress(
            job_id,
            total_faces=1,
            processed_faces=1,
            trained_faces=1,
            failed_faces=0,
            stage="completed",
            message="Training complete",
        )
    log_action(
        "TRAIN_FACE_FROM_DATASET",
        actor_id,
        target_user=user_id,
        details=(
            f"dataset={train_result['dataset_dir']}, "
            f"trained={train_result['trained_embeddings']}, "
            f"skipped={train_result['skipped_images']}, "
            f"trainer={trainer_result.get('model_path') or 'not_saved'}"
        ),
    )
    return {
        "message": "Face training completed",
        "trained_embeddings": train_result["trained_embeddings"],
        "skipped_images": train_result["skipped_images"],
        "dataset_dir": train_result["dataset_dir"],
        "trainer": trainer_result,
    }


def _train_bulk_faces_job(actor_id, user_ids, job_id=None):
    items = []
    total_trained_embeddings = 0
    success_count = 0
    failure_count = 0

    if job_id:
        _update_training_job_progress(
            job_id,
            total_faces=len(user_ids),
            processed_faces=0,
            trained_faces=0,
            failed_faces=0,
            stage="training",
            message=f"Training 0 of {len(user_ids)} faces",
        )

    for index, sid in enumerate(user_ids, start=1):
        _raise_if_job_cancelled(job_id)
        user_id, _ = _resolve_user_identity(sid)
        if not user_id:
            items.append({"user_id": sid, "success": False, "error": "Student not found"})
            failure_count += 1
            if job_id:
                _update_training_job_progress(
                    job_id,
                    processed_faces=index,
                    trained_faces=success_count,
                    failed_faces=failure_count,
                    stage="training",
                    message=f"Training {success_count} of {len(user_ids)} faces",
                )
            continue

        try:
            result = _train_embeddings_from_dataset_for_user(user_id)
            total_trained_embeddings += int(result["trained_embeddings"])
            success_count += 1
            items.append(
                {
                    "user_id": _as_text(user_id),
                    "success": True,
                    "trained_embeddings": result["trained_embeddings"],
                    "skipped_images": result["skipped_images"],
                    "dataset_dir": result["dataset_dir"],
                }
            )
        except ValueError as exc:
            items.append({"user_id": _as_text(user_id), "success": False, "error": str(exc)})
            failure_count += 1

        if job_id:
            _update_training_job_progress(
                job_id,
                processed_faces=index,
                trained_faces=success_count,
                failed_faces=failure_count,
                stage="training",
                message=f"Training {success_count} of {len(user_ids)} faces",
            )

    _raise_if_job_cancelled(job_id)
    if job_id:
        _update_training_job_progress(
            job_id,
            total_faces=len(user_ids),
            processed_faces=len(user_ids),
            trained_faces=success_count,
            failed_faces=failure_count,
            stage="saving",
            message="Saving trainer artifact",
        )
    trainer_result = _refresh_face_trainer_artifact()
    _raise_if_job_cancelled(job_id)
    log_action(
        "BULK_TRAIN_FACE_FROM_DATASET",
        actor_id,
        details=(
            f"requested={len(user_ids)}, success={success_count}, "
            f"failed={failure_count}, trained_embeddings={total_trained_embeddings}, "
            f"trainer={trainer_result.get('model_path') or 'not_saved'}"
        ),
    )
    return {
        "message": "Bulk training completed",
        "requested_count": len(user_ids),
        "success_count": success_count,
        "failure_count": failure_count,
        "total_trained_embeddings": total_trained_embeddings,
        "items": items,
        "trainer": trainer_result,
    }


def _rebuild_all_faces_job(actor_id, job_id=None):
    profiles = get_all_profiles(["user_id"])
    if not profiles:
        return {"error": "No student profiles found"}

    items = []
    success_count = 0
    failure_count = 0
    total_trained_embeddings = 0

    if job_id:
        _update_training_job_progress(
            job_id,
            total_faces=len(profiles),
            processed_faces=0,
            trained_faces=0,
            failed_faces=0,
            stage="training",
            message=f"Training 0 of {len(profiles)} faces",
        )

    for index, profile in enumerate(profiles, start=1):
        _raise_if_job_cancelled(job_id)
        user_id = _as_text(profile.get("user_id"))
        if not user_id:
            failure_count += 1
            items.append({"user_id": None, "success": False, "error": "Missing user_id"})
            if job_id:
                _update_training_job_progress(
                    job_id,
                    processed_faces=index,
                    trained_faces=success_count,
                    failed_faces=failure_count,
                    stage="training",
                    message=f"Training {success_count} of {len(profiles)} faces",
                )
            continue

        try:
            result = _train_embeddings_from_dataset_for_user(user_id)
            success_count += 1
            total_trained_embeddings += int(result["trained_embeddings"])
            items.append(
                {
                    "user_id": user_id,
                    "success": True,
                    "trained_embeddings": result["trained_embeddings"],
                    "skipped_images": result["skipped_images"],
                    "dataset_dir": result["dataset_dir"],
                }
            )
        except Exception as exc:
            failure_count += 1
            items.append({"user_id": user_id, "success": False, "error": str(exc)})

        if job_id:
            _update_training_job_progress(
                job_id,
                processed_faces=index,
                trained_faces=success_count,
                failed_faces=failure_count,
                stage="training",
                message=f"Training {success_count} of {len(profiles)} faces",
            )

    _raise_if_job_cancelled(job_id)
    if job_id:
        _update_training_job_progress(
            job_id,
            total_faces=len(profiles),
            processed_faces=len(profiles),
            trained_faces=success_count,
            failed_faces=failure_count,
            stage="saving",
            message="Saving trainer artifact",
        )
    trainer_result = _refresh_face_trainer_artifact()
    _raise_if_job_cancelled(job_id)
    log_action(
        "REBUILD_ALL_FACE_EMBEDDINGS",
        actor_id,
        details=(
            f"requested={len(profiles)}, success={success_count}, failure={failure_count}, "
            f"trained_embeddings={total_trained_embeddings}, "
            f"trainer={trainer_result.get('model_path') or 'not_saved'}"
        ),
    )

    return {
        "message": "Face embeddings rebuilt",
        "requested_count": len(profiles),
        "success_count": success_count,
        "failure_count": failure_count,
        "total_trained_embeddings": total_trained_embeddings,
        "items": items,
        "trainer": trainer_result,
    }


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
        return jsonify({
            "message": "Face training queued",
            "job_id": job_id,
            "status_url": f"/api/admin/jobs/{job_id}",
            "requested_count": 1,
        }), 202

    try:
        train_result = _train_single_face_job(str(user["_id"]), user_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({
        "message": "Face training completed",
        "trained_embeddings": train_result["trained_embeddings"],
        "skipped_images": train_result["skipped_images"],
        "dataset_dir": train_result["dataset_dir"],
    }), 200


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
        return jsonify({
            "message": "Bulk training queued",
            "job_id": job_id,
            "status_url": f"/api/admin/jobs/{job_id}",
            "requested_count": len(user_ids),
        }), 202

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
        return jsonify({
            "message": "Face embeddings rebuild queued",
            "job_id": job_id,
            "status_url": f"/api/admin/jobs/{job_id}",
            "requested_count": len(profiles),
        }), 202

    result = _rebuild_all_faces_job(str(user["_id"]))
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

    return jsonify({
        "message": "Face dataset captured successfully",
        "captured_count": len(saved_paths),
        "dataset_folder": os.path.dirname(saved_paths[0]) if saved_paths else "dataset",
    }), 200


