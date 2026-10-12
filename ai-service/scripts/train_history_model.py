"""Train the history risk model (STEP 7).

    python -m scripts.train_history_model

Prefers XGBoost; falls back to scikit-learn LogisticRegression; if neither is
installed it still writes the logistic fallback coefficients so the service keeps
working. The trained artifact is saved to `models/history_risk.joblib`.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.analyzers.history_analyzer import FEATURE_NAMES  # noqa: E402
from app.config import settings  # noqa: E402
from app.model_store import save_model  # noqa: E402
from scripts.generate_sample_data import write_fallback_coefficients  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def load_rows() -> tuple[list[list[float]], list[int]]:
    path = DATA_DIR / "history_training.csv"
    if not path.exists():
        raise SystemExit(
            "history_training.csv not found. Run: python -m scripts.generate_sample_data"
        )
    features: list[list[float]] = []
    labels: list[int] = []
    with open(path, encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            features.append([float(row[name]) for name in FEATURE_NAMES])
            labels.append(int(float(row["label"])))
    return features, labels


def main() -> None:
    features, labels = load_rows()
    print(f"[train] loaded {len(features)} rows from history_training.csv")
    try:
        import numpy as np
    except ImportError:
        print("[train] numpy not installed — writing fallback coefficients only.")
        write_fallback_coefficients()
        return

    X = np.array(features, dtype=float)
    y = np.array(labels, dtype=int)

    bundle: dict = {"feature_names": FEATURE_NAMES, "kind": "fallback"}
    try:
        from xgboost import XGBClassifier

        model = XGBClassifier(
            n_estimators=200, max_depth=4, learning_rate=0.08, eval_metric="logloss"
        )
        model.fit(X, y)
        bundle.update({"model": model, "kind": "xgboost"})
        print("[train] trained XGBoost model")
    except ImportError:
        from sklearn.linear_model import LogisticRegression

        model = LogisticRegression(max_iter=1000)
        model.fit(X, y)
        bundle.update({
            "model": model,
            "kind": "sklearn-logistic",
            "coefficients": {name: float(c) for name, c in zip(FEATURE_NAMES, model.coef_[0])},
            "intercept": float(model.intercept_[0]),
        })
        print("[train] trained scikit-learn LogisticRegression")

    path = save_model("history_risk.joblib", bundle)
    print(f"[train] saved model -> {path} (kind={bundle['kind']})")
    write_fallback_coefficients()


if __name__ == "__main__":
    main()
