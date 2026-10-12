from app import storage
from app.override_feedback import record_override
from app.schemas import OverrideRequest


def test_override_records_agreement():
    storage.init_db()
    request = OverrideRequest(
        patient_id="P1",
        ai_triage_level="CRITICAL",
        doctor_level="CRITICAL",
        reason="Confirmed on review",
        doctor_id="doc-1",
    )
    outcome = record_override(request)
    assert outcome.agreement is True
    assert outcome.feedback_id.startswith("fb-")


def test_override_disagreement_recorded():
    storage.init_db()
    request = OverrideRequest(
        patient_id="P2",
        ai_triage_level="LOW",
        doctor_level="URGENT",
        reason="Patient looked unwell despite low score",
        features={"vitals": 60, "symptoms": 70, "labs": 10, "history": 30, "images": 0},
    )
    outcome = record_override(request)
    assert outcome.agreement is False


def test_patient_id_is_hashed_not_stored_raw():
    storage.init_db()
    hashed = storage.hash_patient_id("P12345")
    assert "P12345" not in hashed
    assert len(hashed) == 32
