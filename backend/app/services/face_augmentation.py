"""Face image augmentation for improved recognition accuracy.

Generates enhanced variants of face crops (brightness, contrast, flip,
rotation, blur) and returns them as additional training images.  These
augmented images are saved into the student's dataset folder alongside
the originals so that embedding training has a richer set of samples.
"""

import cv2
import numpy as np


def augment_face_crop(face_crop: np.ndarray) -> list:
    """Generate augmented variants of a single 160×160 face crop.

    Parameters
    ----------
    face_crop : np.ndarray
        A face crop image (grayscale or BGR/RGB, any depth).

    Returns
    -------
    list of np.ndarray
        Augmented face images.  Each is the same shape as the input.
    """
    if face_crop is None or not hasattr(face_crop, "shape"):
        return []

    variants = []

    # 1. Horizontal flip — mirrors the face for left/right profile variety
    variants.append(cv2.flip(face_crop, 1))

    # 2. Brightness increase (+30)
    bright = cv2.convertScaleAbs(face_crop, alpha=1.0, beta=30)
    variants.append(bright)

    # 3. Brightness decrease (-30)
    dark = cv2.convertScaleAbs(face_crop, alpha=1.0, beta=-30)
    variants.append(dark)

    # 4. Contrast boost (1.3×)
    contrast = cv2.convertScaleAbs(face_crop, alpha=1.3, beta=0)
    variants.append(contrast)

    # 5. Slight Gaussian blur — simulates motion / low-quality cameras
    blurred = cv2.GaussianBlur(face_crop, (3, 3), 0)
    variants.append(blurred)

    # 6. Small rotation (+10°)
    variants.append(_rotate_crop(face_crop, 10))

    # 7. Small rotation (-10°)
    variants.append(_rotate_crop(face_crop, -10))

    # 8. Histogram equalization — improves recognition under varying lighting
    variants.append(_equalize(face_crop))

    return variants


def _rotate_crop(image: np.ndarray, angle: float) -> np.ndarray:
    """Rotate an image around its center without changing dimensions."""
    h, w = image.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(
        image, matrix, (w, h),
        borderMode=cv2.BORDER_REPLICATE,
    )
    return rotated


def _equalize(image: np.ndarray) -> np.ndarray:
    """Apply histogram equalization (works for grayscale and color)."""
    if len(image.shape) == 2:
        return cv2.equalizeHist(image)

    # For color images, equalize on the luminance channel (YCrCb)
    ycrcb = cv2.cvtColor(image, cv2.COLOR_BGR2YCrCb)
    ycrcb[:, :, 0] = cv2.equalizeHist(ycrcb[:, :, 0])
    return cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2BGR)


def augment_dataset_crops(
    original_crops: list,
    max_total: int = 50,
) -> list:
    """Augment a set of face crops up to ``max_total`` images.

    Interleaves originals with their augmented variants so the dataset
    contains a balanced mix.  If originals already meet the target count,
    no augmentation is performed.

    Parameters
    ----------
    original_crops : list of np.ndarray
        Original face crops from enrollment capture.
    max_total : int
        Maximum number of images to return.

    Returns
    -------
    list of np.ndarray
        Combined original + augmented crops, capped at ``max_total``.
    """
    if not original_crops:
        return []

    if len(original_crops) >= max_total:
        return original_crops[:max_total]

    result = list(original_crops)

    # Generate augmented variants from each original until we hit max_total
    for crop in original_crops:
        if len(result) >= max_total:
            break
        augmented = augment_face_crop(crop)
        for variant in augmented:
            if len(result) >= max_total:
                break
            result.append(variant)

    return result[:max_total]
