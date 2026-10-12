"""History risk analyzer.

Predicts a 0..100 risk score from age, sex, comorbidities, admission history and
medication burden.

Model selection (first available wins):
  1. A trained artifact in `models/` (XGBoost JSON or a joblib bundle).
  2. A model fitted at startup from `data/history_training.csv`.
  3. A deterministic logistic fallback whose coefficients are read from
     `data/history_fallback_coefficients.json` (written by the sample-data
     generator). If even that is absent, a documented constant is used and the
     call is flagged as a fallback.

The feature vector and label definition live in
`scripts/generate_sample_data.py` so training and inference never drift apart.
"""

from __future__ import annotations

import csv
import math
from dataclasses import dataclass, field

from .. import ml_support, model_store

# Fixed feature order shared with the training scripts.
FEATURE_NAMES = [
    "age",
    "male",
    "female",
    "diabetes",
    "hypertension",
    "smoker",
    "kidney_disease",
    "heart_disease",
    "lung_disease",
    "cancer",
    "obesity",
    "past_admissions",
    "days_since_visit_norm",
    "polypharmacy",
]

# Free-text history alias -> canonical feature.
COMORBIDITY_ALIASES: dict[str, str] = {
    "diabetes": "diabetes", "dm": "diabetes", "diabetic": "diabetes", "sugar": "diabetes", "मधुमेह": "diabetes",
    "hypertension": "hypertension", "htn": "hypertension", "high bp": "hypertension", "blood pressure": "hypertension",
    "smoker": "smoker", "smoking": "smoker", "tobacco": "smoker", "धूम्रपान": "smoker",
    "ckd": "kidney_disease", "kidney": "kidney_disease", "renal": "kidney_disease", "dialysis": "kidney_disease",
    "cad": "heart_disease", "heart": "heart_disease", "cardiac": "heart_disease", "mi": "heart_disease",
    "stroke": "heart_disease", "hf": "heart_disease", "हृदय": "heart_disease",
    "copd": "lung_disease", "asthma": "lung_disease", "tb": "lung_disease", "lung": "lung_disease",
    "cancer": "cancer", "carcinoma": "cancer", "malignancy": "cancer", "कैंसर": "cancer",
    "obesity": "obesity", "obese": "obesity", "bmi high": "obesity",
}

POLYPHARMACY_AT = 5  # >= this many medications counts as polypharmacy.

# Last-resort fallback coefficients (logistic, on standardised-ish features).
# These mirror the data-generating process in scripts/generate_sample_data.py.
_FALLBACK_INTERCEPT = -3.1
_FALLBACK_COEFFICIENTS: dict[str, float] = {
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


@dataclass
class HistoryResult:
    score: float
    risk_probability: float
    features: dict[str, float] = field(default_factory=dict)
    signals: list[str] = field(default_factory=list)
    available: bool = True
    method: str = "logistic-fallback"


class HistoryAnalyzer:
    def __init__(self) -> None:
        self._model = None
        self._kind = "logistic-fallback"
        self._coefficients: dict[str, float] = dict(_FALLBACK_COEFFICIENTS)
        self._intercept = _FALLBACK_INTERCEPT
        self._load()

    # -- model selection ---------------------------------------------------

    def _load(self) -> None:
        # 1. joblib bundle
        bundle = model_store.load_model("history_risk.joblib")
        if isinstance(bundle, dict) and "model" in bundle:
            self._model = bundle["model"]
            self._kind = bundle.get("kind", "joblib")
            self._coefficients = bundle.get("coefficients", self._coefficients)
            self._intercept = bundle.get("intercept", self._intercept)
            return

        # 2. fit from the bundled training CSV
        if self._fit_from_csv():
            return

        # 3. coefficients-only fallback
        coeffs = model_store.read_json("history_fallback_coefficients.json")
        if isinstance(coeffs, dict):
            self._coefficients = {**self._coefficients, **coeffs.get("coefficients", {})}
            self._intercept = float(coeffs.get("intercept", self._intercept))

    def _training_rows(self) -> tuple[list[list[float]], list[int]]:
        path = model_store.settings.data_dir / "history_training.csv"
        if not path.exists():
            return [], []
        features: list[list[float]] = []
        labels: list[int] = []
        with open(path, encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                try:
                    features.append([float(row[name]) for name in FEATURE_NAMES])
                    labels.append(int(float(row["label"])))
                except (KeyError, ValueError):
                    continue
        return features, labels

    def _fit_from_csv(self) -> bool:
        features, labels = self._training_rows()
        if len(features) < 20 or len(set(labels)) < 2:
            return False
        np = ml_support.numpy()
        if np is None:
            return False
        X = np.array(features, dtype=float)
        y = np.array(labels, dtype=int)

        xgb_cls = ml_support.xgboost_classifier()
        if xgb_cls is not None:
            try:
                model = xgb_cls(n_estimators=120, max_depth=4, learning_rate=0.1, eval_metric="logloss")
                model.fit(X, y)
                self._model = model
                self._kind = "xgboost"
                return True
            except Exception:  # pragma: no cover
                pass

        logreg_cls = ml_support.sklearn_logistic_regression()
        if logreg_cls is not None:
            try:
                model = logreg_cls(max_iter=500)
                model.fit(X, y)
                self._model = model
                self._kind = "sklearn-logistic"
                # Extract coefficients for the pure-python path/explainability.
                self._coefficients = {name: float(c) for name, c in zip(FEATURE_NAMES, model.coef_[0])}
                self._intercept = float(model.intercept_[0])
                return True
            except Exception:  # pragma: no cover
                pass
        return False

    # -- features ----------------------------------------------------------

    def build_features(
        self,
        age: float | None,
        gender: str | None,
        medical_history: list[str],
        medications: list[str],
        past_admissions: int | None,
        last_visit_days_ago: float | None,
    ) -> dict[str, float]:
        history_flags = {"diabetes", "hypertension", "smoker", "kidney_disease",
                         "heart_disease", "lung_disease", "cancer", "obesity"}
        flags = {key: 0.0 for key in history_flags}
        for item in medical_history or []:
            token = str(item).strip().lower()
            mapped = COMORBIDITY_ALIASES.get(token)
            if mapped:
                flags[mapped] = 1.0
            else:
                for alias, feature in COMORBIDITY_ALIASES.items():
                    if alias in token:
                        flags[feature] = 1.0
        med_count = len(medications or [])
        features = {
            "age": float(age) if age is not None else 45.0,
            "male": 1.0 if (gender or "").lower() == "male" else 0.0,
            "female": 1.0 if (gender or "").lower() == "female" else 0.0,
            **flags,
            "past_admissions": float(min(max(past_admissions or 0, 0), 10)),
            "days_since_visit_norm": min(max(last_visit_days_ago or 0, 0), 365) / 365.0,
            "polypharmacy": 1.0 if med_count >= POLYPHARMACY_AT else 0.0,
        }
        return features

    # -- inference ---------------------------------------------------------

    def analyze(
        self,
        age: float | None,
        gender: str | None,
        medical_history: list[str],
        medications: list[str],
        past_admissions: int | None,
        last_visit_days_ago: float | None,
    ) -> HistoryResult:
        features = self.build_features(age, gender, medical_history, medications,
                                       past_admissions, last_visit_days_ago)
        vector = [features[name] for name in FEATURE_NAMES]

        probability, method = self._predict_probability(vector)

        signals: list[str] = []
        for flag in ("diabetes", "hypertension", "smoker", "kidney_disease",
                     "heart_disease", "lung_disease", "cancer", "obesity"):
            if features[flag]:
                signals.append(f"History: {flag.replace('_', ' ')}")
        if features["polypharmacy"]:
            signals.append(f"Polypharmacy ({len(medications or [])} medications)")
        if features["past_admissions"] >= 2:
            signals.append(f"{int(features['past_admissions'])} past admissions")
        score = round(probability * 100.0, 1)

        has_signal = any(features[f] for f in features if f not in {"age", "days_since_visit_norm"})
        return HistoryResult(
            score=score,
            risk_probability=round(probability, 4),
            features=features,
            signals=signals,
            available=has_signal or age is not None,
            method=method,
        )

    def _predict_probability(self, vector: list[float]) -> tuple[float, str]:
        np = ml_support.numpy()
        if self._model is not None and np is not None:
            try:
                matrix = np.array([vector], dtype=float)
                if hasattr(self._model, "predict_proba"):
                    prob = float(self._model.predict_proba(matrix)[0][1])
                    return prob, self._kind
                raw = float(self._model.predict(matrix)[0])
                return 1.0 / (1.0 + math.exp(-raw)), self._kind
            except Exception:  # pragma: no cover
                pass
        # Pure-python logistic fallback.
        linear = self._intercept + sum(
            self._coefficients.get(name, 0.0) * value for name, value in zip(FEATURE_NAMES, vector)
        )
        return 1.0 / (1.0 + math.exp(-linear)), "logistic-fallback"
