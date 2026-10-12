"""Image analyzer (ECG / X-ray) — optional CNN hook.

This is a deliberately conservative stub. Out of the box it returns
`available=False` so images never influence the score. To enable it, drop a
callable artifact at `models/image_classifier.joblib` exposing
`predict(image_bytes) -> dict[str, float]` (disease -> probability) and set
`AI_IMAGE_FETCH=true`.

Privacy: by default the analyzer does NOT fetch external image URLs (that would
send patient data to a third party). Fetching must be explicitly enabled and is
done server-side against the configured URL.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from .. import model_store


@dataclass
class ImageResult:
    score: float
    findings: list[str] = field(default_factory=list)
    available: bool = False
    method: str = "disabled"


class ImageAnalyzer:
    def __init__(self) -> None:
        self._classifier = None
        self._fetch_enabled = os.getenv("AI_IMAGE_FETCH", "false").strip().lower() in {"1", "true", "yes"}
        try:
            bundle = model_store.load_model("image_classifier.joblib")
            if callable(bundle):
                self._classifier = bundle
            elif isinstance(bundle, dict) and callable(bundle.get("predict")):
                self._classifier = bundle["predict"]
        except Exception:  # pragma: no cover
            self._classifier = None

    def analyze(self, ecg_url: str | None, xray_url: str | None) -> ImageResult:
        url = ecg_url or xray_url
        if not url:
            return ImageResult(score=0.0, available=False, method="no-image")
        if self._classifier is None:
            return ImageResult(
                score=0.0,
                findings=["Image provided but no image model is configured; ignored."],
                available=False,
                method="no-model",
            )
        if not self._fetch_enabled:
            return ImageResult(
                score=0.0,
                findings=["Image model configured but AI_IMAGE_FETCH is disabled for privacy."],
                available=False,
                method="fetch-disabled",
            )
        try:  # pragma: no cover - requires configured model + network
            import urllib.request

            with urllib.request.urlopen(url, timeout=10) as response:  # noqa: S310
                payload = response.read()
            probabilities = self._classifier(payload)
            if not probabilities:
                return ImageResult(score=0.0, available=False, method="empty")
            positive = max(probabilities.values())
            findings = [f"{name}: {prob:.2f}" for name, prob in probabilities.items() if prob >= 0.5]
            return ImageResult(
                score=round(min(max(positive, 0.0), 1.0) * 100.0, 1),
                findings=findings,
                available=True,
                method="cnn",
            )
        except Exception as exc:  # pragma: no cover
            return ImageResult(score=0.0, findings=[f"Image analysis failed: {exc}"], available=False,
                               method="error")
