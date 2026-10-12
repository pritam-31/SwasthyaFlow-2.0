"""Persistence helpers for trained model artifacts and JSON metadata.

Uses joblib when available (handles numpy arrays), otherwise falls back to the
stdlib pickle. All artifacts live under `AI_MODELS_DIR`.
"""

from __future__ import annotations

import json
import pickle
from pathlib import Path
from typing import Any

from . import ml_support
from .config import settings


def model_path(name: str) -> Path:
    return settings.models_dir / name


def save_model(name: str, obj: Any) -> Path:
    path = model_path(name)
    joblib = ml_support.joblib_module()
    if joblib is not None:
        joblib.dump(obj, path)
    else:  # pragma: no cover - stdlib fallback
        with open(path, "wb") as handle:
            pickle.dump(obj, handle)
    return path


def load_model(name: str) -> Any | None:
    path = model_path(name)
    if not path.exists():
        return None
    try:
        joblib = ml_support.joblib_module()
        if joblib is not None:
            return joblib.load(path)
        with open(path, "rb") as handle:  # pragma: no cover
            return pickle.load(handle)
    except Exception:
        return None


def read_json(relative_path: str) -> Any | None:
    path = settings.data_dir / relative_path
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return None


def write_json(relative_path: str, data: Any) -> Path:
    path = settings.data_dir / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
    return path
