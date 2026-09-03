"""Helpers for downloading and caching MediaPipe model assets."""

from __future__ import annotations

from pathlib import Path
from urllib.request import urlretrieve


_ASSET_DIR = Path(__file__).resolve().parent / "_mediapipe_assets"


def ensure_asset(filename: str, url: str) -> Path:
    """Return a local path for a MediaPipe asset, downloading it if needed."""
    _ASSET_DIR.mkdir(parents=True, exist_ok=True)
    asset_path = _ASSET_DIR / filename
    if asset_path.exists() and asset_path.stat().st_size > 0:
        return asset_path

    tmp_path = asset_path.with_suffix(asset_path.suffix + ".part")
    if tmp_path.exists():
        tmp_path.unlink()

    try:
        urlretrieve(url, tmp_path)
        tmp_path.replace(asset_path)
    except Exception as exc:
        if tmp_path.exists():
            tmp_path.unlink()
        raise RuntimeError(f"Failed to download MediaPipe asset {filename}: {exc}") from exc

    return asset_path