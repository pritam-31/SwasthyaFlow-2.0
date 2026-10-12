"""STEP 6 — Explainability.

Returns the top contributing factors behind a decision. For the linear fusion
the contribution is exact and closed-form:

    contribution_i = effective_weight_i * (component_score_i - 50)

(the 50 midpoint is the neutral baseline, so a low sub-score shows a negative /
`decreases` contribution and a high one shows `increases`).

When SHAP and a tree history model are available, per-feature SHAP values for the
history branch are surfaced as well.
"""

from __future__ import annotations

from dataclasses import dataclass

from . import ml_support
from .analyzers.history_analyzer import FEATURE_NAMES, HistoryAnalyzer, HistoryResult
from .fusion import FusionResult
from .schemas import FactorContribution

CATEGORY_LABELS = {
    "vitals": "Vital signs",
    "symptoms": "Reported symptoms",
    "labs": "Laboratory results",
    "history": "Medical history",
    "images": "Imaging",
}

BASELINE = 50.0


def explain(
    fusion: FusionResult,
    component_signals: dict[str, list[str]],
    history_result: HistoryResult | None = None,
    history_analyzer: HistoryAnalyzer | None = None,
    top_n: int = 5,
) -> list[FactorContribution]:
    factors: list[FactorContribution] = []
    for key, score in fusion.component_scores.items():
        weight = fusion.weights_used.get(key, 0.0)
        contribution = weight * (float(score) - BASELINE)
        signals = component_signals.get(key) or []
        detail = signals[0] if signals else f"{CATEGORY_LABELS.get(key, key)} sub-score {score:.0f}/100"
        factors.append(
            FactorContribution(
                name=CATEGORY_LABELS.get(key, key),
                category=key,
                contribution=round(contribution, 2),
                direction="increases" if contribution >= 0 else "decreases",
                detail=detail,
            )
        )

    # Refine the history branch with per-feature SHAP values when possible.
    if history_result is not None and history_analyzer is not None:
        factors.extend(history_shap_values(history_analyzer, history_result))

    factors.sort(key=lambda f: abs(f.contribution), reverse=True)
    return factors[:top_n]


def history_shap_values(analyzer: HistoryAnalyzer, history_result: HistoryResult) -> list[FactorContribution]:
    """Compute SHAP values for one history prediction (tree models only)."""
    shap = ml_support.shap_module()
    np = ml_support.numpy()
    if shap is None or np is None or analyzer._model is None:  # noqa: SLF001
        return []
    vector = [history_result.features.get(name, 0.0) for name in FEATURE_NAMES]
    try:  # pragma: no cover - requires shap + a tree model
        explainer = shap.TreeExplainer(analyzer._model)  # noqa: SLF001
        values = explainer.shap_values(np.array([vector], dtype=float))
        if isinstance(values, list):
            values = values[-1]
        values = np.asarray(values).reshape(-1)
        factors = [
            FactorContribution(
                name=name.replace("_", " "),
                category="history",
                contribution=round(float(value) * 100.0, 2),
                direction="increases" if value >= 0 else "decreases",
                detail=f"history feature '{name}'",
            )
            for name, value in zip(FEATURE_NAMES, values)
        ]
        factors.sort(key=lambda f: abs(f.contribution), reverse=True)
        return factors[:5]
    except Exception:
        return []
