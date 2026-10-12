"""Generate deterministic sample training data + fallback coefficients.

Run from the ai-service root:

    python -m scripts.generate_sample_data

Writes:
    data/history_training.csv                 (XGBoost training set)
    data/fusion_training.csv                  (fusion weight training set)
    data/history_fallback_coefficients.json   (pure-python logistic fallback)

The data-generating process below is the single source of truth shared by
training and the runtime fallback, so they never drift apart.
"""

from __future__ import annotations

import csv
import json
import math
import random
import sys
from pathlib import Path

# Allow running as a plain script (`python scripts/generate_sample_data.py`).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.analyzers.history_analyzer import FEATURE_NAMES  # noqa: E402
from app.config import DEFAULT_FUSION_WEIGHTS  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# History risk label process (logistic).
HISTORY_INTERCEPT = -3.1
HISTORY_COEFFICIENTS = {
    "age": 0.055,
    "male": 0.25,
    "female": -0.1,
    "diabetes": 0.55,
    "hypertension": 0.4,
    "smoker": 0.6,
    "kidney_disease": 0.8,
    "heart_disease": 0.9,
    "lung_disease": 0.6,
    "cancer": 1.0,
    "obesity": 0.35,
    "past_admissions": 0.28,
    "days_since_visit_norm": -0.6,
    "polypharmacy": 0.45,
}


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def generate_history(rows: int = 4000, seed: int = 42) -> None:
    rng = random.Random(seed)
    path = DATA_DIR / "history_training.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[*FEATURE_NAMES, "label"])
        writer.writeheader()
        for _ in range(rows):
            age = max(1, min(100, int(rng.gauss(52, 18))))
            gender = rng.choice(["male", "female", "male", "female", "other"])
            record = {
                "age": age,
                "male": 1 if gender == "male" else 0,
                "female": 1 if gender == "female" else 0,
                "diabetes": int(rng.random() < 0.22),
                "hypertension": int(rng.random() < 0.30),
                "smoker": int(rng.random() < 0.25),
                "kidney_disease": int(rng.random() < 0.10),
                "heart_disease": int(rng.random() < 0.14),
                "lung_disease": int(rng.random() < 0.12),
                "cancer": int(rng.random() < 0.04),
                "obesity": int(rng.random() < 0.20),
                "past_admissions": rng.choice([0, 0, 0, 1, 1, 2, 3, 4]),
                "days_since_visit_norm": round(min(rng.expovariate(1 / 180.0), 365) / 365.0, 3),
                "polypharmacy": int(rng.random() < 0.28),
            }
            linear = HISTORY_INTERCEPT + sum(
                HISTORY_COEFFICIENTS[name] * record[name] for name in FEATURE_NAMES
            )
            probability = sigmoid(linear)
            record["label"] = 1 if rng.random() < probability else 0
            writer.writerow(record)
    print(f"[generate] wrote {rows} history rows -> {path}")


def generate_fusion(rows: int = 3000, seed: int = 7) -> None:
    rng = random.Random(seed)
    path = DATA_DIR / "fusion_training.csv"
    weights = DEFAULT_FUSION_WEIGHTS
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[*weights.keys(), "severity"])
        writer.writeheader()
        for _ in range(rows):
            components = {
                "vitals": rng.uniform(0, 100),
                "symptoms": rng.uniform(0, 100),
                "labs": rng.uniform(0, 100),
                "history": rng.uniform(0, 100),
                "images": rng.choice([0.0, rng.uniform(0, 100)]),
            }
            severity = sum(weights[key] * value for key, value in components.items())
            severity += rng.gauss(0, 4)  # observation noise
            row = {key: round(value, 2) for key, value in components.items()}
            row["severity"] = round(min(max(severity, 0), 100), 2)
            writer.writerow(row)
    print(f"[generate] wrote {rows} fusion rows -> {path}")


def write_fallback_coefficients() -> None:
    path = DATA_DIR / "history_fallback_coefficients.json"
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(
            {"intercept": HISTORY_INTERCEPT, "coefficients": HISTORY_COEFFICIENTS},
            handle,
            indent=2,
        )
    print(f"[generate] wrote fallback coefficients -> {path}")


def main() -> None:
    generate_history()
    generate_fusion()
    write_fallback_coefficients()


if __name__ == "__main__":
    main()
