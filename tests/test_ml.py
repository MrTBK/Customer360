"""
Unit tests for Machine Learning pipelines, clustering, and churn probability bounds.
"""
import pytest
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

def test_feature_scaling_preserves_mean_and_unit_variance():
    """Verify that feature scaling results in zero mean and unit variance."""
    X = np.array([
        [10.0, 1.0, 50.0],
        [20.0, 2.0, 150.0],
        [30.0, 3.0, 300.0],
        [40.0, 4.0, 500.0],
    ])
    scaler = StandardScaler()
    X_s = scaler.fit_transform(X)
    assert np.allclose(X_s.mean(axis=0), 0.0, atol=1e-7)
    assert np.allclose(X_s.std(axis=0), 1.0, atol=1e-7)

def test_churn_probabilities_strictly_bounded():
    """Verify that churn probabilities are strictly within [0.0, 1.0]."""
    X_train = np.array([[10, 1], [150, 1], [300, 1], [20, 3], [400, 1]])
    y_train = np.array([0, 0, 1, 0, 1])
    
    clf = LogisticRegression()
    clf.fit(X_train, y_train)
    
    X_test = np.array([[5, 2], [500, 1], [120, 2]])
    probas = clf.predict_proba(X_test)[:, 1]
    
    for p in probas:
        assert 0.0 <= p <= 1.0
