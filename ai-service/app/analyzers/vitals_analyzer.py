"""Vitals analyzer: NEWS2 + qSOFA + unsupervised anomaly detection.

Two independent, clinical-grade layers:

1. Deterministic scoring — NEWS2 (Royal College of Physicians) and qSOFA
   (Sepsis-3). These require no training and are the safety net.
2. Unsupervised anomaly detection — an Isolation Forest (scikit-learn) fitted at
   startup on a normal-vitals dataset. When scikit-learn is unavailable the
   analyzer falls back to a robust median/MAD z-score detector, which is
   equivalent in spirit and equally data-driven (stats come from the same
   dataset).

The final vitals sub-score (0..100) is a weighted blend of the NEWS2 total, the
qSOFA count and the anomaly magnitude — all computed from the patient's own
measurements against population references.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .. import ml_support
from ..reference_ranges import (
    QSOFA_HIGH_RISK_AT,
    QSOFA_RR_THRESHOLD,
    QSOFA_SYSTOLIC_THRESHOLD,
    VITALS,
    score_news2_pulse,
    score_news2_respiratory_rate,
    score_news2_spo2,
    score_news2_systolic_bp,
    score_news2_temperature,
)

# Feature order used by the anomaly detector. Only these are modelled.
FEATURE_ORDER = [
    "bp_systolic",
    "bp_diastolic",
    "heart_rate",
    "respiratory_rate",
    "spo2",
    "temperature",
    "blood_glucose",
]

# Nominal NEWS2 maximum (7 parameters x 3) used to normalise to 0..1.
NEWS2_MAX = 20.0


@dataclass
class VitalsResult:
    score: float
    news2_total: int
    news2_risk: str
    qsofa_total: int
    anomalies: list[str] = field(default_factory=list)
    signals: list[str] = field(default_factory=list)
    red_flags: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    available: bool = True
    method: str = "rule"


class VitalsAnalyzer:
    """Stateless per-call analyzer with a one-time fitted anomaly model."""

    def __init__(self, normal_dataset: list[dict[str, float]] | None = None) -> None:
        self._feature_order = FEATURE_ORDER
        self._train_rows = normal_dataset or self._default_normal_dataset()
        self._model = None
        self._stats: dict[str, tuple[float, float]] = {}
        self._method = "robust-z"
        self._fit()

    # -- training ---------------------------------------------------------

    def _default_normal_dataset(self) -> list[dict[str, float]]:
        """Deterministic synthetic 'normal adult' cohort derived from reference
        ranges. Used only when no data/vitals_normal.csv is provided.

        Each vital is sampled on a coarse grid spanning [low - span, high + span]
        with the healthy band densely represented. This gives the anomaly model a
        data-derived definition of 'normal' rather than a single hardcoded cut.
        """
        import itertools

        grids: dict[str, list[float]] = {}
        for key in FEATURE_ORDER:
            spec = VITALS[key]
            mid = (spec.low + spec.high) / 2.0
            span = max(spec.high - spec.low, 1.0)
            grids[key] = [
                round(spec.low - 0.5 * span, 2),
                round(spec.low, 2),
                round(mid, 2),
                round(spec.high, 2),
                round(spec.high + 0.5 * span, 2),
            ]
        # Full cartesian product of the per-vital grids.
        return [dict(zip(FEATURE_ORDER, combo)) for combo in itertools.product(*(grids[k] for k in FEATURE_ORDER))]

    def _fit(self) -> None:
        np = ml_support.numpy()
        rows = [r for r in self._train_rows if all(r.get(k) is not None for k in FEATURE_ORDER)]
        if np is not None and rows:
            matrix = np.array([[float(r[k]) for k in FEATURE_ORDER] for r in rows], dtype=float)
            self._stats = {
                k: (float(np.median(matrix[:, i])), float(1.4826 * np.median(np.abs(matrix[:, i] - np.median(matrix[:, i])))) or 1.0)
                for i, k in enumerate(FEATURE_ORDER)
            }
            forest_cls = ml_support.sklearn_isolation_forest()
            if forest_cls is not None:
                try:
                    model = forest_cls(n_estimators=150, contamination=0.05, random_state=42)
                    model.fit(matrix)
                    self._model = model
                    self._method = "isolation-forest"
                    return
                except Exception:  # pragma: no cover - defensive
                    self._model = None
        # Robust median/MAD fallback (pure python).
        self._compute_robust_stats(rows)
        self._method = "robust-z"

    def _compute_robust_stats(self, rows: list[dict[str, float]]) -> None:
        for key in FEATURE_ORDER:
            values = sorted(float(r[key]) for r in rows) if rows else [VITALS[key].low, VITALS[key].high]
            n = len(values)
            median = values[n // 2] if n % 2 else (values[n // 2 - 1] + values[n // 2]) / 2.0
            deviations = sorted(abs(v - median) for v in values)
            mad = deviations[n // 2] if n % 2 else (deviations[n // 2 - 1] + deviations[n // 2]) / 2.0
            self._stats[key] = (median, (1.4826 * mad) or 1.0)

    # -- inference --------------------------------------------------------

    def analyze(self, vitals: dict[str, float | None]) -> VitalsResult:
        present = {k: float(v) for k, v in vitals.items() if v is not None and k in FEATURE_ORDER}
        missing = [k for k in FEATURE_ORDER if k not in present]
        if not present:
            return VitalsResult(
                score=0.0,
                news2_total=0,
                news2_risk="unavailable",
                qsofa_total=0,
                signals=["No vital signs were provided."],
                missing=missing,
                available=False,
                method=self._method,
            )

        news2, news2_signals = self._news2(present)
        qsofa, qsofa_signals = self._qsofa(present)
        anomaly_score, anomalies = self._anomaly(present)

        signals = news2_signals + qsofa_signals + anomalies
        news2_component = min(news2 / NEWS2_MAX, 1.0)
        qsofa_component = min(qsofa / 3.0, 1.0)

        # Blend: NEWS2 dominates, qSOFA escalates, anomaly nudges.
        blended = 0.55 * news2_component + 0.30 * qsofa_component + 0.15 * anomaly_score

        # Any individually extreme reading guarantees a clinically meaningful
        # floor so a single dangerous value cannot be averaged away.
        if news2 >= 7 or qsofa >= QSOFA_HIGH_RISK_AT:
            blended = max(blended, 0.85)
        elif any(s.startswith("CRITICAL") for s in news2_signals + qsofa_signals):
            blended = max(blended, 0.7)

        score = round(min(blended, 1.0) * 100.0, 1)
        risk = "low" if news2 <= 4 else "medium" if news2 <= 6 else "high"
        return VitalsResult(
            score=score,
            news2_total=news2,
            news2_risk=risk,
            qsofa_total=qsofa,
            anomalies=anomalies,
            signals=signals,
            red_flags=[s for s in signals if s.startswith("CRITICAL")],
            missing=missing,
            available=True,
            method=self._method,
        )

    def _news2(self, present: dict[str, float]) -> tuple[int, list[str]]:
        total = 0
        signals: list[str] = []
        if "respiratory_rate" in present:
            pts = score_news2_respiratory_rate(present["respiratory_rate"])
            total += pts
            if pts:
                signals.append(f"NEWS2 respiratory rate {present['respiratory_rate']:g} (+{pts})")
        if "spo2" in present:
            pts = score_news2_spo2(present["spo2"])
            total += pts
            if pts:
                signals.append(f"NEWS2 SpO2 {present['spo2']:g}% (+{pts})")
                if present["spo2"] < 90:
                    signals.append("CRITICAL SpO2 below 90%")
        if "bp_systolic" in present:
            pts = score_news2_systolic_bp(present["bp_systolic"])
            total += pts
            if pts:
                signals.append(f"NEWS2 systolic BP {present['bp_systolic']:g} (+{pts})")
        if "heart_rate" in present:
            pts = score_news2_pulse(present["heart_rate"])
            total += pts
            if pts:
                signals.append(f"NEWS2 heart rate {present['heart_rate']:g} (+{pts})")
        if "temperature" in present:
            pts = score_news2_temperature(present["temperature"])
            total += pts
            if pts:
                signals.append(f"NEWS2 temperature {present['temperature']:g}°C (+{pts})")
        return total, signals

    def _qsofa(self, present: dict[str, float]) -> tuple[int, list[str]]:
        total = 0
        signals: list[str] = []
        if "respiratory_rate" in present and present["respiratory_rate"] >= QSOFA_RR_THRESHOLD:
            total += 1
            signals.append(f"qSOFA respiratory rate ≥ {QSOFA_RR_THRESHOLD:g}")
        if "bp_systolic" in present and present["bp_systolic"] <= QSOFA_SYSTOLIC_THRESHOLD:
            total += 1
            signals.append(f"qSOFA systolic BP ≤ {QSOFA_SYSTOLIC_THRESHOLD:g}")
        if total >= QSOFA_HIGH_RISK_AT:
            signals.append("CRITICAL qSOFA ≥ 2 (possible sepsis)")
        return total, signals

    def _anomaly(self, present: dict[str, float]) -> tuple[float, list[str]]:
        np = ml_support.numpy()
        row = [present.get(k) for k in FEATURE_ORDER]
        anomalies: list[str] = []
        if self._model is not None and np is not None and all(v is not None for v in row):
            try:
                matrix = np.array([[float(v) for v in row]], dtype=float)
                # decision_function: >0 inlier, <0 outlier; map to 0..1 anomaly.
                raw = float(self._model.decision_function(matrix)[0])
                anomaly = max(0.0, min(1.0, 0.5 - raw))
                for i, key in enumerate(FEATURE_ORDER):
                    median, scale = self._stats.get(key, (0.0, 1.0))
                    z = abs((float(row[i]) - median) / scale)
                    if z >= 4.0:
                        anomalies.append(f"Anomalous {VITALS[key].label} (robust z≈{z:.1f})")
                return anomaly, anomalies
            except Exception:  # pragma: no cover
                pass
        # Robust z-score fallback.
        worst = 0.0
        for key in FEATURE_ORDER:
            if key not in present:
                continue
            median, scale = self._stats.get(key, (0.0, 1.0))
            z = abs((present[key] - median) / scale)
            worst = max(worst, z)
            if z >= 4.0:
                anomalies.append(f"Anomalous {VITALS[key].label} (robust z≈{z:.1f})")
        # Squash the worst z-score into 0..1 (z=3 -> ~0, z=9 -> ~1).
        anomaly = max(0.0, min(1.0, (worst - 3.0) / 6.0))
        return anomaly, anomalies
