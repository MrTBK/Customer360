"""
Integration tests for FastAPI REST endpoints.
"""
from fastapi.testclient import TestClient
from backend.api.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["HEALTHY", "DEGRADED"]

def test_customers_pagination():
    response = client.get("/api/customers?page=1&limit=10")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) <= 10
    assert "total" in data

def test_segments_endpoint():
    response = client.get("/api/segments")
    assert response.status_code == 200
    data = response.json()
    assert "ml_clusters" in data
    assert "rfm_segments" in data

def test_quality_endpoint():
    response = client.get("/api/quality")
    assert response.status_code == 200
    data = response.json()
    assert "system_quality_score" in data
    assert "results" in data

def test_nonexistent_customer_returns_404():
    response = client.get("/api/customers/nonexistent_customer_id_9999999")
    assert response.status_code == 404
