"""Runtime configuration for the SwasthyaFlow AI triage service.

Everything is environment-driven with safe defaults so the service boots with
zero configuration. This module is intentionally dependency-light (stdlib only)
so it can be imported even when the optional ML stack is not installed.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _csv(name: str) -> list[str]:
    raw = os.getenv(name, "")
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    """Immutable settings snapshot resolved once at import time."""

    host: str = field(default_factory=lambda: os.getenv("AI_HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: _int("AI_PORT", 8000))
    log_level: str = field(default_factory=lambda: os.getenv("AI_LOG_LEVEL", "info"))

    base_dir: Path = field(default_factory=lambda: Path(__file__).resolve().parent.parent)
    models_dir: Path = field(default_factory=lambda: Path(os.getenv("AI_MODELS_DIR", "./models")).resolve())
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("AI_DATA_DIR", "./data")).resolve())
    db_path: str = field(default_factory=lambda: os.getenv("AI_DB_PATH", "./data/predictions.sqlite3"))

    pii_salt: str = field(default_factory=lambda: os.getenv("AI_PII_SALT", "change-me-in-production"))

    nlp_model: str = field(
        default_factory=lambda: os.getenv("AI_NLP_MODEL", "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli")
    )
    nlp_device: str = field(default_factory=lambda: os.getenv("AI_NLP_DEVICE", "cpu"))
    nlp_max_length: int = field(default_factory=lambda: _int("AI_NLP_MAX_LENGTH", 256))

    service_token: str = field(default_factory=lambda: os.getenv("AI_SERVICE_TOKEN", ""))
    cors_origins: list[str] = field(default_factory=lambda: _csv("AI_CORS_ORIGINS"))

    enable_feedback: bool = field(default_factory=lambda: _bool("AI_ENABLE_FEEDBACK", True))
    auto_retrain_on_override: bool = field(
        default_factory=lambda: _bool("AI_AUTO_RETRAIN_ON_OVERRIDE", False)
    )

    def ensure_dirs(self) -> None:
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        Path(self.db_path).resolve().parent.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_dirs()


# ---------------------------------------------------------------------------
# Fusion default weights.
#
# These are ONLY a last-resort fallback used when:
#   (a) no trained fusion model file exists, AND
#   (b) the bundled training dataset is unavailable so weights cannot be fitted
#       at startup.
# Whenever data is present the weights are learned (see app/fusion.py and
# scripts/train_fusion_model.py) so no assumption is hardcoded in the normally
# deployed path.
# ---------------------------------------------------------------------------
DEFAULT_FUSION_WEIGHTS: dict[str, float] = {
    "vitals": 0.30,
    "symptoms": 0.25,
    "labs": 0.25,
    "history": 0.15,
    "images": 0.05,
}

# Triage band thresholds (severity_score 0..100). Policy mapping per the
# product specification — not a model assumption.
TRIAGE_BANDS: list[tuple[str, int]] = [
    ("CRITICAL", 76),
    ("URGENT", 51),
    ("MODERATE", 26),
    ("LOW", 0),
]


def band_for_score(score: float) -> str:
    """Map a 0..100 severity score to a triage level label."""
    for label, minimum in TRIAGE_BANDS:
        if score >= minimum:
            return label
    return "LOW"
