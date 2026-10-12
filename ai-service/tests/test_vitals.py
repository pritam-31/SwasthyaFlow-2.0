from app.analyzers.vitals_analyzer import VitalsAnalyzer

analyzer = VitalsAnalyzer()


def test_critical_vitals_score_high():
    result = analyzer.analyze(
        {
            "bp_systolic": 180,
            "bp_diastolic": 110,
            "heart_rate": 120,
            "spo2": 88,
            "temperature": 38.5,
            "respiratory_rate": 26,
        }
    )
    assert result.available
    assert result.score >= 50
    assert result.news2_total >= 7
    assert any(flag.startswith("CRITICAL") for flag in result.red_flags)


def test_normal_vitals_score_low():
    result = analyzer.analyze(
        {
            "bp_systolic": 118,
            "bp_diastolic": 76,
            "heart_rate": 72,
            "spo2": 99,
            "temperature": 36.8,
            "respiratory_rate": 15,
        }
    )
    assert result.score < 30
    assert result.news2_total == 0


def test_qsofa_flags_sepsis_screen():
    result = analyzer.analyze({"bp_systolic": 95, "respiratory_rate": 24})
    assert result.qsofa_total == 2
    assert any("qSOFA" in flag for flag in result.red_flags)


def test_empty_vitals_not_available():
    result = analyzer.analyze({})
    assert not result.available
    assert result.score == 0.0
