"""Clinical reference ranges and standard triage scores.

These are the *validated clinical constants* (NEWS2, qSOFA, common lab
reference intervals). They are population reference data, not per-patient
assumptions: every patient value is compared against them at runtime and the
final decision is produced from the patient's own measurements.

Sources for the ranges are the published NEWS2 (Royal College of Physicians)
and qSOFA (Sepsis-3) criteria and standard adult laboratory reference intervals.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class VitalSpec:
    """Normal interval + the unit we expect values to be reported in."""

    key: str
    label: str
    low: float
    high: float
    unit: str
    aliases: tuple[str, ...] = field(default_factory=tuple)


# Canonical vitals the pipeline understands. Aliases cover the field names used
# by different intake sources / OCR output.
VITALS: dict[str, VitalSpec] = {
    "bp_systolic": VitalSpec("bp_systolic", "Systolic BP", 90, 120, "mmHg",
                             ("systolic", "sbp", "bp_systolic", "bp upper", "बीपी सिस्टोलिक")),
    "bp_diastolic": VitalSpec("bp_diastolic", "Diastolic BP", 60, 80, "mmHg",
                              ("diastolic", "dbp", "bp_diastolic", "bp lower", "बीपी डायस्टोलिक")),
    "heart_rate": VitalSpec("heart_rate", "Heart rate", 60, 100, "bpm",
                            ("heart_rate", "hr", "pulse", "नाड़ी", "हृदय गति")),
    "respiratory_rate": VitalSpec("respiratory_rate", "Respiratory rate", 12, 20, "breaths/min",
                                  ("respiratory_rate", "rr", "respiration", "resp rate", "श्वसन दर")),
    "spo2": VitalSpec("spo2", "SpO2", 94, 100, "%",
                      ("spo2", "o2 saturation", "oxygen saturation", "saturation", "एसपीओ2")),
    "temperature": VitalSpec("temperature", "Temperature", 36.1, 37.5, "°C",
                             ("temperature", "temp", "तापमान")),
    "blood_glucose": VitalSpec("blood_glucose", "Blood glucose", 70, 140, "mg/dL",
                               ("blood_glucose", "glucose", "sugar", "blood sugar", "शुगर")),
}


@dataclass(frozen=True)
class LabSpec:
    """Reference interval + critical thresholds for a lab analyte."""

    key: str
    label: str
    low: float
    high: float
    unit: str
    critical_low: float | None = None
    critical_high: float | None = None
    aliases: tuple[str, ...] = field(default_factory=tuple)


# Reference intervals are adult, sex-agnostic defaults; hemoglobin is refined by
# sex in the lab analyzer. Values outside the critical thresholds raise a
# CRITICAL lab flag.
LABS: dict[str, LabSpec] = {
    "troponin": LabSpec("troponin", "Troponin", 0.0, 0.04, "ng/mL",
                        critical_high=0.4, aliases=("troponin", "troponin i", "troponin t", "हृदय ट्रोपोनिन")),
    "creatinine": LabSpec("creatinine", "Creatinine", 0.6, 1.3, "mg/dL",
                          critical_high=4.0, aliases=("creatinine", "क्रिएटिनिन")),
    "hemoglobin": LabSpec("hemoglobin", "Hemoglobin", 12.0, 17.0, "g/dL",
                          critical_low=7.0, aliases=("hemoglobin", "hb", "haemoglobin", "हीमोग्लोबिन")),
    "wbc": LabSpec("wbc", "WBC", 4000.0, 11000.0, "cells/µL",
                   critical_low=2000.0, critical_high=30000.0,
                   aliases=("wbc", "white blood cell", "leukocyte", "श्वेत रक्त कोशिका")),
    "platelets": LabSpec("platelets", "Platelets", 150000.0, 400000.0, "cells/µL",
                         critical_low=50000.0, critical_high=1000000.0,
                         aliases=("platelets", "platelet count", "plt", "प्लेटलेट")),
    "d_dimer": LabSpec("d_dimer", "D-dimer", 0.0, 0.5, "mg/L FEU",
                       critical_high=2.0, aliases=("d-dimer", "ddimer", "d dimer")),
    "crp": LabSpec("crp", "CRP", 0.0, 5.0, "mg/L", critical_high=100.0, aliases=("crp", "c-reactive")),
    "lactate": LabSpec("lactate", "Lactate", 0.5, 2.2, "mmol/L",
                       critical_high=4.0, aliases=("lactate", "लैक्टेट")),
    "potassium": LabSpec("potassium", "Potassium", 3.5, 5.2, "mmol/L",
                         critical_low=2.5, critical_high=6.5, aliases=("potassium", "k+", "पोटैशियम")),
    "sodium": LabSpec("sodium", "Sodium", 135.0, 145.0, "mmol/L",
                      critical_low=120.0, critical_high=160.0, aliases=("sodium", "na+", "सोडियम")),
    "glucose": LabSpec("glucose", "Glucose", 70.0, 180.0, "mg/dL",
                       critical_low=40.0, critical_high=400.0, aliases=("glucose", "blood glucose")),
}


# ---------------------------------------------------------------------------
# NEWS2 (National Early Warning Score 2) — Royal College of Physicians.
# Each parameter maps a measurement to 0..3 points. `score_news2` in the vitals
# analyzer evaluates these against the patient's own readings.
# ---------------------------------------------------------------------------
def score_news2_respiratory_rate(value: float) -> int:
    if value <= 8:
        return 3
    if value <= 11:
        return 1
    if value <= 20:
        return 0
    if value <= 24:
        return 2
    return 3


def score_news2_spo2(value: float) -> int:
    if value <= 91:
        return 3
    if value <= 93:
        return 2
    if value <= 95:
        return 1
    return 0


def score_news2_systolic_bp(value: float) -> int:
    if value <= 90:
        return 3
    if value <= 100:
        return 2
    if value <= 110:
        return 1
    if value <= 219:
        return 0
    return 3


def score_news2_pulse(value: float) -> int:
    if value <= 40:
        return 3
    if value <= 50:
        return 1
    if value <= 90:
        return 0
    if value <= 110:
        return 1
    if value <= 130:
        return 2
    return 3


def score_news2_temperature(value: float) -> int:
    if value <= 35.0:
        return 3
    if value <= 36.0:
        return 1
    if value <= 38.0:
        return 0
    if value <= 39.0:
        return 1
    return 2


# qSOFA (quick Sequential Organ Failure Assessment, Sepsis-3).
QSOFA_RR_THRESHOLD = 22.0
QSOFA_SYSTOLIC_THRESHOLD = 100.0
QSOFA_HIGH_RISK_AT = 2

# Adult hemoglobin sex-specific lower bounds.
HEMOGLOBIN_LOW_MALE = 13.0
HEMOGLOBIN_LOW_FEMALE = 12.0
