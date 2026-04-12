"""Showcase face trainer that exports a compact Keras .h5 model.

The backend already stores per-user face crops in ``backend/dataset``.
This helper turns that folder tree into a lightweight training set and
writes a trainer artifact into ``backend/trainer/face_trainer.keras``.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    import tensorflow as tf
except Exception as exc:  # pragma: no cover - depends on local environment
    tf = None
    _TF_IMPORT_ERROR = exc
else:
    _TF_IMPORT_ERROR = None


_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_IMAGE_SIZE = (96, 96)
_DEFAULT_BATCH_SIZE = 16
_DEFAULT_EPOCHS = 3


def _resolve_path(path_value, fallback_name):
    candidate = Path(path_value or fallback_name)
    if candidate.is_absolute():
        return candidate
    return (_BACKEND_ROOT / candidate).resolve()


def _build_showcase_model(num_classes, image_size):
    inputs = tf.keras.Input(shape=(image_size[0], image_size[1], 3))
    x = tf.keras.layers.Rescaling(1.0 / 255.0)(inputs)
    x = tf.keras.layers.Conv2D(16, 3, padding="same", activation="relu")(x)
    x = tf.keras.layers.MaxPooling2D()(x)
    x = tf.keras.layers.Conv2D(32, 3, padding="same", activation="relu")(x)
    x = tf.keras.layers.MaxPooling2D()(x)
    x = tf.keras.layers.Conv2D(64, 3, padding="same", activation="relu")(x)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dense(64, activation="relu")(x)
    x = tf.keras.layers.Dropout(0.2)(x)

    if num_classes <= 1:
        outputs = tf.keras.layers.Dense(1, activation="sigmoid")(x)
        loss = "binary_crossentropy"
    else:
        outputs = tf.keras.layers.Dense(num_classes, activation="softmax")(x)
        loss = "sparse_categorical_crossentropy"

    model = tf.keras.Model(inputs=inputs, outputs=outputs, name="face_trainer_showcase")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss=loss,
        metrics=["accuracy"],
    )
    return model


def _count_images_by_class(dataset_dir):
    image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    class_names = []
    image_count = 0

    for entry in sorted(os.listdir(dataset_dir)):
        class_dir = dataset_dir / entry
        if not class_dir.is_dir():
            continue

        files = [
            file_path
            for file_path in class_dir.iterdir()
            if file_path.is_file() and file_path.suffix.lower() in image_exts
        ]
        if not files:
            continue

        class_names.append(entry)
        image_count += len(files)

    return class_names, image_count


def train_and_save_face_model(
    dataset_root="dataset",
    trainer_dir="trainer",
    model_filename="face_trainer.keras",
    image_size=_DEFAULT_IMAGE_SIZE,
    batch_size=_DEFAULT_BATCH_SIZE,
    epochs=_DEFAULT_EPOCHS,
):
    """Train a small showcase classifier from the current face dataset tree."""
    if tf is None:
        raise RuntimeError("TensorFlow is required to export the trainer artifact") from _TF_IMPORT_ERROR

    dataset_dir = _resolve_path(dataset_root, "dataset")
    if not dataset_dir.is_dir():
        raise ValueError(f"Dataset directory not found: {dataset_dir}")

    class_names, image_count = _count_images_by_class(dataset_dir)
    if not class_names or image_count == 0:
        raise ValueError(f"No training images found under: {dataset_dir}")

    data = tf.keras.utils.image_dataset_from_directory(
        dataset_dir,
        labels="inferred",
        label_mode="int",
        image_size=image_size,
        batch_size=batch_size,
        shuffle=True,
        seed=42,
    )

    model = _build_showcase_model(len(data.class_names), image_size)
    history = model.fit(
        data.prefetch(tf.data.AUTOTUNE),
        epochs=max(1, int(epochs)),
        verbose=0,
    )

    trainer_path = _resolve_path(trainer_dir, "trainer")
    trainer_path.mkdir(parents=True, exist_ok=True)

    model_path = trainer_path / model_filename
    model.save(model_path)

    return {
        "model_path": str(model_path),
        "trainer_dir": str(trainer_path),
        "dataset_dir": str(dataset_dir),
        "class_names": list(data.class_names),
        "sample_count": image_count,
        "epochs": len(history.history.get("loss", [])),
    }


__all__ = ["train_and_save_face_model"]