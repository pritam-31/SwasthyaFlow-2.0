import importlib.util

import pytest

from app.pipeline import pipeline
from tests.conftest import critical_payload, low_payload

fastapi_installed = importlib.util.find_spec("fastapi") is not None


def test_critical_patient_is_critical():
    result = pipeline.predict(__import__("app.schemas", fromlist=["PatientPayload"]).PatientPayload(**critical_payload()))
    assert result["triage_level"] in {"URGENT", "CRITICAL"}
    assert result["severity_score"] >= 51
    assert result["action"]["notify"]
    assert result["top_factors"]


def test_low_patient_is_low():
    result = pipeline.predict(__import__("app.schemas", fromlist=["PatientPayload"]).PatientPayload(**low_payload()))
    assert result["triage_level"] in {"LOW", "MODERATE"}
    assert result["severity_score"] < 51


def test_prediction_is_logged():
    result = pipeline.predict(__import__("app.schemas", fromlist=["PatientPayload"]).PatientPayload(**low_payload()))
    assert result["prediction_id"].startswith("pred-")


@pytest.mark.skipif(not fastapi_installed, reason="fastapi not installed")
def test_api_predict_endpoint():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    response = client.post("/predict-severity", json=critical_payload())
    assert response.status_code == 200
    body = response.json()
    assert body["triage_level"] in {"URGENT", "CRITICAL"}
    assert body["disclaimer"]


@pytest.mark.skipif(not fastapi_installed, reason="fastapi not installed")
def test_api_health():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
