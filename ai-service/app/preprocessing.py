"""STEP 1 — Data ingestion, validation and normalisation.

Turns the raw patient payload into a clean, typed structure the analyzers can
consume. Every field is optional; problems are collected in `warnings` and
`missing_data` rather than raised, so a partial record still yields a decision.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .analyzers.lab_analyzer import _ALIAS_INDEX, _normalise  # reuse the alias index
from .reference_ranges import VITALS
from .schemas import PatientPayload

_LANG_ALIASES = {
    "en": "en", "english": "en", "eng": "en",
    "hi": "hi", "hindi": "hi", "hin": "hi",
    "or": "or", "odia": "or", "oriya": "or", "ori": "or",
}

_VITAL_ALIAS_INDEX: dict[str, str] = {}
for _key, _spec in VITALS.items():
    _VITAL_ALIAS_INDEX[_normalise(_key)] = _key
    _VITAL_ALIAS_INDEX[_normalise(_spec.label)] = _key
    for _alias in _spec.aliases:
        _VITAL_ALIAS_INDEX[_normalise(_alias)] = _key

_BP_RE = re.compile(r"(\d{2,3})\s*/\s*(\d{2,3})")


@dataclass
class PreprocessedPatient:
    patient_id: str
    age: float | None
    gender: str | None
    vitals: dict[str, float] = field(default_factory=dict)
    symptoms_text: str = ""
    symptoms_language: str = "en"
    medical_history: list[str] = field(default_factory=list)
    medications: list[str] = field(default_factory=list)
    labs: dict[str, float] = field(default_factory=dict)
    past_admissions: int | None = None
    last_visit_days_ago: float | None = None
    ecg_image_url: str | None = None
    xray_image_url: str | None = None
    facility_id: str | None = None
    session_id: str | None = None
    missing_data: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_feature_snapshot(self) -> dict[str, object]:
        """Compact, PII-free snapshot used for feedback/retraining rows."""
        return {
            "age": self.age,
            "gender": self.gender,
            "vitals": self.vitals,
            "labs": self.labs,
            "history_flags": self.medical_history,
            "medications_count": len(self.medications),
            "past_admissions": self.past_admissions,
            "last_visit_days_ago": self.last_visit_days_ago,
            "symptom_length": len(self.symptoms_text),
        }


def _coerce_float(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip().replace(",", "")
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _coerce_int(value: object) -> int | None:
    numeric = _coerce_float(value)
    return int(numeric) if numeric is not None else None


def preprocess(payload: PatientPayload) -> PreprocessedPatient:
    result = PreprocessedPatient(
        patient_id=str(payload.patient_id or "unknown"),
        age=_coerce_float(payload.age),
        gender=(payload.gender or None),
        symptoms_text=(payload.symptoms_text or "").strip(),
        symptoms_language=_LANG_ALIASES.get((payload.symptoms_language or "en").strip().lower(), "en"),
        facility_id=payload.facility_id,
        session_id=payload.session_id,
        ecg_image_url=payload.ecg_image_url,
        xray_image_url=payload.xray_image_url,
    )

    # Vitals: accept canonical names, aliases and a combined "bp" field.
    raw_vitals = payload.vitals.model_dump() if payload.vitals else {}
    for raw_name, raw_value in raw_vitals.items():
        normalised = _normalise(raw_name)
        # Combined blood pressure ("150/95") is parsed before numeric coercion.
        if normalised in {"bp", "bloodpressure"}:
            match = _BP_RE.search(str(raw_value))
            if match:
                result.vitals["bp_systolic"] = float(match.group(1))
                result.vitals["bp_diastolic"] = float(match.group(2))
            continue
        numeric = _coerce_float(raw_value)
        if numeric is None:
            continue
        key = _VITAL_ALIAS_INDEX.get(normalised)
        if key:
            result.vitals[key] = numeric

    if payload.vitals is None:
        result.missing_data.append("vitals")

    # Labs: normalise aliases, keep the first value per analyte.
    for raw_name, raw_value in (payload.lab_reports or {}).items():
        numeric = _coerce_float(raw_value)
        if numeric is None:
            continue
        key = _ALIAS_INDEX.get(_normalise(raw_name), _normalise(raw_name))
        result.labs.setdefault(key, numeric)

    # History & medications: strings, de-duplicated, order preserved.
    result.medical_history = _clean_list(payload.medical_history)
    result.medications = _clean_list(payload.medications)
    result.past_admissions = _coerce_int(payload.past_admissions)
    result.last_visit_days_ago = _coerce_float(payload.last_visit_days_ago)

    # Missing-data bookkeeping (drives the completeness signal).
    if result.age is None:
        result.missing_data.append("age")
    if not result.gender:
        result.missing_data.append("gender")
    if not result.symptoms_text:
        result.missing_data.append("symptoms_text")
    if not result.medical_history:
        result.missing_data.append("medical_history")
    if not result.labs:
        result.missing_data.append("lab_reports")
    if not result.vitals:
        result.missing_data.append("vitals")
    return result


def _clean_list(values: list[str] | None) -> list[str]:
    seen: list[str] = []
    for item in values or []:
        text = str(item).strip()
        if text and text.lower() not in {s.lower() for s in seen}:
            seen.append(text)
    return seen
