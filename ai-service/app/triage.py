"""STEP 4 + 5 — Triage classification and action triggering.

The band boundaries are product policy (the spec's 0-25/26-50/51-75/76-100
mapping). The *action* attached to each band is configurable per deployment via
`data/action_policy.json`; when absent the spec's defaults below apply.

Triggering is data-driven in the sense that the band — hence the action — is
produced entirely from the patient's fused severity score.
"""

from __future__ import annotations

from dataclasses import dataclass

from .config import band_for_score
from .model_store import read_json

DEFAULT_ACTION_POLICY: dict[str, dict] = {
    "CRITICAL": {
        "title": "Immediate life-threatening risk",
        "actions": [
            "Alert on-call doctor and resuscitation team now",
            "Call ambulance / arrange immediate transfer",
            "Notify family / next of kin by SMS",
            "Move to emergency bay; continuous monitoring",
        ],
        "notify": ["on_call_doctor", "ambulance", "family_sms", "emergency_team"],
        "target_response_minutes": 0,
    },
    "URGENT": {
        "title": "Urgent — needs care within 1-2 hours",
        "actions": [
            "Book priority appointment within 1-2 hours",
            "Alert the duty doctor",
            "Start continuous vitals monitoring",
        ],
        "notify": ["duty_doctor", "nurse_station"],
        "target_response_minutes": 120,
    },
    "MODERATE": {
        "title": "Moderate — needs attention within 24 hours",
        "actions": [
            "Schedule consultation within 24 hours",
            "Send patient self-care instructions",
        ],
        "notify": ["nurse_station"],
        "target_response_minutes": 1440,
    },
    "LOW": {
        "title": "Low — home care with follow-up",
        "actions": [
            "Provide home-care guidance",
            "Set a follow-up reminder",
        ],
        "notify": [],
        "target_response_minutes": None,
    },
}


@dataclass
class TriageDecision:
    level: str
    title: str
    actions: list[str]
    notify: list[str]
    target_response_minutes: int | None


def _policy() -> dict[str, dict]:
    stored = read_json("action_policy.json")
    if isinstance(stored, dict) and stored:
        merged = {**DEFAULT_ACTION_POLICY}
        for level, cfg in stored.items():
            if level in merged and isinstance(cfg, dict):
                merged[level] = {**merged[level], **cfg}
        return merged
    return DEFAULT_ACTION_POLICY


def classify(severity_score: float) -> TriageDecision:
    level = band_for_score(severity_score)
    cfg = _policy()[level]
    return TriageDecision(
        level=level,
        title=cfg["title"],
        actions=list(cfg["actions"]),
        notify=list(cfg.get("notify", [])),
        target_response_minutes=cfg.get("target_response_minutes"),
    )


def compute_confidence(
    available_components: int,
    total_components: int,
    missing_data_count: int,
    fallbacks_used: int,
) -> float:
    """Confidence in the decision, driven by data availability.

    Full data + no fallbacks => high confidence (capped at 0.98). Each missing
    input and each fallback reduces it, with a floor of 0.3 so the score is
    always usable and never claims false certainty.
    """
    coverage = available_components / total_components if total_components else 0.0
    confidence = 0.55 + 0.45 * coverage
    confidence -= 0.05 * missing_data_count
    confidence -= 0.07 * fallbacks_used
    return round(min(max(confidence, 0.3), 0.98), 2)
