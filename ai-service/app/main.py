"""STEP 2 — FastAPI application for the SwasthyaFlow AI triage service.

Endpoints
    GET  /health                 liveness + model status
    GET  /model-info             fusion weights + component methods
    POST /predict-severity       the main data-driven severity endpoint
    POST /override               doctor confirm/override (feedback loop)
    POST /feedback/retrain       refit fusion weights from feedback

Security: if AI_SERVICE_TOKEN is set, all POSTs require
`Authorization: Bearer <token>`. Bind the service to a private network in
production; it should never be exposed publicly.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import __version__, storage
from .config import settings
from .override_feedback import record_override, retrain_fusion_weights
from .pipeline import NON_DIAGNOSTIC_DISCLAIMER, pipeline
from .schemas import (
    HealthResponse,
    ModelInfoResponse,
    OverrideRequest,
    OverrideResponse,
    PatientPayload,
    SeverityResponse,
)

app = FastAPI(
    title="SwasthyaFlow AI Triage Service",
    version=__version__,
    description=(
        "Data-driven, non-diagnostic patient severity scoring and triage-level "
        "decision support. Every decision is produced from the patient's own "
        "recorded data. Final clinical decisions rest with the treating doctor."
    ),
)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )


def require_token(authorization: str | None = Header(default=None)) -> None:
    """Optional shared-secret gate. No-op when AI_SERVICE_TOKEN is unset."""
    if not settings.service_token:
        return
    expected = f"Bearer {settings.service_token}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing service token.")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    info = pipeline.model_info()
    return HealthResponse(
        status="ok",
        version=__version__,
        models=info["components"],
        ml_available=info["ml_available"],
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@app.get("/model-info", response_model=ModelInfoResponse)
def model_info() -> ModelInfoResponse:
    return ModelInfoResponse(**pipeline.model_info())


@app.post("/predict-severity", response_model=SeverityResponse, dependencies=[Depends(require_token)])
def predict_severity(payload: PatientPayload) -> SeverityResponse:
    """Compute the data-driven severity score and triage level for one patient."""
    result = pipeline.predict(payload)
    return SeverityResponse(**result)


@app.post("/override", response_model=OverrideResponse, dependencies=[Depends(require_token)])
def override(request: OverrideRequest) -> OverrideResponse:
    """Record a doctor's confirmation/override and feed it to the learning loop."""
    if not settings.enable_feedback:
        raise HTTPException(status_code=403, detail="Feedback is disabled on this deployment.")
    outcome = record_override(request)
    return OverrideResponse(
        recorded=True,
        agreement=outcome.agreement,
        feedback_id=outcome.feedback_id,
        message=(
            "Doctor confirmed the AI level."
            if outcome.agreement
            else "Override recorded for retraining."
        ),
        retrain_queued=outcome.retrain_queued,
    )


@app.post("/feedback/retrain", dependencies=[Depends(require_token)])
def feedback_retrain() -> dict[str, object]:
    """Refit the fusion weights from accumulated feedback/training data."""
    ok = retrain_fusion_weights()
    # Reload weights into the live pipeline so the change takes effect.
    from .fusion import FusionEngine

    pipeline.fusion = FusionEngine()
    return {
        "retrained": ok,
        "fusion_weights": pipeline.fusion.weights,
        "disclaimer": NON_DIAGNOSTIC_DISCLAIMER,
    }


@app.get("/feedback/summary")
def feedback_summary() -> dict[str, object]:
    rows = storage.feedback_rows()
    total = len(rows)
    agreements = sum(1 for row in rows if row.get("agreement"))
    return {
        "feedback_events": total,
        "agreements": agreements,
        "agreement_rate": round(agreements / total, 3) if total else None,
        "predictions_logged": storage.prediction_count(),
    }
