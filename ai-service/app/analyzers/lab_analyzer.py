"""Lab report analyzer.

Rule-based clinical thresholds (reference intervals + critical cut-offs) compute
a 0..100 abnormality score. Each out-of-range analyte contributes points scaled
by how far outside the interval it is; critical values guarantee a high floor
because they require immediate clinician attention.

Hemoglobin uses sex-specific lower bounds when gender is provided.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..reference_ranges import (
    HEMOGLOBIN_LOW_FEMALE,
    HEMOGLOBIN_LOW_MALE,
    LABS,
    LabSpec,
)

_NORM_RE = re.compile(r"[^a-z0-9]+")


def _normalise(name: str) -> str:
    return _NORM_RE.sub("", (name or "").lower())


_ALIAS_INDEX: dict[str, str] = {}
for _spec in LABS.values():
    _ALIAS_INDEX[_normalise(_spec.key)] = _spec.key
    _ALIAS_INDEX[_normalise(_spec.label)] = _spec.key
    for _alias in _spec.aliases:
        _ALIAS_INDEX[_normalise(_alias)] = _spec.key


@dataclass
class LabFinding:
    key: str
    label: str
    value: float
    unit: str
    flag: str  # normal | high | low | critical-high | critical-low
    severity: float  # 0..1
    detail: str


@dataclass
class LabResult:
    score: float
    findings: list[LabFinding] = field(default_factory=list)
    red_flags: list[str] = field(default_factory=list)
    signals: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    available: bool = True


class LabAnalyzer:
    # Weight each abnormal analyte contributes to the aggregate (0..100).
    _WEIGHTS: dict[str, float] = {
        "troponin": 1.0,
        "lactate": 0.9,
        "creatinine": 0.7,
        "potassium": 0.8,
        "sodium": 0.7,
        "platelets": 0.8,
        "wbc": 0.6,
        "hemoglobin": 0.7,
        "d_dimer": 0.6,
        "crp": 0.5,
        "glucose": 0.6,
    }

    def analyze(self, labs: dict[str, float | None], gender: str | None = None) -> LabResult:
        findings: list[LabFinding] = []
        red_flags: list[str] = []
        seen: set[str] = set()

        for raw_name, raw_value in (labs or {}).items():
            if raw_value is None:
                continue
            key = _ALIAS_INDEX.get(_normalise(raw_name))
            if key is None or key in seen:
                continue
            seen.add(key)
            spec = LABS[key]
            lo, hi = self._bounds(spec, gender)
            value = float(raw_value)
            flag, severity, detail = self._classify(spec, value, lo, hi)
            finding = LabFinding(key, spec.label, value, spec.unit, flag, severity, detail)
            findings.append(finding)
            if flag.startswith("critical"):
                red_flags.append(f"CRITICAL lab {spec.label} = {value:g} {spec.unit} ({detail})")

        missing = [spec.label for spec_key, spec in LABS.items() if spec_key not in seen]

        # Aggregate: weighted sum of severities, saturating at 100.
        total = 0.0
        for finding in findings:
            weight = self._WEIGHTS.get(finding.key, 0.6)
            total += finding.severity * weight * 20.0
        score = round(min(total, 100.0), 1)

        # Critical values force at least URGENT.
        if any(f.flag.startswith("critical") for f in findings):
            score = max(score, 80.0)

        signals = [
            f"{f.label} {f.value:g} {f.unit} ({f.flag})" for f in findings if f.flag != "normal"
        ]
        return LabResult(
            score=score,
            findings=findings,
            red_flags=red_flags,
            signals=signals,
            missing=missing,
            available=bool(findings),
        )

    @staticmethod
    def _bounds(spec: LabSpec, gender: str | None) -> tuple[float, float]:
        low, high = spec.low, spec.high
        if spec.key == "hemoglobin" and gender:
            if gender.lower() == "male":
                low = HEMOGLOBIN_LOW_MALE
            elif gender.lower() == "female":
                low = HEMOGLOBIN_LOW_FEMALE
        return low, high

    @staticmethod
    def _classify(spec: LabSpec, value: float, low: float, high: float) -> tuple[str, float, str]:
        if spec.critical_high is not None and value >= spec.critical_high:
            return "critical-high", 1.0, f"≥ critical high {spec.critical_high:g}"
        if spec.critical_low is not None and value <= spec.critical_low:
            return "critical-low", 1.0, f"≤ critical low {spec.critical_low:g}"
        if value > high:
            span = max(high, 1e-6)
            ratio = (value - high) / span
            severity = min(1.0, 0.35 + ratio)
            return "high", round(severity, 2), f"above reference high {high:g}"
        if value < low:
            span = max(low, 1e-6)
            ratio = (low - value) / span
            severity = min(1.0, 0.35 + ratio)
            return "low", round(severity, 2), f"below reference low {low:g}"
        return "normal", 0.0, "within reference interval"
