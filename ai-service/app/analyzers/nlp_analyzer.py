"""Symptom NLP analyzer.

Primary path: a multilingual HuggingFace model (BioBERT-style / DistilBERT
multilingual / mDeBERTa NLI) used as a zero-shot severity classifier. The model
name is configurable (`AI_NLP_MODEL`) and loaded lazily.

Fallback path: a deterministic bilingual severity lexicon (English + Hindi,
including romanised Hinglish) with negation, intensifier and red-flag handling.
The fallback exists so a missing/large model download never blocks triage; it is
recalled explicitly in the response `fallbacks_used` field.

Both paths return a `symptom_severity_score` in 0..100 and the severity-weighted
tokens that produced it.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from .. import ml_support
from ..config import settings

# ---------------------------------------------------------------------------
# Severity lexicon. weight: 1 = mild, 2 = moderate, 3 = severe.
# English, Devanagari Hindi, and romanised Hinglish are all covered because real
# intake text frequently mixes scripts.
# ---------------------------------------------------------------------------
SEVERITY_TERMS: dict[str, int] = {
    # --- pain -------------------------------------------------------------
    "pain": 1, "ache": 1, "discomfort": 1, "sore": 1, "dard": 1, "दर्द": 1,
    "severe pain": 3, "unbearable": 3, "excruciating": 3, "crushing": 3,
    "tez dard": 3, "तेज़ दर्द": 3, "गंभीर दर्द": 3, "asahya": 3,
    "throbbing": 2, "burning pain": 2, "जलन": 2, "jalan": 2,
    # --- breathing --------------------------------------------------------
    "cough": 1, "khansi": 1, "खांसी": 1, "sore throat": 1, "गले में खराश": 1, "gale me kharash": 1,
    "cold": 1, "sardi": 1, "ज़ुकाम": 1, "zukam": 1,
    "wheezing": 2, "gharghar": 2, "घरघर": 2, "phlegm": 2, "balgam": 2, "बलगम": 2,
    "shortness of breath": 3, "breathless": 3, "saans phulna": 3, "सांस फूलना": 3,
    "difficulty breathing": 3, "saans lene me dikkat": 3, "सांस लेने में कठिनाई": 3,
    # --- fever / infection ------------------------------------------------
    "fever": 1, "bukhar": 1, "बुखार": 1, "high fever": 2, "tez bukhar": 2, "तेज़ बुखार": 2,
    "chills": 1, "thand lagna": 1, "ठंड लगना": 1, "shivering": 2, "kabza": 1,
    "vomiting": 2, "ulti": 2, "उल्टी": 2, "nausea": 1, "ji michalna": 1, "जी मिचलाना": 1,
    "diarrhea": 2, "loose motion": 2, "dast": 2, "दस्त": 2, "dehydration": 2,
    # --- neuro ------------------------------------------------------------
    "headache": 1, "sir dard": 1, "सिर दर्द": 1, "migraine": 2, "chakkar": 2, "dizzy": 2,
    "चक्कर": 2, "confusion": 3, "behosh": 3, "बेहोश": 3, "fainting": 3,
    "seizure": 3, "fits": 3, "मिर्गी": 3, "slurred speech": 3, "weakness one side": 3,
    # --- cardiac / red-flag adjacent -------------------------------------
    "palpitations": 2, "dhak dhak": 2, "धड़कन": 2, "chest tightness": 3, "seene me jhanjhanahat": 3,
    "sweating": 1, "pasina": 1, "पसीना": 1,
    # --- other ------------------------------------------------------------
    "swelling": 1, "sujan": 1, "सूजन": 1, "rash": 1, "दाने": 1, "itching": 1, "khujli": 1, "खुजली": 1,
    "bleeding": 3, "khoon": 3, "खून": 3, "unable to pass urine": 3, "peshab nahi": 3,
    "severe abdominal pain": 3, "pet dard": 2, "पेट दर्द": 2,
}

# Red flags guarantee a high floor regardless of other terms. Matched as whole
# phrases (before negation handling) because several are self-negating
# ("saans nahi aa rahi" = cannot breathe).
RED_FLAG_PHRASES: list[tuple[str, str]] = [
    ("chest pain", "chest pain"),
    ("seene me", "chest pain"),
    ("सीने में", "chest pain"),
    ("seene mein", "chest pain"),
    ("heart attack", "possible cardiac event"),
    ("dil ka daura", "possible cardiac event"),
    ("saans nahi", "breathing difficulty"),
    ("सांस नहीं", "breathing difficulty"),
    ("cannot breathe", "breathing difficulty"),
    ("can't breathe", "breathing difficulty"),
    ("unconscious", "loss of consciousness"),
    ("behosh", "loss of consciousness"),
    ("बेहोश", "loss of consciousness"),
    ("stroke", "possible stroke"),
    ("paralysis", "possible stroke"),
    ("lakwa", "possible stroke"),
    ("लकवा", "possible stroke"),
    ("severe bleeding", "haemorrhage"),
    ("heavy bleeding", "haemorrhage"),
    ("blood vomit", "haematemesis"),
    ("khoon ki ulti", "haematemesis"),
    ("suicidal", "self-harm risk"),
    ("aatmhatya", "self-harm risk"),
    ("आत्महत्या", "self-harm risk"),
]

INTENSIFIERS = {
    "severe", "extreme", "unbearable", "crushing", "worst", "very", "tez", "teez",
    "bahut", "बहुत", "गंभीर", "तेज़", "अत्यधिक", "asahya",
}
INTENSIFIER_MULTIPLIER = 1.6

NEGATIONS = {"no", "not", "without", "denies", "nahi", "nahin", "बिना", "नहीं", "बिल्कुल नहीं"}
NEGATION_WINDOW = 4  # tokens

_WORD_RE = re.compile(r"[\w\u0900-\u097F]+", re.UNICODE)


@dataclass
class SymptomResult:
    score: float
    tokens: list[str] = field(default_factory=list)
    red_flags: list[str] = field(default_factory=list)
    matched_terms: list[tuple[str, int]] = field(default_factory=list)
    language: str = "en"
    available: bool = True
    method: str = "lexicon"


class SymptomAnalyzer:
    def __init__(self) -> None:
        self._pipeline = None
        self._model_loaded = False
        self._model_failed = False

    # -- model loading -----------------------------------------------------

    def _ensure_model(self) -> None:
        if self._model_loaded or self._model_failed:
            return
        pipeline = ml_support.transformers_pipeline()
        if pipeline is None:
            self._model_failed = True
            return
        try:  # pragma: no cover - requires the heavy ML stack + network
            self._pipeline = pipeline(
                "zero-shot-classification",
                model=settings.nlp_model,
                device=-1 if settings.nlp_device == "cpu" else 0,
            )
            self._model_loaded = True
        except Exception:
            self._pipeline = None
            self._model_failed = True

    # -- inference ---------------------------------------------------------

    def analyze(self, text: str, language: str = "en") -> SymptomResult:
        text = (text or "").strip()
        if not text:
            return SymptomResult(score=0.0, language=language, available=False,
                                 tokens=[], method="empty")

        red_flags, red_matches = self._match_red_flags(text)

        self._ensure_model()
        if self._pipeline is not None:
            try:  # pragma: no cover - heavy path
                return self._analyze_model(text, language, red_flags)
            except Exception:
                pass

        return self._analyze_lexicon(text, language, red_flags)

    # -- zero-shot model path ---------------------------------------------

    def _analyze_model(self, text: str, language: str, red_flags: list[str]) -> SymptomResult:
        labels = [
            "mild and stable condition",
            "moderate condition needing attention",
            "severe condition needing urgent care",
            "life-threatening emergency",
        ]
        weights = [0.1, 0.4, 0.75, 1.0]
        out = self._pipeline(  # type: ignore[misc]
            text[: settings.nlp_max_length * 4],
            candidate_labels=labels,
            hypothesis_template="This patient's symptoms indicate a {}.",
            truncation=True,
            max_length=settings.nlp_max_length,
        )
        prob_by_label = dict(zip(out["labels"], out["scores"]))
        base = sum(prob_by_label.get(label, 0.0) * weight for label, weight in zip(labels, weights))
        score = round(min(1.0, base) * 100.0, 1)
        if red_flags:
            score = max(score, 80.0)
        # Token view from the lexicon so the response still carries matched terms.
        lexicon = self._analyze_lexicon(text, language, red_flags)
        return SymptomResult(
            score=score,
            tokens=lexicon.tokens,
            red_flags=red_flags,
            matched_terms=lexicon.matched_terms,
            language=language,
            available=True,
            method="transformer",
        )

    # -- deterministic lexicon path ---------------------------------------

    def _match_red_flags(self, text: str) -> tuple[list[str], list[str]]:
        low = text.lower()
        flags: list[str] = []
        matched: list[str] = []
        for phrase, label in RED_FLAG_PHRASES:
            if phrase in low:
                if label not in flags:
                    flags.append(label)
                matched.append(phrase)
        return flags, matched

    def _analyze_lexicon(self, text: str, language: str, red_flags: list[str]) -> SymptomResult:
        low = text.lower()
        tokens = _WORD_RE.findall(low)
        negated: set[int] = set()
        for i, tok in enumerate(tokens):
            if tok in NEGATIONS:
                for j in range(i + 1, min(i + 1 + NEGATION_WINDOW, len(tokens))):
                    negated.add(j)

        matched: list[tuple[str, int]] = []
        weighted_sum = 0.0
        consumed_spans: list[tuple[int, int]] = []

        # Longest phrases first so "severe pain" beats "pain".
        for term in sorted(SEVERITY_TERMS, key=len, reverse=True):
            pattern = r"(?<!\w)" + re.escape(term) + r"(?!\w)"
            for match in re.finditer(pattern, low):
                start, end = match.span()
                if any(start < e and end > s for s, e in consumed_spans):
                    continue
                # Negation check for words only (not multi-word red-flag style).
                if term.isascii():
                    idx = low[:start].count(" ") + 1 if start else 0
                    if self._token_negated(low, start, tokens, negated):
                        continue
                weight = SEVERITY_TERMS[term]
                multiplier = INTENSIFIER_MULTIPLIER if self._near_intensifier(low, start) else 1.0
                weighted_sum += weight * multiplier
                consumed_spans.append((start, end))
                matched.append((term, weight))

        # Smooth normalisation: weighted 0 -> 0, ~6 -> ~63, ~12 -> ~86, cap 100.
        base_score = (1.0 - math.exp(-weighted_sum / 6.0)) * 100.0 if weighted_sum else 0.0

        # Red-flag floor (a single red flag = at least URGENT territory).
        if red_flags:
            base_score = max(base_score, 80.0)

        score = round(min(base_score, 100.0), 1)
        return SymptomResult(
            score=score,
            tokens=[term for term, _ in matched],
            red_flags=red_flags,
            matched_terms=matched,
            language=language,
            available=True,
            method="lexicon",
        )

    @staticmethod
    def _near_intensifier(low: str, start: int) -> bool:
        window = low[max(0, start - 25):start]
        return any(word in window for word in INTENSIFIERS)

    @staticmethod
    def _token_negated(low: str, start: int, tokens: list[str], negated: set[int]) -> bool:
        # Index of the token beginning at `start`.
        prefix = low[:start]
        token_index = len(_WORD_RE.findall(prefix))
        return token_index in negated
