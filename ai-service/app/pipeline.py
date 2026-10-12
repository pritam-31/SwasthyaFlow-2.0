"""Orchestration pipeline — wires the analyzers, fusion, triage and logging.

Holds one instance of each analyzer (models are fitted once at startup).
`predict()` is the single entry point used by the API layer and by the tests.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import __version__, ml_support, storage
from .analyzers import (
    HistoryAnalyzer,
    ImageAnalyzer,
    LabAnalyzer,
    SymptomAnalyzer,
    VitalsAnalyzer,
)
from .config import settings
from .explainability import explain
from .fusion import FusionEngine
from .preprocessing import preprocess
from .schemas import PatientPayload
from .triage import classify, compute_confidence

NON_DIAGNOSTIC_DISCLAIMER = (
    "Decision support only. This severity score and triage level are produced "
    "from the patient's recorded data to assist a qualified clinician. They are "
    "not a diagnosis, a prescription, or a treatment plan. The final clinical "
    "decision always rests with the treating doctor."
)

COMPONENT_LABELS = {
    "vitals": "Vital signs",
    "symptoms": "Reported symptoms",
    "labs": "Laboratory results",
    "history": "Medical history",
    "images": "Imaging",
}


class TriagePipeline:
    def __init__(self) -> None:
        self.vitals = VitalsAnalyzer()
        self.symptoms = SymptomAnalyzer()
        self.labs = LabAnalyzer()
        self.history = HistoryAnalyzer()
        self.images = ImageAnalyzer()
        self.fusion = FusionEngine()
        storage.init_db()

    # -- main entry --------------------------------------------------------

    def predict(self, payload: PatientPayload) -> dict[str, Any]:
        patient = preprocess(payload)
        fallbacks: list[str] = []

        # 1. sub-analyzers -------------------------------------------------
        vitals_result = self.vitals.analyze(patient.vitals)
        symptom_result = self.symptoms.analyze(patient.symptoms_text, patient.symptoms_language)
        lab_result = self.labs.analyze(patient.labs, patient.gender)
        history_result = self.history.analyze(
            patient.age,
            patient.gender,
            patient.medical_history,
            patient.medications,
            patient.past_admissions,
            patient.last_visit_days_ago,
        )
        image_result = self.images.analyze(patient.ecg_image_url, patient.xray_image_url)

        if symptom_result.method == "lexicon" and ml_support.transformers_pipeline() is None:
            fallbacks.append("symptoms:lexicon (transformer model unavailable)")
        if history_result.method == "logistic-fallback":
            fallbacks.append("history:logistic-fallback (no trained history model)")
        if self.fusion._method == "default":  # noqa: SLF001
            fallbacks.append("fusion:default-weights (no training data)")

        component_scores = {
            "vitals": vitals_result.score,
            "symptoms": symptom_result.score,
            "labs": lab_result.score,
            "history": history_result.score,
            "images": image_result.score,
        }
        available = {
            "vitals": vitals_result.available,
            "symptoms": symptom_result.available,
            "labs": lab_result.available,
            "history": history_result.available,
            "images": image_result.available,
        }

        # 2. fusion --------------------------------------------------------
        fusion = self.fusion.fuse(component_scores, available)

        # 3. triage + actions ---------------------------------------------
        decision = classify(fusion.severity_score)

        component_signals = {
            "vitals": vitals_result.signals,
            "symptoms": [t for t, _ in symptom_result.matched_terms],
            "labs": lab_result.signals,
            "history": history_result.signals,
            "images": image_result.findings,
        }

        # 4. explainability ------------------------------------------------
        top_factors = explain(
            fusion,
            component_signals,
            history_result=history_result,
            history_analyzer=self.history,
            top_n=5,
        )

        # 5. red flags + confidence ---------------------------------------
        red_flags = (
            list(vitals_result.red_flags)
            + list(symptom_result.red_flags)
            + list(lab_result.red_flags)
        )
        available_count = sum(1 for key in available if available[key])
        confidence = compute_confidence(
            available_components=available_count,
            total_components=len(available),
            missing_data_count=len(patient.missing_data),
            fallbacks_used=len(fallbacks),
        )

        model_versions = {
            "vitals": vitals_result.method,
            "symptoms": symptom_result.method,
            "labs": "rule-based",
            "history": history_result.method,
            "images": image_result.method,
            "fusion": fusion.method,
            "nlp_backend": "transformer" if ml_support.transformers_pipeline() else "lexicon",
        }

        components = [
            {
                "key": key,
                "label": COMPONENT_LABELS[key],
                "score": component_scores[key],
                "weight": round(fusion.weights_used.get(key, 0.0), 4),
                "available": available[key],
                "signals": component_signals[key][:6],
            }
            for key in component_scores
        ]

        # 6. audit log (PII hashed) ---------------------------------------
        patient_id_hash = storage.hash_patient_id(patient.patient_id)
        prediction_id = storage.log_prediction(
            patient_id_hash=patient_id_hash,
            session_id=patient.session_id,
            facility_id=patient.facility_id,
            severity_score=fusion.severity_score,
            triage_level=decision.level,
            confidence=confidence,
            components=components,
            top_factors=[f.model_dump() for f in top_factors],
            features=patient.to_feature_snapshot(),
            model_versions=model_versions,
        )

        return {
            "patient_id_hash": patient_id_hash,
            "severity_score": fusion.severity_score,
            "triage_level": decision.level,
            "confidence": confidence,
            "components": components,
            "top_factors": [f.model_dump() for f in top_factors],
            "action": {
                "level": decision.level,
                "title": decision.title,
                "actions": decision.actions,
                "notify": decision.notify,
                "target_response_minutes": decision.target_response_minutes,
            },
            "red_flags": red_flags,
            "missing_data": patient.missing_data,
            "model_versions": model_versions,
            "fallbacks_used": fallbacks,
            "prediction_id": prediction_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "disclaimer": NON_DIAGNOSTIC_DISCLAIMER,
        }

    # -- introspection -----------------------------------------------------

    def model_info(self) -> dict[str, Any]:
        nlp_backend = "transformer" if ml_support.transformers_pipeline() else "lexicon"
        return {
            "version": __version__,
            "fusion_weights": self.fusion.weights,
            "ml_available": ml_support.ml_available(),
            "components": {
                "vitals": {"method": self.vitals._method, "features": ["news2", "qsofa", "isolation_forest"]},  # noqa: SLF001
                "symptoms": {"method": nlp_backend, "model": settings.nlp_model},
                "labs": {"method": "rule-based"},
                "history": {"method": self.history._kind},  # noqa: SLF001
                "images": {"method": self.images._classifier and "cnn" or "disabled"},  # noqa: SLF001
                "fusion": {"method": self.fusion._method},  # noqa: SLF001
            },
            "nlp_backend": nlp_backend,
        }


# Module-level singleton.
pipeline = TriagePipeline()
