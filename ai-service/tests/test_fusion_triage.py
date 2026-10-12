from app.fusion import FusionEngine
from app.triage import classify


def test_fusion_renormalises_over_available():
    engine = FusionEngine()
    result = engine.fuse(
        {"vitals": 80, "symptoms": 0, "labs": 0, "history": 0, "images": 0},
        {"vitals": True, "symptoms": True, "labs": False, "history": False, "images": False},
    )
    # Only the two available components contribute; weights sum to 1.
    assert abs(sum(result.weights_used.values()) - 1.0) < 1e-6
    assert result.severity_score > 0


def test_fusion_no_data_is_zero():
    engine = FusionEngine()
    result = engine.fuse(
        {"vitals": 0, "symptoms": 0, "labs": 0, "history": 0, "images": 0},
        {"vitals": False, "symptoms": False, "labs": False, "history": False, "images": False},
    )
    assert result.severity_score == 0.0


def test_triage_band_boundaries():
    assert classify(10).level == "LOW"
    assert classify(25).level == "LOW"
    assert classify(26).level == "MODERATE"
    assert classify(50).level == "MODERATE"
    assert classify(51).level == "URGENT"
    assert classify(75).level == "URGENT"
    assert classify(76).level == "CRITICAL"
    assert classify(100).level == "CRITICAL"


def test_critical_action_triggers_emergency():
    decision = classify(90)
    assert "ambulance" in decision.notify
    assert "on_call_doctor" in decision.notify
