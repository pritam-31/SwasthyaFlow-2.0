"""Prediction & feedback persistence (SQLite, stdlib only).

Privacy (HIPAA / GDPR):
  * Raw patient identifiers are NEVER stored. `patient_id` is hashed with a
    salted SHA-256 into a pseudonym (`patient_id_hash`) before it is logged.
  * Free-text symptoms are not persisted either; only derived features/scores.
  * The store is append-only for predictions and feedback.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from .config import settings

_LOCK = threading.Lock()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS predictions (
    prediction_id TEXT PRIMARY KEY,
    patient_id_hash TEXT NOT NULL,
    session_id TEXT,
    facility_id TEXT,
    severity_score REAL NOT NULL,
    triage_level TEXT NOT NULL,
    confidence REAL,
    components_json TEXT,
    top_factors_json TEXT,
    features_json TEXT,
    model_versions_json TEXT,
    generated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS overrides (
    feedback_id TEXT PRIMARY KEY,
    prediction_id TEXT,
    patient_id_hash TEXT,
    session_id TEXT,
    ai_triage_level TEXT,
    doctor_level TEXT NOT NULL,
    agreement INTEGER NOT NULL,
    reason TEXT NOT NULL,
    doctor_id TEXT,
    doctor_role TEXT,
    features_json TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_predictions_patient ON predictions(patient_id_hash);
CREATE INDEX IF NOT EXISTS idx_overrides_patient ON overrides(patient_id_hash);
"""


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(settings.db_path, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with _LOCK, _connect() as connection:
        connection.executescript(_SCHEMA)


def hash_patient_id(patient_id: str) -> str:
    """Salted, deterministic pseudonym. Never reversible without the salt."""
    salted = f"{settings.pii_salt}:{patient_id}".encode()
    return hashlib.sha256(salted).hexdigest()[:32]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def log_prediction(
    *,
    patient_id_hash: str,
    session_id: str | None,
    facility_id: str | None,
    severity_score: float,
    triage_level: str,
    confidence: float,
    components: list[dict[str, Any]],
    top_factors: list[dict[str, Any]],
    features: dict[str, Any],
    model_versions: dict[str, str],
) -> str:
    prediction_id = f"pred-{uuid.uuid4()}"
    with _LOCK, _connect() as connection:
        connection.execute(
            """
            INSERT INTO predictions (
                prediction_id, patient_id_hash, session_id, facility_id,
                severity_score, triage_level, confidence, components_json,
                top_factors_json, features_json, model_versions_json, generated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                prediction_id,
                patient_id_hash,
                session_id,
                facility_id,
                float(severity_score),
                triage_level,
                float(confidence),
                json.dumps(components),
                json.dumps(top_factors),
                json.dumps(features),
                json.dumps(model_versions),
                _now(),
            ),
        )
    return prediction_id


def log_override(
    *,
    prediction_id: str | None,
    patient_id_hash: str | None,
    session_id: str | None,
    ai_triage_level: str | None,
    doctor_level: str,
    agreement: bool,
    reason: str,
    doctor_id: str | None,
    doctor_role: str | None,
    features: dict[str, Any],
) -> str:
    feedback_id = f"fb-{uuid.uuid4()}"
    with _LOCK, _connect() as connection:
        connection.execute(
            """
            INSERT INTO overrides (
                feedback_id, prediction_id, patient_id_hash, session_id,
                ai_triage_level, doctor_level, agreement, reason, doctor_id,
                doctor_role, features_json, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                feedback_id,
                prediction_id,
                patient_id_hash,
                session_id,
                ai_triage_level,
                doctor_level,
                1 if agreement else 0,
                reason,
                doctor_id,
                doctor_role,
                json.dumps(features),
                _now(),
            ),
        )
    return feedback_id


def feedback_rows(limit: int = 5000) -> list[dict[str, Any]]:
    with _LOCK, _connect() as connection:
        rows = connection.execute(
            "SELECT * FROM overrides ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(row) for row in rows]


def prediction_count() -> int:
    with _LOCK, _connect() as connection:
        row = connection.execute("SELECT COUNT(*) AS n FROM predictions").fetchone()
    return int(row["n"]) if row else 0
