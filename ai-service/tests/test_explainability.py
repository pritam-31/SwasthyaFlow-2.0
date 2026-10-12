from app.explainability import explain
from app.fusion import FusionEngine


def test_explain_returns_top_five():
    engine = FusionEngine()
    fusion = engine.fuse(
        {"vitals": 90, "symptoms": 85, "labs": 20, "history": 70, "images": None},
        {"vitals": True, "symptoms": True, "labs": True, "history": True, "images": False},
    )
    factors = explain(fusion, {"vitals": ["CRITICAL SpO2 < 90"], "symptoms": [], "labs": [], "history": []})
    assert 1 <= len(factors) <= 5
    # Highest absolute contribution first.
    contributions = [abs(f.contribution) for f in factors]
    assert contributions == sorted(contributions, reverse=True)


def test_direction_reflects_baseline():
    engine = FusionEngine()
    fusion = engine.fuse(
        {"vitals": 90, "symptoms": 95, "labs": 95, "history": 95, "images": 95},
        {"vitals": True, "symptoms": True, "labs": True, "history": True, "images": True},
    )
    factors = explain(fusion, {})
    assert all(f.contribution > 0 for f in factors)
    assert all(f.direction == "increases" for f in factors)
