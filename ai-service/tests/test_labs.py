from app.analyzers.lab_analyzer import LabAnalyzer

analyzer = LabAnalyzer()


def test_critical_troponin_and_platelets():
    result = analyzer.analyze({"troponin": 0.9, "platelets": 40000, "creatinine": 1.8})
    assert result.available
    assert result.score >= 80
    assert len(result.red_flags) >= 2


def test_normal_labs_score_zero():
    result = analyzer.analyze({"hemoglobin": 14.0, "wbc": 7000, "platelets": 250000})
    assert result.score == 0.0
    assert result.red_flags == []


def test_sex_specific_hemoglobin():
    male = analyzer.analyze({"hemoglobin": 12.5}, gender="male")
    female = analyzer.analyze({"hemoglobin": 12.5}, gender="female")
    assert any(f.flag == "low" for f in male.findings)
    assert all(f.flag == "normal" for f in female.findings)


def test_alias_resolution():
    result = analyzer.analyze({"Hb": 8.0})
    assert any(f.key == "hemoglobin" for f in result.findings)


def test_empty_labs_not_available():
    result = analyzer.analyze({})
    assert not result.available
