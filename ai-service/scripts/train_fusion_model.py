"""Train the fusion weights (STEP 3).

    python -m scripts.train_fusion_model

Fits fusion weights from `data/fusion_training.csv` (least squares with numpy, or
a correlation estimate without it) and writes `models/fusion_weights.json`.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.fusion import COMPONENT_KEYS, FusionEngine, _normalise_weights  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def main() -> None:
    path = DATA_DIR / "fusion_training.csv"
    if not path.exists():
        raise SystemExit(
            "fusion_training.csv not found. Run: python -m scripts.generate_sample_data"
        )
    features: list[list[float]] = []
    labels: list[float] = []
    columns: list[str] = []
    with open(path, encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        columns = [c for c in (reader.fieldnames or []) if c in COMPONENT_KEYS]
        for row in reader:
            features.append([float(row[c]) for c in columns])
            labels.append(float(row["severity"]))

    weights = FusionEngine._least_squares(features, labels, columns)  # noqa: SLF001
    method = "least-squares"
    if weights is None:
        weights = FusionEngine._correlation_estimate(features, labels, columns)  # noqa: SLF001
        method = "correlation"
    weights = _normalise_weights(weights)

    out = settings.models_dir / "fusion_weights.json"
    with open(out, "w", encoding="utf-8") as handle:
        json.dump({"weights": weights, "method": method, "rows": len(features)}, handle, indent=2)
    print(f"[train] fusion weights ({method}) -> {out}")
    for key, value in weights.items():
        print(f"        {key:<10} {value:.4f}")


if __name__ == "__main__":
    main()
