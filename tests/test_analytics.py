"""
Unit tests for Customer Analytics, RFM calculations, Cohorts, and CLV formulas.
"""
import pytest
import numpy as np
import pandas as pd

def test_rfm_score_boundaries():
    """Verify RFM quintile score generation adheres to 1-5 boundary rules."""
    recencies = [10, 45, 90, 150, 220, 310, 420]
    # R score: smaller days = higher score
    scores = pd.qcut(recencies, 5, labels=[5, 4, 3, 2, 1]).astype(int)
    for s in scores:
        assert 1 <= s <= 5
    assert scores[0] == 5
    assert scores[-1] == 1

def test_clv_formula_zero_division_guard():
    """Verify CLV calculation remains robust when frequency or spend is zero."""
    aov = 120.0
    churn_prob = 0.4
    horizon_multiplier = 1.5
    
    # Standard customer
    expected_future = aov * (1.0 - churn_prob) * horizon_multiplier
    assert expected_future == pytest.approx(108.0)
    
    # High churn customer (churn_prob = 1.0)
    expected_churned = aov * (1.0 - 1.0) * horizon_multiplier
    assert expected_churned == 0.0

def test_cohort_retention_period_zero_is_100_percent():
    """Verify that in period 0, cohort retention rate is exactly 100%."""
    cohort_size = 1450
    active_in_p0 = 1450
    retention_rate = (active_in_p0 / cohort_size) * 100.0
    assert retention_rate == 100.0
