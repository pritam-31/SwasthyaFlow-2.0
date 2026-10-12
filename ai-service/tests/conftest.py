"""Shared test fixtures. Adds the ai-service root to sys.path."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def critical_payload() -> dict:
    return {
        "patient_id": "P12345",
        "age": 58,
        "gender": "male",
        "vitals": {
            "bp_systolic": 180,
            "bp_diastolic": 110,
            "heart_rate": 120,
            "spo2": 88,
            "temperature": 101.5,
            "respiratory_rate": 26,
            "blood_glucose": 280,
        },
        "symptoms_text": "seene mein tez dard, saans nahi aa rahi",
        "symptoms_language": "hi",
        "medical_history": ["diabetes", "hypertension", "smoker"],
        "lab_reports": {
            "troponin": 0.9,
            "creatinine": 1.8,
            "hemoglobin": 9.2,
            "wbc": 14000,
            "platelets": 90000,
        },
        "medications": ["metformin", "amlodipine"],
        "past_admissions": 2,
        "last_visit_days_ago": 45,
        "ecg_image_url": None,
        "xray_image_url": None,
    }


def low_payload() -> dict:
    return {
        "patient_id": "P00001",
        "age": 28,
        "gender": "female",
        "vitals": {
            "bp_systolic": 118,
            "bp_diastolic": 76,
            "heart_rate": 72,
            "spo2": 99,
            "temperature": 36.8,
            "respiratory_rate": 15,
            "blood_glucose": 95,
        },
        "symptoms_text": "mild headache since morning",
        "symptoms_language": "en",
        "medical_history": [],
        "lab_reports": {"hemoglobin": 13.5, "wbc": 7000, "platelets": 250000},
        "medications": [],
        "past_admissions": 0,
        "last_visit_days_ago": 120,
    }
