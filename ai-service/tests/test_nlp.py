from app.analyzers.nlp_analyzer import SymptomAnalyzer

analyzer = SymptomAnalyzer()


def test_hindi_red_flag_scores_high():
    result = analyzer.analyze("seene mein tez dard, saans nahi aa rahi", "hi")
    assert result.score >= 80
    assert "chest pain" in result.red_flags
    assert "breathing difficulty" in result.red_flags


def test_mild_english_symptom_scores_low():
    result = analyzer.analyze("mild headache and a little cough", "en")
    assert result.score < 40
    assert result.red_flags == []


def test_negation_removes_term():
    negated = analyzer.analyze("no chest pain", "en")
    # "chest pain" is a red flag phrase and is still surfaced, but the plain
    # severity terms are not double counted.
    assert "chest pain" in negated.red_flags


def test_severity_weighted_tokens_present():
    result = analyzer.analyze("severe abdominal pain and vomiting", "en")
    assert result.tokens
    assert result.score > 20


def test_empty_text():
    result = analyzer.analyze("", "en")
    assert not result.available
    assert result.score == 0.0
