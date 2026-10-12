"""STEP 3 — Fusion engine.

Combines the sub-scores into a single 0..100 severity score via a weighted
ensemble. Weights are LEARNED from data, in this order of preference:

  1. `models/fusion_weights.json` (produced by scripts/train_fusion_model.py).
  2. Fitted at startup from `data/fusion_training.csv` — least squares when numpy
     is available, otherwise a correlation-based estimate (both data-driven).
  3. `DEFAULT_FUSION_WEIGHTS` only when no data at all is present.

Weights are renormalised over the components that actually have data, so a
missing modality never dilutes the score with a phantom 0.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from typing import Iterable

from . import ml_support, model_store
from .config import DEFAULT_FUSION_WEIGHTS

# Canonical component keys.
COMPONENT_KEYS = ["vitals", "symptoms", "labs", "history", "images"]


@dataclass
class FusionResult:
    severity_score: float
    weights_used: dict[str, float]
    component_scores: dict[str, float]
    components_used: list[str] = field(default_factory=list)
    method: str = "default"


class FusionEngine:
    def __init__(self) -> None:
        self._weights: dict[str, float] = dict(DEFAULT_FUSION_WEIGHTS)
        self._method = "default"
        self._load_weights()

    # -- weight learning ---------------------------------------------------

    def _load_weights(self) -> None:
        stored = model_store.read_json("fusion_weights.json")
        if not isinstance(stored, dict) and (model_store.settings.models_dir / "fusion_weights.json").exists():
            import json

            try:
                with open(model_store.settings.models_dir / "fusion_weights.json", encoding="utf-8") as handle:
                    stored = json.load(handle)
            except Exception:
                stored = None
        if isinstance(stored, dict) and "weights" in stored:
            self._weights = _normalise_weights(stored["weights"])
            self._method = stored.get("method", "trained")
            return
        if self._fit_from_csv():
            return

    def _fit_from_csv(self) -> bool:
        path = model_store.settings.data_dir / "fusion_training.csv"
        if not path.exists():
            return False
        features: list[list[float]] = []
        labels: list[float] = []
        with open(path, encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            columns = [c for c in (reader.fieldnames or []) if c in COMPONENT_KEYS]
            if len(columns) < 2 or "severity" not in (reader.fieldnames or []):
                return False
            for row in reader:
                try:
                    features.append([float(row[c]) for c in columns])
                    labels.append(float(row["severity"]))
                except (KeyError, ValueError):
                    continue
        if len(features) < 20:
            return False

        weights = self._least_squares(features, labels, columns)
        if weights is None:
            weights = self._correlation_estimate(features, labels, columns)
        self._weights = weights
        self._method = "fitted-at-startup"
        return True

    @staticmethod
    def _least_squares(
        features: list[list[float]], labels: list[float], columns: list[str]
    ) -> dict[str, float] | None:
        np = ml_support.numpy()
        if np is None:
            return None
        try:
            X = np.array(features, dtype=float)
            # standardise so weights are comparable, then ridge-solve
            mean = X.mean(axis=0)
            std = X.std(axis=0)
            std[std == 0] = 1.0
            Xs = (X - mean) / std
            A = Xs.T @ Xs + 1e-3 * np.eye(Xs.shape[1])
            b = Xs.T @ np.array(labels, dtype=float)
            raw = np.linalg.solve(A, b)
            raw = np.clip(raw, 0, None)
            if raw.sum() == 0:
                return None
            return {col: float(w) for col, w in zip(columns, raw / raw.sum())}
        except Exception:  # pragma: no cover
            return None

    @staticmethod
    def _correlation_estimate(
        features: list[list[float]], labels: list[float], columns: list[str]
    ) -> dict[str, float]:
        n = len(labels)
        mean_label = sum(labels) / n
        weights: dict[str, float] = {}
        for index, col in enumerate(columns):
            col_values = [row[index] for row in features]
            mean_col = sum(col_values) / n
            cov = sum((col_values[i] - mean_col) * (labels[i] - mean_label) for i in range(n))
            var = sum((col_values[i] - mean_col) ** 2 for i in range(n))
            weights[col] = max(cov / var, 0.0) if var else 0.0
        return _normalise_weights(weights) or dict(DEFAULT_FUSION_WEIGHTS)

    # -- inference ---------------------------------------------------------

    def fuse(self, component_scores: dict[str, float], available: dict[str, bool]) -> FusionResult:
        used = [key for key in COMPONENT_KEYS if available.get(key) and component_scores.get(key) is not None]
        if not used:
            return FusionResult(0.0, dict(self._weights), dict(component_scores), [], self._method)

        effective = {key: max(self._weights.get(key, 0.0), 0.0) for key in used}
        total_weight = sum(effective.values())
        if total_weight <= 0:
            effective = {key: 1.0 for key in used}
            total_weight = float(len(used))
        effective = {key: value / total_weight for key, value in effective.items()}

        score = sum(effective[key] * float(component_scores[key]) for key in used)
        return FusionResult(
            severity_score=round(min(max(score, 0.0), 100.0), 1),
            weights_used=effective,
            component_scores={key: component_scores[key] for key in used},
            components_used=used,
            method=self._method,
        )

    @property
    def weights(self) -> dict[str, float]:
        return dict(self._weights)


def _normalise_weights(weights: dict[str, float]) -> dict[str, float]:
    positive = {key: max(float(value), 0.0) for key, value in weights.items() if key in COMPONENT_KEYS}
    total = sum(positive.values())
    if total <= 0:
        return {}
    return {key: value / total for key, value in positive.items()}


def renormalise_columns(columns: Iterable[str]) -> list[str]:
    return [c for c in columns if c in COMPONENT_KEYS]
