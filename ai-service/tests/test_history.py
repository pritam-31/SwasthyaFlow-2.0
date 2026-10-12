from app.analyzers.history_analyzer import FEATURE_NAMES, HistoryAnalyzer

analyzer = HistoryAnalyzer()


def test_high_risk_history_scores_higher_than_low():
    high = analyzer.analyze(70, "male", ["diabetes", "hypertension", "smoker", "heart disease"],
                            ["metformin", "amlodipine", "atorvastatin", "aspirin", "insulin"], 3, 400)
    low = analyzer.analyze(25, "female", [], [], 0, 10)
    assert high.score > low.score
    assert high.score > 50


def test_feature_vector_shape():
    result = analyzer.analyze(40, "male", ["diabetes"], [], 1, 30)
    assert set(result.features.keys()) == set(FEATURE_NAMES)


def test_comorbidity_alias_matching():
    result = analyzer.analyze(55, "male", ["DM", "high BP"], [], 0, 20)
    assert result.features["diabetes"] == 1
    assert result.features["hypertension"] == 1


def test_polypharmacy_flag():
    result = analyzer.analyze(60, "male", [], ["a", "b", "c", "d", "e"], 0, 20)
    assert result.features["polypharmacy"] == 1
