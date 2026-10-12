"""STEP 7 — Doctor override + feedback loop.

Every override (or confirmation) is persisted, tagged with agreement between the
AI level and the doctor's level, and optionally used to retrain the fusion
weights. Overrides are the ground-truth signal for the closed learning loop.

Drug safety note: overrides only change *priority*, never a diagnosis or a
prescription — the product is non-diagnostic by design.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass

from . import model_store
from .config import DEFAULT_FUSION_WEIGHTS
from .fusion import COMPONENT_KEYS, _normalise_weights
from .schemas import OverrideRequest
from . import storage

LEVEL_TO_TARGET = {"LOW": 15.0, "MODERATE": 38.0, "URGENT": 63.0, "CRITICAL": 88.0}


@dataclass
class OverrideOutcome:
    feedback_id: str
    agreement: bool
    retrain_queued: bool


def record_override(request: OverrideRequest) -> OverrideOutcome:
    agreement = (
        request.ai_triage_level is not None
        and request.ai_triage_level.upper() == request.doctor_level.upper()
    )
    patient_hash = storage.hash_patient_id(request.patient_id) if request.patient_id else None
    feedback_id = storage.log_override(
        prediction_id=request.prediction_id,
        patient_id_hash=patient_hash,
        session_id=request.session_id,
        ai_triage_level=request.ai_triage_level,
        doctor_level=request.doctor_level,
        agreement=agreement,
        reason=request.reason,
        doctor_id=request.doctor_id,
        doctor_role=request.doctor_role,
        features=request.features or {},
    )

    retrain_queued = False
    if not agreement:
        _append_training_row(request)
        retrain_queued = _maybe_retrain()
    return OverrideOutcome(feedback_id=feedback_id, agreement=agreement, retrain_queued=retrain_queued)


def _append_training_row(request: OverrideRequest) -> None:
    """Append the disagreement as a labelled row for the fusion trainer."""
    rows = model_store.settings.data_dir / "fusion_training.csv"
    exists = rows.exists()
    component_values = {
        key: _as_float(request.features.get(key))
        for key in COMPONENT_KEYS
    }
    if not any(value is not None for value in component_values.values()):
        return
    target = LEVEL_TO_TARGET.get(request.doctor_level.upper(), 50.0)
    rows.parent.mkdir(parents=True, exist_ok=True)
    with open(rows, "a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[*COMPONENT_KEYS, "severity"])
        if not exists:
            writer.writeheader()
        writer.writerow({
            **{key: (component_values[key] if component_values[key] is not None else "") for key in COMPONENT_KEYS},
            "severity": target,
        })


def _as_float(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _maybe_retrain() -> bool:
    from .config import settings

    if not settings.auto_retrain_on_override:
        return False
    return retrain_fusion_weights()


def retrain_fusion_weights() -> bool:
    """Refit fusion weights from the accumulated training CSV.

    Writes `models/fusion_weights.json`. Returns True on success.
    """
    path = model_store.settings.data_dir / "fusion_training.csv"
    if not path.exists():
        return False
    features: list[list[float]] = []
    labels: list[float] = []
    with open(path, encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        columns = [c for c in (reader.fieldnames or []) if c in COMPONENT_KEYS]
        if len(columns) < 2:
            return False
        for row in reader:
            try:
                features.append([float(row[c]) for c in columns])
                labels.append(float(row["severity"]))
            except (KeyError, ValueError):
                continue
    if len(features) < 20:
        return False

    from .fusion import FusionEngine

    weights = FusionEngine._least_squares(features, labels, columns) or FusionEngine._correlation_estimate(
        features, labels, columns
    )
    weights = weights or dict(DEFAULT_FUSION_WEIGHTS)
    # Blend with a tiny prior so a single class cannot dominate.
    blended = {
        key: 0.8 * weights.get(key, 0.0) + 0.2 * DEFAULT_FUSION_WEIGHTS.get(key, 0.0)
        for key in COMPONENT_KEYS
    }
    serialised = _normalise_weights(blended) or dict(DEFAULT_FUSION_WEIGHTS)
    import json

    with open(model_store.settings.models_dir / "fusion_weights.json", "w", encoding="utf-8") as handle:
        json.dump({"weights": serialised, "method": "retrained-from-feedback"}, handle, indent=2)
    return True
