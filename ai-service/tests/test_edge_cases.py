import pytest

from app.pipeline import pipeline
from app.schemas import PatientPayload


def test_empty_payload_does_not_crash():
    result = pipeline.predict(PatientPayload())
    assert 0 <= result["severity_score"] <= 100
    assert result["triage_level"] in {"LOW", "MODERATE", "URGENT", "CRITICAL"}
    assert "vitals" in result["missing_data"]


def test_all_none_vitals_does_not_crash():
    result = pipeline.predict(
        PatientPayload(vitals={"bp_systolic": None, "heart_rate": None, "spo2": None})  # type: ignore[arg-type]
    )
    assert result["triage_level"]


def test_extreme_values_are_clamped():
    payload = PatientPayload(
        age=120,
        vitals={"heart_rate": 400, "spo2": 1, "bp_systolic": 400},  # type: ignore[arg-type]
    )
    result = pipeline.predict(payload)
    assert 0 <= result["severity_score"] <= 100


def test_negative_and_zero_values():
    payload = PatientPayload(vitals={"heart_rate": 0, "temperature": -5})  # type: ignore[arg-type]
    result = pipeline.predict(payload)
    assert 0 <= result["severity_score"] <= 100


def test_hindi_only_intake():
    result = pipeline.predict(
        PatientPayload(symptoms_text="बुखार और खांसी", symptoms_language="hi")
    )
    assert result["triage_level"] in {"LOW", "MODERATE", "URGENT", "CRITICAL"}


def test_unknown_extra_fields_ignored():
    payload = PatientPayload(**{"patient_id": "P", "unknown_future_field": {"x": 1}})
    result = pipeline.predict(payload)
    assert result["triage_level"]
