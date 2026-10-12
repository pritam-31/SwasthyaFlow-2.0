"""Pydantic request/response models for the AI triage service.

The inbound `PatientPayload` mirrors the JSON contract the platform sends. All
clinical fields are optional: missing data is handled downstream, never a crash.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class VitalsInput(BaseModel):
    """Vitals accept numbers or numeric strings; coercion happens in
    preprocessing so malformed values are dropped, never fatal."""

    model_config = ConfigDict(extra="allow")

    bp_systolic: float | str | None = None
    bp_diastolic: float | str | None = None
    heart_rate: float | str | None = None
    spo2: float | str | None = None
    temperature: float | str | None = None
    respiratory_rate: float | str | None = None
    blood_glucose: float | str | None = None


class PatientPayload(BaseModel):
    """The real-time patient record the AI evaluates.

    `extra="allow"` keeps unknown future fields without rejecting the request.
    """

    model_config = ConfigDict(extra="allow")

    patient_id: str = Field(default="unknown")
    age: float | None = None
    gender: Literal["male", "female", "other"] | None = None

    vitals: VitalsInput = Field(default_factory=VitalsInput)

    symptoms_text: str = ""
    symptoms_language: str = "en"

    medical_history: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)

    lab_reports: dict[str, float | None] = Field(default_factory=dict)

    past_admissions: int | None = None
    last_visit_days_ago: float | None = None

    ecg_image_url: str | None = None
    xray_image_url: str | None = None

    # Optional context carried through for audit (never used as a feature).
    facility_id: str | None = None
    session_id: str | None = None


class FactorContribution(BaseModel):
    name: str
    category: str
    contribution: float = Field(description="Signed contribution to the severity score.")
    direction: Literal["increases", "decreases"]
    detail: str


class ComponentScore(BaseModel):
    key: str
    label: str
    score: float = Field(ge=0, le=100, description="Sub-score 0..100.")
    weight: float
    available: bool = Field(description="False when the component had no usable data.")
    signals: list[str] = Field(default_factory=list)


class ActionPlan(BaseModel):
    level: str
    title: str
    actions: list[str]
    notify: list[str] = Field(default_factory=list)
    target_response_minutes: int | None = None


class SeverityResponse(BaseModel):
    patient_id_hash: str
    severity_score: float = Field(ge=0, le=100)
    triage_level: Literal["LOW", "MODERATE", "URGENT", "CRITICAL"]
    confidence: float = Field(ge=0, le=1)
    components: list[ComponentScore]
    top_factors: list[FactorContribution]
    action: ActionPlan
    red_flags: list[str] = Field(default_factory=list)
    missing_data: list[str] = Field(default_factory=list)
    model_versions: dict[str, str] = Field(default_factory=dict)
    fallbacks_used: list[str] = Field(default_factory=list)
    prediction_id: str | None = None
    generated_at: str
    disclaimer: str


class OverrideRequest(BaseModel):
    """Doctor confirms or overrides an AI severity decision (feedback loop)."""

    model_config = ConfigDict(extra="allow")

    prediction_id: str | None = None
    patient_id: str | None = None
    session_id: str | None = None
    # The level the doctor chose (may equal the AI level => "confirmed").
    doctor_level: Literal["LOW", "MODERATE", "URGENT", "CRITICAL"]
    reason: str = Field(min_length=1)
    doctor_id: str | None = None
    doctor_role: str | None = None
    # Snapshot of what the AI proposed, so feedback is self-contained.
    ai_severity_score: float | None = None
    ai_triage_level: str | None = None
    features: dict[str, Any] = Field(default_factory=dict)


class OverrideResponse(BaseModel):
    recorded: bool
    agreement: bool
    feedback_id: str
    message: str
    retrain_queued: bool = False


class HealthResponse(BaseModel):
    status: str
    version: str
    models: dict[str, Any]
    ml_available: bool
    timestamp: str


class ModelInfoResponse(BaseModel):
    version: str
    fusion_weights: dict[str, float]
    ml_available: bool
    components: dict[str, dict[str, Any]]
    nlp_backend: str
