"""Optional-dependency detection for the ML stack.

The service always runs. Each flag below tells the analyzers whether they may
use the trained library or must fall back to the deterministic, stdlib-only
implementation. Import-safe: never raises when a library is missing.
"""

from __future__ import annotations

from functools import lru_cache


@lru_cache(maxsize=1)
def numpy():
    try:
        import numpy as _np  # type: ignore

        return _np
    except Exception:  # pragma: no cover - depends on environment
        return None


@lru_cache(maxsize=1)
def sklearn_isolation_forest():
    try:
        from sklearn.ensemble import IsolationForest  # type: ignore

        return IsolationForest
    except Exception:  # pragma: no cover
        return None


@lru_cache(maxsize=1)
def sklearn_logistic_regression():
    try:
        from sklearn.linear_model import LogisticRegression  # type: ignore

        return LogisticRegression
    except Exception:  # pragma: no cover
        return None


@lru_cache(maxsize=1)
def xgboost_classifier():
    try:
        from xgboost import XGBClassifier  # type: ignore

        return XGBClassifier
    except Exception:  # pragma: no cover
        return None


@lru_cache(maxsize=1)
def shap_module():
    try:
        import shap  # type: ignore

        return shap
    except Exception:  # pragma: no cover
        return None


@lru_cache(maxsize=1)
def transformers_pipeline():
    try:
        from transformers import pipeline  # type: ignore

        return pipeline
    except Exception:  # pragma: no cover
        return None


@lru_cache(maxsize=1)
def joblib_module():
    try:
        import joblib  # type: ignore

        return joblib
    except Exception:  # pragma: no cover
        return None


def ml_available() -> bool:
    """True when at least numpy + scikit-learn are importable."""
    return numpy() is not None and sklearn_isolation_forest() is not None


def capabilities() -> dict[str, bool]:
    return {
        "numpy": numpy() is not None,
        "scikit_learn": sklearn_isolation_forest() is not None,
        "xgboost": xgboost_classifier() is not None,
        "shap": shap_module() is not None,
        "transformers": transformers_pipeline() is not None,
        "joblib": joblib_module() is not None,
    }
