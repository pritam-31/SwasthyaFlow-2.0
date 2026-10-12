from app.preprocessing import preprocess
from app.schemas import PatientPayload
from tests.conftest import critical_payload


def test_normalises_vitals_and_labs():
    patient = preprocess(PatientPayload(**critical_payload()))
    assert patient.vitals["bp_systolic"] == 180
    assert patient.vitals["spo2"] == 88
    assert patient.labs["troponin"] == 0.9
    assert patient.labs["platelets"] == 90000


def test_handles_missing_data_without_crashing():
    patient = preprocess(PatientPayload(patient_id="X"))
    assert patient.patient_id == "X"
    assert patient.vitals == {}
    assert "vitals" in patient.missing_data
    assert "age" in patient.missing_data


def test_accepts_vital_aliases_and_combined_bp():
    payload = PatientPayload(
        vitals={"pulse": 88, "bp": "150/95", "oxygen saturation": 91},  # type: ignore[arg-type]
    )
    patient = preprocess(payload)
    assert patient.vitals["heart_rate"] == 88
    assert patient.vitals["bp_systolic"] == 150
    assert patient.vitals["bp_diastolic"] == 95
    assert patient.vitals["spo2"] == 91


def test_language_normalisation():
    assert preprocess(PatientPayload(symptoms_language="Hindi")).symptoms_language == "hi"
    assert preprocess(PatientPayload(symptoms_language="ODIA")).symptoms_language == "or"
    assert preprocess(PatientPayload(symptoms_language="unknown")).symptoms_language == "en"


def test_garbage_values_are_dropped():
    patient = preprocess(PatientPayload(vitals={"heart_rate": "not-a-number"}))  # type: ignore[arg-type]
    assert "heart_rate" not in patient.vitals
