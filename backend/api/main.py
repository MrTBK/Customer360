"""
Customer360 Enterprise REST API Service (FastAPI).
Serves analytical marts, ML model inference, data quality results, and pipeline observability.
"""
from datetime import datetime, timezone
import json
import os
from typing import Any, Dict, List, Optional, Tuple
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.db.connection import db
from backend.auth.security import (
    authenticate, create_user, init_auth_schema, issue_token,
    list_audit, parse_token, record_audit,
)

app = FastAPI(
    title="Customer360 Intelligence Platform API",
    description="REST API for dimensional customer intelligence, RFM segmentation, cohort retention, CLV, churn ML, and pipeline observability.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.environ.get("C360_API_KEY", "").strip()
PUBLIC_PATHS = {"/api/health", "/docs", "/openapi.json", "/redoc"}


@app.middleware("http")
async def api_key_gate(request, call_next):
    if API_KEY and request.url.path.startswith("/api/") and request.url.path not in PUBLIC_PATHS:
        if request.headers.get("x-api-key", "") != API_KEY:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key."})
    return await call_next(request)

@app.get("/api/health")
def get_health():
    try:
        conn = db.connect()
        tables_res = db.query_one("SELECT count(*) AS n FROM monitoring.pipeline_runs")
        return {
            "status": "HEALTHY",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database": "CONNECTED",
            "pipeline_runs_recorded": tables_res["n"] if tables_res else 0,
            "version": "1.0.0"
        }
    except Exception as e:
        return {
            "status": "DEGRADED",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "error": str(e)
        }

@app.get("/api/customers")
def get_customers(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    search: Optional[str] = None,
    segment: Optional[str] = None,
    risk_tier: Optional[str] = None,
    sort_by: str = Query("total_spend", pattern="^(total_spend|days_since_last_order|total_orders|churn_probability|estimated_clv)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$")
):
    offset = (page - 1) * limit
    where_clauses = ["1=1"]
    params: List[Any] = []

    if search:
        where_clauses.append("(c.customer_unique_id LIKE ? OR c.preferred_region LIKE ? OR dc.primary_city LIKE ? OR dc.primary_state LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%"])
    if segment:
        where_clauses.append("c.customer_segment = ?")
        params.append(segment)
    if risk_tier:
        where_clauses.append("p.risk_tier = ?")
        params.append(risk_tier)

    where_sql = " AND ".join(where_clauses)
    order_sql = f"ORDER BY c.{sort_by} {sort_dir.upper()}"

    count_sql = f"""
        SELECT count(*) AS cnt 
        FROM analytics.customer_360 c
        LEFT JOIN ml.churn_predictions p ON c.customer_unique_id = p.customer_unique_id
        LEFT JOIN warehouse.dim_customer dc ON c.customer_unique_id = dc.customer_unique_id
        WHERE {where_sql}
    """
    total = db.query_one(count_sql, tuple(params))["cnt"]

    data_sql = f"""
        SELECT 
            c.customer_key,
            c.customer_unique_id,
            c.first_order_date,
            c.last_order_date,
            c.total_orders,
            c.completed_orders,
            c.total_spend,
            c.average_order_value,
            c.days_since_last_order,
            c.rfm_score,
            c.customer_segment,
            c.cluster_id,
            c.estimated_clv,
            c.churn_probability,
            c.preferred_category,
            c.preferred_region,
            dc.primary_city AS customer_city,
            dc.primary_state AS customer_state,
            c.customer_status,
            CASE
                WHEN c.churn_probability >= 0.80 THEN 'Critical Risk'
                WHEN c.churn_probability >= 0.60 THEN 'High Risk'
                WHEN c.churn_probability >= 0.40 THEN 'Medium Risk'
                ELSE 'Low Risk'
            END AS risk_tier
        FROM analytics.customer_360 c
        LEFT JOIN ml.churn_predictions p ON c.customer_unique_id = p.customer_unique_id
        LEFT JOIN warehouse.dim_customer dc ON c.customer_unique_id = dc.customer_unique_id
        WHERE {where_sql}
        {order_sql}
        LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])
    items = db.query(data_sql, tuple(params))

    return {
        "page": page,
        "limit": limit,
        "total": total,
        "total_pages": (total + limit - 1) // limit if total > 0 else 0,
        "items": items
    }

@app.get("/api/customers/{customer_id}")
def get_customer_profile(customer_id: str):
    key_clause = "OR c.customer_key = ?" if customer_id.isdigit() else ""
    key_params: Tuple[Any, ...] = (int(customer_id),) if customer_id.isdigit() else ()
    sql = f"""
        SELECT 
            c.*,
            CASE
                WHEN c.churn_probability >= 0.80 THEN 'Critical Risk'
                WHEN c.churn_probability >= 0.60 THEN 'High Risk'
                WHEN c.churn_probability >= 0.40 THEN 'Medium Risk'
                ELSE 'Low Risk'
            END AS risk_tier,
            COALESCE(s.cluster_name, 'Standard Customer') AS cluster_name,
            COALESCE(s.business_persona, 'General Shopper') AS cluster_persona,
            COALESCE(s.recommended_strategy, 'Standard Retention') AS recommended_strategy,
            dc.primary_city AS customer_city,
            dc.primary_state AS customer_state
        FROM analytics.customer_360 c
        LEFT JOIN ml.churn_predictions p ON c.customer_unique_id = p.customer_unique_id
        LEFT JOIN ml.customer_segments s ON c.cluster_id = s.cluster_id
        LEFT JOIN warehouse.dim_customer dc ON c.customer_unique_id = dc.customer_unique_id
        WHERE c.customer_unique_id = ? {key_clause}
    """
    profile = db.query_one(sql, (customer_id, *key_params))
    if not profile:
        raise HTTPException(status_code=404, detail=f"Customer '{customer_id}' not found.")
    return profile

@app.get("/api/customers/{customer_id}/orders")
def get_customer_orders(customer_id: str):
    sql = """
        SELECT 
            order_id,
            order_status,
            purchase_timestamp,
            delivered_customer_date,
            estimated_delivery_date,
            item_count,
            total_merchandise_amount,
            total_freight_amount,
            total_order_amount,
            is_delayed
        FROM warehouse.fact_orders
        WHERE customer_unique_id = ?
        ORDER BY purchase_timestamp DESC
    """
    orders = db.query(sql, (customer_id,))
    return {"customer_unique_id": customer_id, "orders": orders}

@app.get("/api/customers/{customer_id}/products")
def get_customer_products(customer_id: str):
    sql = """
        SELECT 
            oi.order_id,
            oi.order_item_id,
            dp.product_id,
            dp.category_name_english AS category,
            oi.price,
            oi.freight_value,
            oi.total_amount
        FROM warehouse.fact_order_items oi
        JOIN warehouse.dim_product dp ON oi.product_key = dp.product_key
        WHERE oi.customer_unique_id = ?
    """
    items = db.query(sql, (customer_id,))
    return {"customer_unique_id": customer_id, "products": items}

@app.get("/api/customers/{customer_id}/reviews")
def get_customer_reviews(customer_id: str):
    sql = """
        SELECT 
            fr.review_id,
            fr.order_id,
            fr.review_score,
            fr.review_comment_message,
            fr.review_creation_date
        FROM warehouse.fact_reviews fr
        JOIN warehouse.fact_orders fo ON fr.order_id = fo.order_id
        WHERE fo.customer_unique_id = ?
    """
    reviews = db.query(sql, (customer_id,))
    return {"customer_unique_id": customer_id, "reviews": reviews}

@app.get("/api/segments")
def get_segments():
    # Return both ML clusters and RFM segments
    ml_clusters = db.query("SELECT * FROM ml.customer_segments ORDER BY cluster_id ASC")
    rfm_segments = db.query("""
        SELECT 
            customer_segment,
            COUNT(*) AS customer_count,
            ROUND(AVG(total_spend), 2) AS mean_spend,
            ROUND(AVG(average_order_value), 2) AS mean_aov,
            ROUND(AVG(days_since_last_order), 1) AS mean_recency_days,
            ROUND(AVG(churn_probability), 4) AS mean_churn_probability
        FROM analytics.customer_360
        GROUP BY customer_segment
        ORDER BY customer_count DESC
    """)
    total_cust = sum(s["customer_count"] for s in rfm_segments)
    for s in rfm_segments:
        s["share_of_customers"] = round((s["customer_count"] / total_cust) * 100.0, 2) if total_cust > 0 else 0
    return {
        "ml_clusters": ml_clusters,
        "rfm_segments": rfm_segments,
        "total_customers": total_cust
    }

@app.get("/api/segments/{segment}")
def get_segment_detail(segment: str):
    summary = db.query_one("""
        SELECT 
            customer_segment,
            COUNT(*) AS customer_count,
            ROUND(AVG(total_spend), 2) AS mean_spend,
            ROUND(AVG(average_order_value), 2) AS mean_aov,
            ROUND(AVG(days_since_last_order), 1) AS mean_recency_days,
            ROUND(AVG(churn_probability), 4) AS mean_churn_probability,
            ROUND(SUM(total_spend), 2) AS aggregate_revenue
        FROM analytics.customer_360
        WHERE customer_segment = ?
        GROUP BY customer_segment
    """, (segment,))
    if not summary:
        raise HTTPException(status_code=404, detail=f"Segment '{segment}' not found.")

    sample_customers = db.query("""
        SELECT customer_unique_id, total_spend, total_orders, days_since_last_order, rfm_score, churn_probability
        FROM analytics.customer_360
        WHERE customer_segment = ?
        ORDER BY total_spend DESC
        LIMIT 20
    """, (segment,))
    return {"summary": summary, "sample_customers": sample_customers}

@app.get("/api/rfm")
def get_rfm_summary():
    grid = db.query("""
        SELECT 
            r_score,
            f_score,
            m_score,
            COUNT(*) AS customer_count,
            ROUND(AVG(monetary_value), 2) AS avg_spend,
            ROUND(AVG(recency_days), 1) AS avg_recency
        FROM analytics.customer_rfm
        GROUP BY r_score, f_score, m_score
        ORDER BY r_score DESC, f_score DESC, m_score DESC
    """)
    r_dist = db.query("SELECT r_score, COUNT(*) AS count, MIN(recency_days) AS min_days, MAX(recency_days) AS max_days FROM analytics.customer_rfm GROUP BY r_score ORDER BY r_score ASC")
    f_dist = db.query("SELECT f_score, COUNT(*) AS count, MIN(frequency_count) AS min_orders, MAX(frequency_count) AS max_orders FROM analytics.customer_rfm GROUP BY f_score ORDER BY f_score ASC")
    m_dist = db.query("SELECT m_score, COUNT(*) AS count, ROUND(MIN(monetary_value), 2) AS min_spend, ROUND(MAX(monetary_value), 2) AS max_spend FROM analytics.customer_rfm GROUP BY m_score ORDER BY m_score ASC")

    return {
        "rfm_matrix": grid,
        "recency_quintiles": r_dist,
        "frequency_quintiles": f_dist,
        "monetary_quintiles": m_dist
    }

@app.get("/api/cohorts")
def get_cohorts():
    matrix = db.query("SELECT * FROM analytics.customer_cohorts ORDER BY cohort_month ASC, period_number ASC")
    cohort_months = sorted(list(set(row["cohort_month"] for row in matrix)))
    return {
        "cohorts": matrix,
        "cohort_months": cohort_months
    }

@app.get("/api/retention")
def get_retention_overview():
    decay_curve = db.query("""
        SELECT 
            period_number,
            ROUND(AVG(retention_rate), 2) AS mean_retention_rate,
            SUM(active_customers) AS total_active_customers,
            ROUND(SUM(total_period_revenue), 2) AS aggregate_revenue
        FROM analytics.customer_cohorts
        GROUP BY period_number
        ORDER BY period_number ASC
    """)
    total_cust = db.query_one("SELECT count(*) AS cnt FROM warehouse.dim_customer")["cnt"]
    repeat_cust = db.query_one("SELECT count(*) AS cnt FROM warehouse.dim_customer WHERE total_lifetime_orders >= 2")["cnt"]
    repeat_rate = round((repeat_cust / total_cust) * 100.0, 2) if total_cust > 0 else 0.0

    return {
        "decay_curve": decay_curve,
        "total_unique_customers": total_cust,
        "repeat_customers": repeat_cust,
        "repeat_rate_percentage": repeat_rate
    }

@app.get("/api/churn")
def get_churn_overview():
    model = db.query_one("SELECT * FROM ml.churn_models WHERE is_champion = 1")
    risk_distribution = db.query("""
        SELECT 
            risk_tier,
            COUNT(*) AS customer_count,
            ROUND(AVG(churn_probability), 4) AS mean_probability
        FROM ml.churn_predictions
        GROUP BY risk_tier
        ORDER BY mean_probability DESC
    """)
    return {
        "champion_model": model,
        "risk_distribution": risk_distribution
    }

@app.get("/api/churn/model")
def get_churn_model_specs():
    models = db.query("SELECT * FROM ml.churn_models ORDER BY roc_auc DESC")
    return {"models": models}

@app.get("/api/churn/experiments")
def get_churn_experiments():
    exps = db.query("SELECT * FROM ml.experiments ORDER BY created_at DESC")
    out = []
    for e in exps:
        deciles = db.query(
            "SELECT decile, customer_count, churned_count, churn_rate, lift "
            "FROM ml.experiment_deciles WHERE experiment_id = ? ORDER BY decile ASC",
            (e["experiment_id"],))
        out.append({**e, "deciles": deciles})
    return {"experiments": out}


@app.get("/api/churn/features")
def get_churn_features():
    stats = db.query("""
        SELECT 
            AVG(recency_days) AS avg_recency,
            AVG(order_frequency) AS avg_frequency,
            AVG(total_spend) AS avg_spend,
            AVG(average_review_score) AS avg_review_score,
            AVG(delivery_delay_rate) AS avg_delay_rate,
            AVG(is_churned) AS churn_rate
        FROM ml.customer_features
    """)
    return {"feature_stats": stats[0] if stats else {}}

@app.get("/api/products")
def get_top_products(limit: int = Query(25, ge=1, le=100)):
    sql = """
        SELECT 
            dp.product_id,
            dp.category_name_english AS category,
            COUNT(foi.order_item_id) AS units_sold,
            ROUND(SUM(foi.price), 2) AS total_revenue,
            ROUND(AVG(foi.price), 2) AS avg_price
        FROM warehouse.fact_order_items foi
        JOIN warehouse.dim_product dp ON foi.product_key = dp.product_key
        GROUP BY dp.product_id, dp.category_name_english
        ORDER BY total_revenue DESC
        LIMIT ?
    """
    items = db.query(sql, (limit,))
    return {"products": items}

@app.get("/api/categories")
def get_categories():
    sql = """
        SELECT 
            dp.category_name_english AS category,
            COUNT(DISTINCT foi.order_id) AS total_orders,
            COUNT(foi.order_item_id) AS units_sold,
            ROUND(SUM(foi.price), 2) AS total_revenue,
            ROUND(AVG(foi.price), 2) AS avg_unit_price
        FROM warehouse.fact_order_items foi
        JOIN warehouse.dim_product dp ON foi.product_key = dp.product_key
        WHERE dp.category_name_english != 'Uncategorized'
        GROUP BY dp.category_name_english
        ORDER BY total_revenue DESC
        LIMIT 30
    """
    categories = db.query(sql)
    return {"categories": categories}

@app.get("/api/affinity")
def get_affinity_rules():
    rules = db.query("SELECT * FROM analytics.product_affinity ORDER BY lift DESC LIMIT 30")
    return {"rules": rules}

@app.get("/api/quality")
def get_data_quality():
    try:
        latest = db.query_one("SELECT run_id FROM monitoring.data_quality_results ORDER BY executed_at DESC LIMIT 1")
        latest_run = latest["run_id"] if latest else None
    except Exception:
        latest_run = None
    if latest_run:
        try:
            results = db.query("SELECT * FROM monitoring.data_quality_results WHERE run_id = ? ORDER BY pass_rate ASC", (latest_run,))
        except Exception:
            results = db.query("SELECT * FROM monitoring.data_quality_results ORDER BY pass_rate ASC")
    else:
        results = db.query("SELECT * FROM monitoring.data_quality_results ORDER BY pass_rate ASC")
    quarantined = db.query("SELECT violation_code, count(*) as count FROM quarantine.invalid_records GROUP BY violation_code")
    
    total_evaluated = sum(r["evaluated_rows"] for r in results)
    total_passed = sum(r["passed_rows"] for r in results)
    system_quality_score = round((total_passed / total_evaluated) * 100.0, 2) if total_evaluated > 0 else 100.0

    return {
        "system_quality_score": system_quality_score,
        "total_checks_executed": len(results),
        "needs_attention": any(r["failed_rows"] > 0 for r in results),
        "results": results,
        "quarantined_summary": quarantined
    }

@app.get("/api/pipelines")
def get_pipelines():
    return {
        "pipeline_name": "customer360_daily_pipeline",
        "description": "Production Customer360 daily batch warehouse and ML intelligence pipeline",
        "schedule": "0 2 * * * (Daily at 02:00 UTC)",
        "tasks": [
            {"id": "check_sources", "type": "Sensor / Source Check", "upstream": []},
            {"id": "extract_sources", "type": "Extract", "upstream": ["check_sources"]},
            {"id": "load_raw", "type": "Raw Ingestion", "upstream": ["extract_sources"]},
            {"id": "validate_raw", "type": "Validation Gate", "upstream": ["load_raw"]},
            {"id": "quarantine_invalid", "type": "Quarantine", "upstream": ["validate_raw"]},
            {"id": "dbt_staging", "type": "dbt View / Cleanse", "upstream": ["quarantine_invalid"]},
            {"id": "dbt_tests", "type": "dbt Schema Tests", "upstream": ["dbt_staging"]},
            {"id": "dbt_warehouse", "type": "Star Schema Transform", "upstream": ["dbt_tests"]},
            {"id": "customer_analytics", "type": "RFM & Cohorts Mart", "upstream": ["dbt_warehouse"]},
            {"id": "ml_features", "type": "Feature Store Build", "upstream": ["customer_analytics"]},
            {"id": "run_models", "type": "K-Means & Churn ML", "upstream": ["ml_features"]},
            {"id": "quality_checks", "type": "Mathematical DQ Assertion", "upstream": ["run_models"]},
            {"id": "publish_metrics", "type": "Mart Publishing", "upstream": ["quality_checks"]}
        ]
    }

@app.get("/api/runs")
def get_pipeline_runs():
    runs = db.query("SELECT * FROM monitoring.pipeline_runs ORDER BY start_time DESC LIMIT 15")
    latest_run_id = runs[0]["run_id"] if runs else None
    tasks = []
    if latest_run_id:
        tasks = db.query("SELECT * FROM monitoring.pipeline_tasks WHERE run_id = ? ORDER BY start_time ASC", (latest_run_id,))
    return {
        "runs": runs,
        "latest_tasks": tasks
    }

@app.get("/api/lineage")
def get_lineage():
    try:
        edges = db.query("SELECT * FROM monitoring.lineage_edges")
    except Exception:
        edges = []
    if not edges:
        return {"nodes": [], "edges": []}
    nodes: dict = {}
    for e in edges:
        for side, (schema, table) in (("from", (e["from_schema"], e["from_table"])),
                                      ("to", (e["to_schema"], e["to_table"]))):
            nid = f"{schema}.{table}"
            if nid not in nodes:
                kind = {"external": "source", "raw": "raw",
                        "staging": "staging", "warehouse": "dimension",
                        "analytics": "mart", "ml": "ml",
                        "api": "api", "ui": "ui"}.get(schema, "other")
                nodes[nid] = {"id": nid, "label": table, "type": kind, "schema": schema}
    return {"nodes": list(nodes.values()),
            "edges": [{"source": f"{e['from_schema']}.{e['from_table']}",
                       "target": f"{e['to_schema']}.{e['to_table']}",
                       "via": e["via"]} for e in edges]}

@app.get("/api/datasets")
def get_datasets():
    # Live row counts from attached schemas. No hardcoded values.
    entries = [
        ("raw", "olist_customers", "Order session customer token", "Table"),
        ("raw", "olist_orders", "Unique order transaction", "Table"),
        ("raw", "olist_order_items", "Order line item", "Table"),
        ("raw", "olist_payments", "Payment installment tender", "Table"),
        ("raw", "olist_reviews", "Customer survey review", "Table"),
        ("raw", "olist_products", "Product SKU", "Table"),
        ("raw", "olist_sellers", "Seller account", "Table"),
        ("staging", "stg_customers", "Normalized customer identity", "Table"),
        ("staging", "stg_orders", "Sanitized order", "Table"),
        ("staging", "stg_order_items", "Sanitized line item", "Table"),
        ("staging", "stg_payments", "Sanitized payment", "Table"),
        ("staging", "stg_reviews", "Sanitized review", "Table"),
        ("staging", "stg_products", "Sanitized product", "Table"),
        ("staging", "stg_sellers", "Sanitized seller", "Table"),
        ("warehouse", "dim_customer", "Distinct physical buyer (customer_unique_id)", "Dimension"),
        ("warehouse", "dim_product", "Product SKU with English category", "Dimension"),
        ("warehouse", "dim_seller", "Seller dimension", "Dimension"),
        ("warehouse", "dim_date", "Calendar date", "Dimension"),
        ("warehouse", "fact_orders", "Order transaction (no item/payment fan-out)", "Fact"),
        ("warehouse", "fact_order_items", "Individual ordered line item", "Fact"),
        ("warehouse", "fact_payments", "Payment installment tender", "Fact"),
        ("warehouse", "fact_reviews", "Customer survey review", "Fact"),
        ("analytics", "customer_360", "Customer 360 profile", "Mart"),
        ("analytics", "customer_rfm", "RFM behavioral quintiles", "Mart"),
        ("analytics", "customer_cohorts", "Monthly acquisition cohort period", "Mart"),
        ("analytics", "product_affinity", "Association rules", "Mart"),
        ("ml", "customer_features", "Leak-free ML feature vectors", "Feature Store"),
        ("ml", "churn_models", "Trained churn model versions", "Model Registry"),
        ("ml", "churn_predictions", "Customer churn inference", "Inference"),
        ("ml", "customer_segments", "K-Means cluster archetypes", "Model"),
        ("monitoring", "data_quality_results", "Test check execution", "Operational"),
        ("monitoring", "pipeline_runs", "Pipeline execution instance", "Operational"),
        ("monitoring", "pipeline_tasks", "Pipeline task execution", "Operational"),
        ("quarantine", "invalid_records", "Rejected source records", "Quarantine"),
    ]
    datasets = []
    for schema, table, grain, dtype in entries:
        try:
            row = db.query_one(f'SELECT COUNT(*) AS n FROM "{schema}"."{table}"')
            rows = row["n"] if row else 0
        except Exception:
            rows = 0
        datasets.append({"schema": schema, "table": table, "grain": grain, "rows": rows, "type": dtype})
    return {"datasets": datasets}


class LoginRequest(BaseModel):
    username: str
    password: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str


def _auth_open() -> bool:
    """Local dev mode: no users provisioned and no API key set -> open access."""
    try:
        row = db.query_one("SELECT COUNT(*) AS n FROM auth.users")
        users = row["n"] if row else 0
    except Exception:
        users = 0
    return users == 0 and not API_KEY


def get_current_user(request: Request):
    if _auth_open():
        return {"username": "local-dev", "role": "Admin"}
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Login required.")
    payload = parse_token(header[7:])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    return {"username": payload["sub"], "role": payload["role"]}


def require_roles(*roles: str):
    def _guard(user: dict = Depends(get_current_user)):
        if user["role"] not in roles and user["role"] != "Admin":
            raise HTTPException(status_code=403, detail="Insufficient role.")
        return user
    return _guard


@app.on_event("startup")
def _init_auth():
    try:
        init_auth_schema()
    except Exception:
        pass


@app.post("/api/auth/login")
def login(body: LoginRequest):
    user = authenticate(body.username, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials.")
    record_audit(user["username"], "LOGIN", "auth", 0, "SUCCESS")
    return {"access_token": issue_token(user["username"], user["role"]),
            "username": user["username"], "role": user["role"]}


@app.post("/api/auth/logout")
def logout(user: dict = Depends(get_current_user)):
    record_audit(user["username"], "LOGOUT", "auth", 0, "SUCCESS")
    return {"status": "logged out"}


@app.get("/api/auth/me")
def me(user: dict = Depends(get_current_user)):
    return user


@app.get("/api/users")
def list_users(user: dict = Depends(require_roles("Admin"))):
    return {"users": db.query("SELECT username, role, created_at FROM auth.users ORDER BY username")}


@app.post("/api/users")
def add_user(body: CreateUserRequest, user: dict = Depends(require_roles("Admin"))):
    create_user(body.username, body.password, body.role)
    record_audit(user["username"], "USER_CREATE", f"user:{body.username}", 0, "SUCCESS")
    return {"status": "created"}


@app.get("/api/audit")
def audit_log(limit: int = Query(100, ge=1, le=500),
              user: dict = Depends(require_roles("Admin"))):
    return {"entries": list_audit(limit)}


class ExportLogRequest(BaseModel):
    resource: str
    rows: int


class ExploreFilter(BaseModel):
    column: str
    op: str
    value: str


class ExploreRequest(BaseModel):
    dataset: str = "customer_360"
    filters: List[ExploreFilter] = []
    columns: List[str] = []
    page: int = 1
    limit: int = 25
    sort_by: Optional[str] = None
    sort_dir: str = "desc"


EXPLORER_DATASETS: Dict[str, Dict[str, Any]] = {
    "customer_360": {
        "table": "analytics.customer_360",
        "numeric": {"total_orders", "total_spend", "average_order_value", "days_since_last_order",
                    "churn_probability", "estimated_clv", "review_count", "average_review_score",
                    "rfm_recency", "rfm_frequency", "rfm_monetary", "total_items"},
        "text": {"customer_unique_id", "customer_segment", "customer_status",
                 "preferred_category", "preferred_payment_method", "preferred_region"},
        "default_columns": ["customer_unique_id", "total_orders", "total_spend",
                            "days_since_last_order", "customer_segment",
                            "churn_probability", "preferred_region"],
    },
    "customer_rfm": {
        "table": "analytics.customer_rfm",
        "numeric": {"recency_days", "frequency_count", "monetary_value",
                    "r_score", "f_score", "m_score"},
        "text": {"customer_unique_id", "rfm_score", "rfm_segment"},
        "default_columns": ["customer_unique_id", "recency_days", "frequency_count",
                            "monetary_value", "rfm_score", "rfm_segment"],
    },
    "product_affinity": {
        "table": "analytics.product_affinity",
        "numeric": {"support", "confidence", "lift"},
        "text": {"antecedent", "consequent"},
        "default_columns": ["antecedent", "consequent", "support", "confidence", "lift"],
    },
}

_EXPLORER_OPS = {
    "eq": "=", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=",
}


@app.get("/api/explore/datasets")
def explore_datasets(user: dict = Depends(require_roles("Analyst"))):
    return {"datasets": {
        name: {"numeric": sorted(spec["numeric"]), "text": sorted(spec["text"]),
               "default_columns": list(spec["default_columns"])}
        for name, spec in EXPLORER_DATASETS.items()}}


@app.post("/api/explore")
def explore(body: ExploreRequest, user: dict = Depends(require_roles("Analyst"))):
    spec = EXPLORER_DATASETS.get(body.dataset)
    if not spec:
        raise HTTPException(status_code=400, detail="Unknown dataset.")
    allowed = spec["numeric"] | spec["text"]
    columns = [c for c in body.columns if c in allowed] or list(spec["default_columns"])
    clauses, params = ["1=1"], []
    for f in body.filters:
        if f.column not in allowed:
            raise HTTPException(status_code=400, detail=f"Column not explorable: {f.column}.")
        if f.column in spec["numeric"]:
            if f.op not in _EXPLORER_OPS:
                raise HTTPException(status_code=400, detail=f"Bad operator: {f.op}.")
            try:
                num = float(f.value)
            except ValueError:
                raise HTTPException(status_code=400, detail="Numeric filter needs a number.")
            clauses.append(f'"{f.column}" {_EXPLORER_OPS[f.op]} ?')
            params.append(num)
        else:
            if f.op not in ("eq", "like"):
                raise HTTPException(status_code=400, detail=f"Bad operator: {f.op}.")
            if f.op == "eq":
                clauses.append(f'"{f.column}" = ?')
                params.append(f.value)
            else:
                clauses.append(f'"{f.column}" LIKE ?')
                params.append(f"%{f.value}%")
    sort = body.sort_by if body.sort_by in allowed else columns[0]
    direction = "DESC" if body.sort_dir != "asc" else "ASC"
    limit = max(1, min(body.limit, 100))
    page = max(1, body.page)
    where = " AND ".join(clauses)
    cols = ", ".join(f'"{c}"' for c in columns)
    total = db.query_one(f"SELECT count(*) AS n FROM {spec['table']} WHERE {where}",
                         tuple(params))["n"]
    items = db.query(
        f'SELECT {cols} FROM {spec["table"]} WHERE {where} '
        f'ORDER BY "{sort}" {direction} LIMIT ? OFFSET ?',
        tuple(params) + (limit, (page - 1) * limit))
    record_audit(user["username"], "EXPLORE", f"{body.dataset}:{len(body.filters)}filters",
                 len(items), "SUCCESS")
    return {"page": page, "limit": limit, "total": total,
            "total_pages": (total + limit - 1) // limit if total else 0,
            "columns": columns, "items": items}


@app.post("/api/exports/log")
def log_export(body: ExportLogRequest, user: dict = Depends(require_roles("Analyst"))):
    record_audit(user["username"], "CSV_EXPORT", body.resource, body.rows, "SUCCESS")
    return {"status": "logged"}


@app.post("/api/pipeline/run")
def trigger_pipeline(user: dict = Depends(require_roles("Admin"))):
    import threading
    from backend.pipeline.orchestrator import PipelineOrchestrator

    def _run():
        try:
            PipelineOrchestrator().run_all()
        except Exception:
            pass

    threading.Thread(target=_run, daemon=True).start()
    record_audit(user["username"], "PIPELINE_RUN", "customer360_daily_pipeline", 0, "STARTED")
    return {"status": "started"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.api.main:app", host="0.0.0.0", port=8000, reload=False)
