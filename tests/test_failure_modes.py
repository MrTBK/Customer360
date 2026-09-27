"""Failure-mode tests: invalid inputs fail loudly, never silently."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.db.connection import q, upsert_sql
from backend.pipeline.orchestrator import run_dbt, translate_category

client = TestClient(app)


def test_translate_category_edge_cases():
    assert translate_category("cama_mesa_banho") == "Bed, Bath & Table"
    assert translate_category(None) == "Uncategorized"
    assert translate_category("") == "Uncategorized"
    assert translate_category("  ") == "Uncategorized"
    assert translate_category("moveis_novos_xyz") == "Moveis Novos Xyz"


def test_placeholder_translation_sqlite(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    import importlib
    import backend.db.connection as conn

    importlib.reload(conn)
    assert conn.q("SELECT * FROM t WHERE a = ?") == "SELECT * FROM t WHERE a = ?"
    assert "OR REPLACE" in conn.upsert_sql("t", ["a"])


def test_placeholder_translation_pg(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h/db")
    import importlib
    import backend.db.connection as conn

    importlib.reload(conn)
    assert conn.q("SELECT * FROM t WHERE a = ?") == "SELECT * FROM t WHERE a = %s"
    assert "ON CONFLICT DO NOTHING" in conn.upsert_sql("t", ["a"])
    monkeypatch.delenv("DATABASE_URL", raising=False)
    importlib.reload(conn)


def test_api_rejects_invalid_sort():
    r = client.get("/api/customers?sort_by=nope")
    assert r.status_code == 422


def test_api_rejects_limit_overflow():
    r = client.get("/api/customers?limit=1000")
    assert r.status_code == 422


def test_api_rejects_page_zero():
    r = client.get("/api/customers?page=0")
    assert r.status_code == 422


def test_api_unknown_customer_404():
    r = client.get("/api/customers/does-not-exist-123")
    assert r.status_code == 404


def test_run_dbt_failure_raises(monkeypatch):
    import subprocess

    class Boom:
        returncode = 1
        stdout = "dbt exploded"
        stderr = "boom"

    monkeypatch.setattr(subprocess, "run", lambda *a, **k: Boom())
    try:
        run_dbt(["build"])
    except RuntimeError as e:
        assert "dbt build failed" in str(e)
    else:
        raise AssertionError("run_dbt must raise on dbt failure")


def test_q_and_upsert_imports():
    assert callable(q) and callable(upsert_sql)


def test_health_degraded_when_db_down(monkeypatch):
    from fastapi.testclient import TestClient as TC
    import backend.api.main as main

    def boom(*a, **k):
        raise ConnectionError("db gone")

    monkeypatch.setattr(main.db, "query_one", boom)
    c = TC(main.app)
    r = c.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "DEGRADED"


def test_dbt_failure_blocks_downstream(monkeypatch):
    import backend.pipeline.orchestrator as orch

    def boom(args):
        raise RuntimeError("dbt build failed:\nboom")

    monkeypatch.setattr(orch, "run_dbt", boom)
    monkeypatch.setattr("backend.db.connection.is_pg", lambda: True)
    o = orch.PipelineOrchestrator(run_id="test-failure-propagation")
    try:
        o.task_dbt_staging()
    except RuntimeError as e:
        assert "dbt build failed" in str(e)
    else:
        raise AssertionError("dbt failure must propagate, not continue")
