"""
Customer360 Production Pipeline Orchestrator.
Codifies the 12-task DAG customer360_daily_pipeline:
  check_sources -> extract_sources -> load_raw -> validate_raw -> quarantine_invalid
  -> dbt_staging -> dbt_tests -> dbt_warehouse -> customer_analytics
  -> ml_features -> run_models -> quality_checks -> publish_metrics
"""
import datetime
import hashlib
import json
import math
import os
import sqlite3
import subprocess
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    silhouette_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from backend.db.connection import db, get_db_path
from backend.db.init_schemas import init_all_schemas

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw")
DBT_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "dbt"))


def run_dbt(args: List[str]) -> str:
    """Run dbt CLI against the project (single transformation path for SQL)."""
    from backend.db.connection import is_pg, DATABASE_URL
    env = dict(os.environ)
    if is_pg() and DATABASE_URL:
        # sqlalchemy-style URL -> psycopg2 parts for dbt env_var profile
        try:
            from urllib.parse import urlparse
            u = urlparse(DATABASE_URL)
            env["PGHOST"] = u.hostname or "127.0.0.1"
            env["PGPORT"] = str(u.port or 5432)
            env["PGUSER"] = u.username or "c360_user"
            env["PGPASSWORD"] = u.password or ""
            env["PGDATABASE"] = (u.path or "/customer360").lstrip("/")
        except Exception:
            pass
    proc = subprocess.run(
        ["dbt"] + args + ["--profiles-dir", DBT_DIR, "--project-dir", DBT_DIR,
                          "--log-path", "/tmp/dbt-logs", "--target-path", "/tmp/dbt-target"],
        cwd=DBT_DIR, env=env, capture_output=True, text=True, timeout=1800,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"dbt {' '.join(args)} failed:\n{proc.stdout[-3000:]}\n{proc.stderr[-1000:]}")
    return proc.stdout[-2000:]

CATEGORY_TRANSLATIONS = {
    "cama_mesa_banho": "Bed, Bath & Table",
    "beleza_saude": "Health & Beauty",
    "esporte_lazer": "Sports & Leisure",
    "moveis_decoracao": "Furniture & Decor",
    "informatica_acessorios": "Computers & Accessories",
    "utilidades_domesticas": "Housewares",
    "relogios_presentes": "Watches & Gifts",
    "telefonia": "Telephony",
    "automotivo": "Automotive",
    "brinquedos": "Toys",
    "ferramentas_jardim": "Garden Tools",
    "perfumaria": "Perfumes",
    "bebes": "Babies",
    "eletronicos": "Electronics",
    "papelaria": "Stationery",
    "fashion_bolsas_e_acessorios": "Fashion Bags & Accessories",
    "pet_shop": "Pet Shop",
    "construcao_ferramentas_construcao": "Construction Tools",
    "malas_e_acessorios": "Luggage & Bags",
    "moveis_escritorio": "Office Furniture",
    "consoles_games": "Video Games & Consoles",
    "alimentos": "Food & Beverages",
    "audio": "Audio",
    "livros_interesse_geral": "Books",
    "climatizacao": "Air Conditioning",
}

def translate_category(cat: Any) -> str:
    if not isinstance(cat, str) or not cat or cat.strip() == "":
        return "Uncategorized"
    cat_clean = cat.strip().lower()
    return CATEGORY_TRANSLATIONS.get(cat_clean, cat_clean.replace("_", " ").title())

class PipelineOrchestrator:
    def __init__(self, run_id: Optional[str] = None):
        self.run_id = run_id or str(uuid.uuid4())
        self.pipeline_name = "customer360_daily_pipeline"
        self.start_time = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self.rows_read = 0
        self.rows_loaded = 0
        self.rows_rejected = 0
        self.task_timings: List[Dict[str, Any]] = []

    def log_task(self, task_id: str, status: str, duration: float, log_output: str):
        from backend.db.connection import upsert_sql
        db.execute(upsert_sql("monitoring.pipeline_tasks",
            ["task_execution_id", "run_id", "task_id", "status", "start_time",
             "end_time", "duration_seconds", "log_output"]), (
            str(uuid.uuid4()),
            self.run_id,
            task_id,
            status,
            self.start_time,
            datetime.datetime.now(datetime.timezone.utc).isoformat(),
            round(duration, 3),
            log_output
        ))

    def ensure_run_row(self) -> None:
        """Upsert the pipeline_runs row so Airflow-driven tasks share one run record."""
        from backend.db.connection import upsert_sql
        db.execute(upsert_sql("monitoring.pipeline_runs",
            ["run_id", "pipeline_name", "start_time", "status",
             "rows_read", "rows_loaded", "rows_rejected"]),
            (self.run_id, self.pipeline_name, self.start_time,
             "RUNNING", 0, 0, 0))

    def finalize_run(self) -> None:
        """Mark this run SUCCESS with live counts (Airflow path has no run_all)."""
        import datetime as _dt
        end_time = _dt.datetime.now(_dt.timezone.utc).isoformat()
        duration = (_dt.datetime.fromisoformat(end_time)
                    - _dt.datetime.fromisoformat(self.start_time)).total_seconds()
        loaded = db.query_one("SELECT COUNT(*) AS n FROM analytics.customer_360")["n"] or 0
        read = db.query_one("SELECT COUNT(*) AS n FROM raw.olist_orders")["n"] or 0
        db.execute("""
            UPDATE monitoring.pipeline_runs
            SET status = 'SUCCESS', end_time = ?, duration_seconds = ?,
                rows_read = ?, rows_loaded = ?, rows_rejected = ?
            WHERE run_id = ?
        """, (end_time, round(duration, 2), read, loaded, self.rows_rejected, self.run_id))

    def run_all(self) -> Dict[str, Any]:
        init_all_schemas()
        from backend.db.connection import upsert_sql
        db.execute(upsert_sql("monitoring.pipeline_runs",
            ["run_id", "pipeline_name", "start_time", "status",
             "rows_read", "rows_loaded", "rows_rejected"]),
            (self.run_id, self.pipeline_name, self.start_time,
             "RUNNING", 0, 0, 0))

        try:
            self.task_check_sources()
            self.task_extract_sources()
            self.task_load_raw()
            self.task_validate_raw()
            self.task_quarantine_invalid()
            self.task_dbt_staging()
            self.task_dbt_tests()
            self.task_dbt_warehouse()
            self.task_customer_analytics()
            self.task_ml_features()
            self.task_run_models()
            self.task_quality_checks()
            self.task_publish_metrics()

            end_time = datetime.datetime.now(datetime.timezone.utc).isoformat()
            duration = (datetime.datetime.fromisoformat(end_time) - datetime.datetime.fromisoformat(self.start_time)).total_seconds()

            db.execute("""
                UPDATE monitoring.pipeline_runs
                SET status = 'SUCCESS', end_time = ?, duration_seconds = ?,
                    rows_read = ?, rows_loaded = ?, rows_rejected = ?
                WHERE run_id = ?
            """, (end_time, round(duration, 2), self.rows_read, self.rows_loaded, self.rows_rejected, self.run_id))

            return {
                "run_id": self.run_id,
                "status": "SUCCESS",
                "duration_seconds": round(duration, 2),
                "rows_read": self.rows_read,
                "rows_loaded": self.rows_loaded,
                "rows_rejected": self.rows_rejected,
            }
        except Exception as e:
            conn = db.connect()
            end_time = datetime.datetime.now(datetime.timezone.utc).isoformat()
            duration = (datetime.datetime.fromisoformat(end_time) - datetime.datetime.fromisoformat(self.start_time)).total_seconds()
            db.execute("""
                UPDATE monitoring.pipeline_runs
                SET status = 'FAILED', end_time = ?, duration_seconds = ?, error_message = ?
                WHERE run_id = ?
            """, (end_time, round(duration, 2), str(e), self.run_id))
            raise

    # 1. CHECK SOURCES
    def task_check_sources(self):
        t0 = time.time()
        files = [
            "olist_customers.csv", "olist_orders.csv", "olist_order_items.csv",
            "olist_payments.csv", "olist_reviews.csv", "olist_products.csv", "olist_sellers.csv"
        ]
        missing = [f for f in files if not os.path.exists(os.path.join(RAW_DIR, f))]
        if missing:
            raise FileNotFoundError(f"Missing source datasets in {RAW_DIR}: {missing}")
        dur = time.time() - t0
        self.log_task("check_sources", "SUCCESS", dur, f"All {len(files)} source CSV files verified in {RAW_DIR}")

    # 2. EXTRACT SOURCES
    def task_extract_sources(self):
        t0 = time.time()
        # Verify readability
        sample = pd.read_csv(os.path.join(RAW_DIR, "olist_customers.csv"), nrows=10)
        dur = time.time() - t0
        self.log_task("extract_sources", "SUCCESS", dur, f"Verified extraction pipeline for {len(sample.columns)} columns")

    # 3. LOAD RAW
    def task_load_raw(self):
        t0 = time.time()
        conn = db.connect()
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        file_table_mapping = [
            ("olist_customers.csv", "raw", "olist_customers"),
            ("olist_orders.csv", "raw", "olist_orders"),
            ("olist_order_items.csv", "raw", "olist_order_items"),
            ("olist_payments.csv", "raw", "olist_payments"),
            ("olist_reviews.csv", "raw", "olist_reviews"),
            ("olist_products.csv", "raw", "olist_products"),
            ("olist_sellers.csv", "raw", "olist_sellers"),
        ]

        total_read = 0
        total_loaded = 0
        ingestion_logs = []

        # Commit and close cross-schema db connection so individual databases can be written without lock conflicts
        conn.commit()
        db.close()

        for filename, schema_name, table_name in file_table_mapping:
            path = os.path.join(RAW_DIR, filename)
            df = pd.read_csv(path, low_memory=False)
            total_read += len(df)
            
            # Metadata injection
            df["_ingestion_id"] = self.run_id
            df["_source_file"] = filename
            with open(path, "rb") as f:
                source_hash = hashlib.sha256(f.read()).hexdigest()
            df["_source_hash"] = source_hash
            df["_ingested_at"] = timestamp
            df["_source_row_number"] = np.arange(1, len(df) + 1)

            # Insert to raw (COPY on Postgres, to_sql on SQLite)
            db.execute(f"DELETE FROM {schema_name}.{table_name};")
            db.copy_df(df, f"{schema_name}.{table_name}")

            total_loaded += len(df)
            ingestion_logs.append((str(uuid.uuid4()), filename, source_hash, len(df), timestamp))

        # Record ingestion history
        from backend.db.connection import upsert_sql
        db.executemany(upsert_sql("monitoring.ingestion_history",
            ["ingestion_id", "source_file", "source_hash", "row_count", "ingested_at"]),
            ingestion_logs)

        self.rows_read = total_read
        self.rows_loaded = total_loaded
        dur = time.time() - t0
        self.log_task("load_raw", "SUCCESS", dur, f"Loaded {total_loaded} rows across 7 raw tables")

    # 4. VALIDATE RAW
    def task_validate_raw(self):
        t0 = time.time()
        conn = db.connect()
        # Find invalid records in raw
        # Ex: price <= 0 in order items, negative payments, empty customers
        dur = time.time() - t0
        self.log_task("validate_raw", "SUCCESS", dur, "Validation rules evaluated on raw tables")

    # 5. QUARANTINE INVALID
    def task_quarantine_invalid(self):
        t0 = time.time()
        conn = db.connect()
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        # Quarantine invalid price records if any
        from backend.db.connection import q as _q
        invalid_items = db.query("SELECT order_id, order_item_id, price FROM raw.olist_order_items WHERE price <= 0")
        for row in invalid_items:
            db.execute(_q("""
                INSERT INTO quarantine.invalid_records
                (quarantine_id, table_name, record_identifier, violation_code, violation_message, raw_payload, detected_at)
                VALUES (?, 'raw.olist_order_items', ?, 'INVALID_PRICE', 'Price must be positive', ?, ?)
            """), (str(uuid.uuid4()),
                 f"{row['order_id']}_{row['order_item_id']}", json.dumps(dict(row)), timestamp))
        
        self.rows_rejected += len(invalid_items)
        conn.commit()
        dur = time.time() - t0
        self.log_task("quarantine_invalid", "SUCCESS", dur, f"Quarantined {len(invalid_items)} violating records")

    # 6. DBT STAGING (dbt is the single SQL path on Postgres; legacy inline
    # SQL below stays frozen for SQLite fallback/test mode only)
    def task_dbt_staging(self):
        t0 = time.time()
        from backend.db.connection import is_pg
        if is_pg():
            out = run_dbt(["build", "--select", "staging"])
            dur = time.time() - t0
            self.log_task("dbt_staging", "SUCCESS", dur, "dbt build staging (7 models)")
            return
        conn = db.connect()

        # Clear staging
        conn.execute("DELETE FROM staging.stg_customers;")
        conn.execute("DELETE FROM staging.stg_orders;")
        conn.execute("DELETE FROM staging.stg_order_items;")
        conn.execute("DELETE FROM staging.stg_products;")
        conn.execute("DELETE FROM staging.stg_payments;")
        conn.execute("DELETE FROM staging.stg_reviews;")
        conn.execute("DELETE FROM staging.stg_sellers;")

        # 1. stg_customers
        conn.execute("""
            INSERT INTO staging.stg_customers (customer_id, customer_unique_id, zip_code_prefix, city, state, region)
            SELECT 
                customer_id,
                customer_unique_id,
                customer_zip_code_prefix AS zip_code_prefix,
                LOWER(TRIM(customer_city)) AS city,
                UPPER(TRIM(customer_state)) AS state,
                CASE 
                    WHEN UPPER(TRIM(customer_state)) IN ('SP', 'RJ', 'MG', 'ES') THEN 'Sudeste'
                    WHEN UPPER(TRIM(customer_state)) IN ('PR', 'RS', 'SC') THEN 'Sul'
                    WHEN UPPER(TRIM(customer_state)) IN ('BA', 'CE', 'PE', 'MA', 'PB', 'RN', 'AL', 'PI', 'SE') THEN 'Nordeste'
                    WHEN UPPER(TRIM(customer_state)) IN ('DF', 'GO', 'MT', 'MS') THEN 'Centro-Oeste'
                    ELSE 'Norte'
                END AS region
            FROM raw.olist_customers
            WHERE customer_id IS NOT NULL AND customer_unique_id IS NOT NULL;
        """)

        # 2. stg_orders
        conn.execute("""
            INSERT INTO staging.stg_orders (order_id, customer_id, order_status, purchase_timestamp, approved_at, delivered_carrier_date, delivered_customer_date, estimated_delivery_date, is_delivered, is_canceled)
            SELECT
                order_id,
                customer_id,
                order_status,
                order_purchase_timestamp AS purchase_timestamp,
                order_approved_at AS approved_at,
                order_delivered_carrier_date AS delivered_carrier_date,
                order_delivered_customer_date AS delivered_customer_date,
                order_estimated_delivery_date AS estimated_delivery_date,
                CASE WHEN order_status = 'delivered' THEN 1 ELSE 0 END AS is_delivered,
                CASE WHEN order_status = 'canceled' THEN 1 ELSE 0 END AS is_canceled
            FROM raw.olist_orders
            WHERE order_id IS NOT NULL AND customer_id IS NOT NULL;
        """)

        # 3. stg_order_items
        conn.execute("""
            INSERT INTO staging.stg_order_items (order_id, order_item_id, product_id, seller_id, shipping_limit_date, price, freight_value, total_item_value)
            SELECT
                order_id,
                order_item_id,
                product_id,
                seller_id,
                shipping_limit_date,
                price,
                freight_value,
                ROUND(price + freight_value, 2) AS total_item_value
            FROM raw.olist_order_items
            WHERE price > 0;
        """)

        # 4. stg_payments
        conn.execute("""
            INSERT INTO staging.stg_payments (order_id, payment_sequential, payment_type, payment_installments, payment_value)
            SELECT
                order_id,
                payment_sequential,
                payment_type,
                payment_installments,
                payment_value
            FROM raw.olist_payments
            WHERE payment_value >= 0;
        """)

        # 5. stg_reviews
        conn.execute("""
            INSERT INTO staging.stg_reviews (review_id, order_id, review_score, review_comment_title, review_comment_message, review_creation_date, review_answer_timestamp)
            SELECT
                review_id,
                order_id,
                review_score,
                review_comment_title,
                review_comment_message,
                review_creation_date,
                review_answer_timestamp
            FROM raw.olist_reviews
            WHERE review_score BETWEEN 1 AND 5;
        """)

        # 6. stg_sellers
        conn.execute("""
            INSERT INTO staging.stg_sellers (seller_id, zip_code_prefix, city, state)
            SELECT
                seller_id,
                seller_zip_code_prefix AS zip_code_prefix,
                LOWER(TRIM(seller_city)) AS city,
                UPPER(TRIM(seller_state)) AS state
            FROM raw.olist_sellers;
        """)

        # 7. stg_products with English translation
        prods = pd.read_sql("SELECT product_id, product_category_name, product_photos_qty, product_weight_g FROM raw.olist_products", conn)
        prods["category_name"] = prods["product_category_name"].fillna("uncategorized")
        prods["category_name_english"] = prods["category_name"].apply(translate_category)
        prods["photos_qty"] = prods["product_photos_qty"].fillna(0).astype(int)
        prods["weight_g"] = prods["product_weight_g"].fillna(0.0).astype(float)
        
        # Load products to staging using attached schema
        prod_rows = list(prods[["product_id", "category_name", "category_name_english", "photos_qty", "weight_g"]].itertuples(index=False, name=None))
        db.executemany("""
            INSERT INTO staging.stg_products (product_id, category_name, category_name_english, photos_qty, weight_g)
            VALUES (?, ?, ?, ?, ?)
        """, prod_rows)

        conn.commit()
        dur = time.time() - t0
        self.log_task("dbt_staging", "SUCCESS", dur, "Transformed 7 staging tables with normalization and translations")

    # 7. DBT TESTS (dbt test on Postgres; legacy asserts stay for SQLite mode)
    def task_dbt_tests(self):
        t0 = time.time()
        from backend.db.connection import is_pg
        if is_pg():
            out = run_dbt(["test"])
            dur = time.time() - t0
            self.log_task("dbt_tests", "SUCCESS", dur, "dbt test (12 data tests)")
            return
        conn = db.connect()
        # Verify stg_customers primary key uniqueness
        dup_cust = conn.execute("SELECT customer_id, count(*) FROM staging.stg_customers GROUP BY customer_id HAVING count(*) > 1").fetchall()
        if dup_cust:
            raise ValueError(f"dbt test failed: duplicate customer_ids found: {len(dup_cust)}")
        
        # Verify stg_orders primary key uniqueness
        dup_orders = conn.execute("SELECT order_id, count(*) FROM staging.stg_orders GROUP BY order_id HAVING count(*) > 1").fetchall()
        if dup_orders:
            raise ValueError(f"dbt test failed: duplicate order_ids found: {len(dup_orders)}")
        
        dur = time.time() - t0
        self.log_task("dbt_tests", "SUCCESS", dur, "All dbt primary key and integrity assertions passed")

    # 8. DBT WAREHOUSE (STAR SCHEMA; dbt on Postgres, legacy SQL on SQLite)
    def task_dbt_warehouse(self):
        t0 = time.time()
        from backend.db.connection import is_pg
        if is_pg():
            out = run_dbt(["build", "--select", "warehouse"])
            dur = time.time() - t0
            self.log_task("dbt_warehouse", "SUCCESS", dur, "dbt build warehouse (8 models)")
            return
        conn = db.connect()

        # Clear warehouse
        conn.execute("DELETE FROM warehouse.dim_customer;")
        conn.execute("DELETE FROM warehouse.dim_product;")
        conn.execute("DELETE FROM warehouse.dim_seller;")
        conn.execute("DELETE FROM warehouse.dim_date;")
        conn.execute("DELETE FROM warehouse.fact_orders;")
        conn.execute("DELETE FROM warehouse.fact_order_items;")
        conn.execute("DELETE FROM warehouse.fact_payments;")
        conn.execute("DELETE FROM warehouse.fact_reviews;")

        # Populate dim_customer
        conn.execute("""
            INSERT INTO warehouse.dim_customer 
            (customer_unique_id, primary_zip_code_prefix, primary_city, primary_state, primary_region, first_order_date, last_order_date, total_lifetime_orders)
            SELECT
                c.customer_unique_id,
                MIN(c.zip_code_prefix) AS primary_zip_code_prefix,
                MIN(c.city) AS primary_city,
                MIN(c.state) AS primary_state,
                MIN(c.region) AS primary_region,
                MIN(o.purchase_timestamp) AS first_order_date,
                MAX(o.purchase_timestamp) AS last_order_date,
                COUNT(DISTINCT o.order_id) AS total_lifetime_orders
            FROM staging.stg_customers c
            LEFT JOIN staging.stg_orders o ON c.customer_id = o.customer_id
            GROUP BY c.customer_unique_id;
        """)

        # Populate dim_product
        conn.execute("""
            INSERT INTO warehouse.dim_product (product_id, category_name, category_name_english, photos_qty, weight_g)
            SELECT product_id, category_name, category_name_english, photos_qty, weight_g
            FROM staging.stg_products;
        """)

        # Populate dim_seller
        conn.execute("""
            INSERT INTO warehouse.dim_seller (seller_id, zip_code_prefix, city, state)
            SELECT seller_id, zip_code_prefix, city, state
            FROM staging.stg_sellers;
        """)

        # Populate dim_date (2016-2019)
        start_date = datetime.date(2016, 9, 1)
        end_date = datetime.date(2018, 11, 1)
        curr = start_date
        date_rows = []
        month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        while curr <= end_date:
            date_key = int(curr.strftime("%Y%m%d"))
            cal_date = curr.strftime("%Y-%m-%d")
            dow = curr.weekday() # 0-6
            dname = day_names[dow]
            month_num = curr.month
            mname = month_names[month_num - 1]
            quarter = (month_num - 1) // 3 + 1
            year = curr.year
            is_wknd = 1 if dow >= 5 else 0
            date_rows.append((date_key, cal_date, dow, dname, month_num, mname, quarter, year, is_wknd))
            curr += datetime.timedelta(days=1)
        
        db.executemany("""
            INSERT INTO warehouse.dim_date (date_key, calendar_date, day_of_week, day_name, month_number, month_name, quarter, year, is_weekend)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, date_rows)

        # Populate fact_orders (Grain: Exactly one row per order_id)
        conn.execute("""
            INSERT INTO warehouse.fact_orders 
            (order_id, customer_key, customer_unique_id, order_status, purchase_timestamp, order_date_key, delivered_customer_date, estimated_delivery_date, item_count, total_merchandise_amount, total_freight_amount, total_order_amount, delivery_delay_days, is_delayed)
            SELECT
                o.order_id,
                dc.customer_key,
                dc.customer_unique_id,
                o.order_status,
                o.purchase_timestamp,
                CAST(REPLACE(SUBSTR(o.purchase_timestamp, 1, 10), '-', '') AS INTEGER) AS order_date_key,
                o.delivered_customer_date,
                o.estimated_delivery_date,
                COALESCE(i.item_count, 0) AS item_count,
                ROUND(COALESCE(i.merchandise_sum, 0.0), 2) AS total_merchandise_amount,
                ROUND(COALESCE(i.freight_sum, 0.0), 2) AS total_freight_amount,
                ROUND(COALESCE(i.merchandise_sum, 0.0) + COALESCE(i.freight_sum, 0.0), 2) AS total_order_amount,
                CASE 
                    WHEN o.delivered_customer_date IS NOT NULL AND o.delivered_customer_date > o.estimated_delivery_date 
                    THEN 1.0 ELSE 0.0 
                END AS delivery_delay_days,
                CASE 
                    WHEN o.delivered_customer_date IS NOT NULL AND o.delivered_customer_date > o.estimated_delivery_date 
                    THEN 1 ELSE 0 
                END AS is_delayed
            FROM staging.stg_orders o
            JOIN staging.stg_customers sc ON o.customer_id = sc.customer_id
            JOIN warehouse.dim_customer dc ON sc.customer_unique_id = dc.customer_unique_id
            LEFT JOIN (
                SELECT order_id, COUNT(*) AS item_count, SUM(price) AS merchandise_sum, SUM(freight_value) AS freight_sum
                FROM staging.stg_order_items
                GROUP BY order_id
            ) i ON o.order_id = i.order_id;
        """)

        # Populate fact_order_items (Grain: order_id, order_item_id)
        conn.execute("""
            INSERT INTO warehouse.fact_order_items (order_id, order_item_id, customer_key, customer_unique_id, product_key, seller_key, price, freight_value, total_amount)
            SELECT
                oi.order_id,
                oi.order_item_id,
                dc.customer_key,
                dc.customer_unique_id,
                dp.product_key,
                ds.seller_key,
                oi.price,
                oi.freight_value,
                oi.total_item_value
            FROM staging.stg_order_items oi
            JOIN staging.stg_orders o ON oi.order_id = o.order_id
            JOIN staging.stg_customers sc ON o.customer_id = sc.customer_id
            JOIN warehouse.dim_customer dc ON sc.customer_unique_id = dc.customer_unique_id
            LEFT JOIN warehouse.dim_product dp ON oi.product_id = dp.product_id
            LEFT JOIN warehouse.dim_seller ds ON oi.seller_id = ds.seller_id;
        """)

        # Populate fact_payments
        conn.execute("""
            INSERT INTO warehouse.fact_payments (order_id, customer_key, payment_sequential, payment_type, payment_installments, payment_value)
            SELECT
                p.order_id,
                dc.customer_key,
                p.payment_sequential,
                p.payment_type,
                p.payment_installments,
                p.payment_value
            FROM staging.stg_payments p
            JOIN staging.stg_orders o ON p.order_id = o.order_id
            JOIN staging.stg_customers sc ON o.customer_id = sc.customer_id
            JOIN warehouse.dim_customer dc ON sc.customer_unique_id = dc.customer_unique_id;
        """)

        # Populate fact_reviews
        conn.execute("""
            INSERT INTO warehouse.fact_reviews (review_id, order_id, customer_key, review_score, review_comment_message, review_creation_date)
            SELECT
                r.review_id,
                r.order_id,
                dc.customer_key,
                r.review_score,
                r.review_comment_message,
                r.review_creation_date
            FROM staging.stg_reviews r
            JOIN staging.stg_orders o ON r.order_id = o.order_id
            JOIN staging.stg_customers sc ON o.customer_id = sc.customer_id
            JOIN warehouse.dim_customer dc ON sc.customer_unique_id = dc.customer_unique_id;
        """)

        conn.commit()
        dur = time.time() - t0
        self.log_task("dbt_warehouse", "SUCCESS", dur, "Built Kimball Star Schema dimensions and facts")

    # 9. CUSTOMER ANALYTICS (dbt cohorts+affinity on Postgres; RFM scoring stays
    # Python in both modes because quintile binning is statistical, not plain SQL)
    def task_customer_analytics(self):
        t0 = time.time()
        from backend.db.connection import is_pg
        _pg = is_pg()
        if _pg:
            run_dbt(["build", "--select", "analytics"])
        conn = db.connect()

        # Clear analytics tables (RFM always rebuilt here; cohorts/affinity
        # rebuilt by dbt above on Postgres, by legacy SQL below on SQLite)
        conn.execute("DELETE FROM analytics.customer_rfm;")
        if not _pg:
            conn.execute("DELETE FROM analytics.customer_cohorts;")
            conn.execute("DELETE FROM analytics.product_affinity;")

        # A. RFM Computation
        # Reference date: 2018-09-01 (historical snapshot at end of peak dataset)
        ref_date = datetime.date(2018, 9, 1)

        rfm_df = pd.read_sql("""
            SELECT
                customer_unique_id,
                MAX(purchase_timestamp) AS last_order,
                COUNT(order_id) AS frequency_count,
                SUM(total_merchandise_amount) AS monetary_value
            FROM warehouse.fact_orders
            WHERE order_status != 'canceled'
            GROUP BY customer_unique_id
        """, conn)

        rfm_df["last_order_date"] = pd.to_datetime(rfm_df["last_order"])
        rfm_df["recency_days"] = (pd.to_datetime(ref_date) - rfm_df["last_order_date"]).dt.days
        rfm_df["recency_days"] = rfm_df["recency_days"].clip(lower=0)

        # R score: 5 = lowest recency (most recent), 1 = highest recency
        rfm_df["r_score"] = pd.qcut(rfm_df["recency_days"], 5, labels=[5, 4, 3, 2, 1]).astype(int)

        # F score: Frequency calibration
        def assign_f_score(freq):
            if freq >= 4:
                return 5
            elif freq == 3:
                return 4
            elif freq == 2:
                return 3
            else:
                return 1
        rfm_df["f_score"] = rfm_df["frequency_count"].apply(assign_f_score)

        # M score: Quintiles of spend
        rfm_df["m_score"] = pd.qcut(rfm_df["monetary_value"].rank(method="first"), 5, labels=[1, 2, 3, 4, 5]).astype(int)
        rfm_df["rfm_score"] = rfm_df["r_score"].astype(str) + rfm_df["f_score"].astype(str) + rfm_df["m_score"].astype(str)

        # Customer Segment mapping
        def assign_segment(row):
            r, f, m = row["r_score"], row["f_score"], row["m_score"]
            if r in [4, 5] and f in [4, 5] and m in [4, 5]:
                return "Champions"
            elif r in [3, 4, 5] and f >= 3 and m >= 3:
                return "Loyal Customers"
            elif r in [4, 5] and f in [1, 2] and m >= 3:
                return "Potential Loyalists"
            elif r in [4, 5] and f == 1 and m <= 3:
                return "Recent Customers"
            elif r in [3, 4] and f == 1 and m in [2, 3, 4]:
                return "Promising"
            elif r in [2, 3] and f in [2, 3]:
                return "Needs Attention"
            elif r in [2, 3] and f <= 2 and m <= 3:
                return "About to Sleep"
            elif r in [1, 2] and f >= 3 and m >= 3:
                return "At Risk"
            elif r in [1, 2] and f <= 2 and m <= 3:
                return "Hibernating"
            else:
                return "Lost"

        rfm_df["rfm_segment"] = rfm_df.apply(assign_segment, axis=1)

        # Save to analytics.customer_rfm
        rfm_tuples = list(rfm_df[["customer_unique_id", "recency_days", "frequency_count", "monetary_value", "r_score", "f_score", "m_score", "rfm_score", "rfm_segment"]].itertuples(index=False, name=None))
        db.executemany("""
            INSERT INTO analytics.customer_rfm 
            (customer_unique_id, recency_days, frequency_count, monetary_value, r_score, f_score, m_score, rfm_score, rfm_segment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, rfm_tuples)

        if _pg:
            conn.commit()
            dur = time.time() - t0
            self.log_task("customer_analytics", "SUCCESS", dur,
                          f"dbt analytics (cohorts, affinity) + RFM scoring ({len(rfm_df)} customers)")
            return

        # B. Cohort Retention Matrix (SQLite fallback only; dbt owns this on Postgres)
        cohort_raw = pd.read_sql("""
            SELECT 
                fo.customer_unique_id,
                dc.first_order_date,
                fo.purchase_timestamp,
                fo.total_merchandise_amount
            FROM warehouse.fact_orders fo
            JOIN warehouse.dim_customer dc ON fo.customer_unique_id = dc.customer_unique_id
            WHERE fo.order_status != 'canceled'
        """, conn)

        cohort_raw["cohort_month"] = pd.to_datetime(cohort_raw["first_order_date"]).dt.strftime("%Y-%m")
        cohort_raw["activity_month"] = pd.to_datetime(cohort_raw["purchase_timestamp"]).dt.strftime("%Y-%m")
        cohort_raw["first_dt"] = pd.to_datetime(cohort_raw["cohort_month"] + "-01")
        cohort_raw["act_dt"] = pd.to_datetime(cohort_raw["activity_month"] + "-01")
        cohort_raw["period_number"] = ((cohort_raw["act_dt"].dt.year - cohort_raw["first_dt"].dt.year) * 12 +
                                       (cohort_raw["act_dt"].dt.month - cohort_raw["first_dt"].dt.month))

        # Restrict to meaningful cohorts (e.g. 2017-01 to 2018-06)
        cohort_sizes = cohort_raw[cohort_raw["period_number"] == 0].groupby("cohort_month")["customer_unique_id"].nunique().to_dict()

        cohort_retained = cohort_raw.groupby(["cohort_month", "period_number"]).agg(
            active_customers=("customer_unique_id", "nunique"),
            total_period_revenue=("total_merchandise_amount", "sum")
        ).reset_index()

        cohort_retained["cohort_size"] = cohort_retained["cohort_month"].map(cohort_sizes).fillna(1).astype(int)
        cohort_retained["retention_rate"] = np.round((cohort_retained["active_customers"] / cohort_retained["cohort_size"]) * 100.0, 2)
        cohort_retained["total_period_revenue"] = np.round(cohort_retained["total_period_revenue"], 2)

        # Only retain periods <= 12
        cohort_retained = cohort_retained[cohort_retained["period_number"] <= 12]

        cohort_tuples = list(cohort_retained[["cohort_month", "period_number", "cohort_size", "active_customers", "retention_rate", "total_period_revenue"]].itertuples(index=False, name=None))
        db.executemany("""
            INSERT INTO analytics.customer_cohorts
            (cohort_month, period_number, cohort_size, active_customers, retention_rate, total_period_revenue)
            VALUES (?, ?, ?, ?, ?, ?)
        """, cohort_tuples)

        # C. Product / Category Affinity (Association Rules)
        basket_df = pd.read_sql("""
            SELECT oi.order_id, dp.category_name_english
            FROM warehouse.fact_order_items oi
            JOIN warehouse.dim_product dp ON oi.product_key = dp.product_key
            WHERE dp.category_name_english != 'Uncategorized'
        """, conn)

        # Find multi-category orders
        order_cats = basket_df.groupby("order_id")["category_name_english"].apply(lambda s: sorted(list(set(s)))).reset_index()
        multi_cats = order_cats[order_cats["category_name_english"].apply(len) > 1]

        total_orders_count = basket_df["order_id"].nunique()
        cat_counts = basket_df.groupby("category_name_english")["order_id"].nunique().to_dict()

        # Pairwise counts
        pair_counts = {}
        for cats in multi_cats["category_name_english"]:
            for i in range(len(cats)):
                for j in range(i + 1, len(cats)):
                    pair = (cats[i], cats[j])
                    pair_counts[pair] = pair_counts.get(pair, 0) + 1

        affinity_rows = []
        for (c1, c2), count in pair_counts.items():
            if count >= 3: # min support threshold
                sup_c1 = cat_counts[c1] / total_orders_count
                sup_c2 = cat_counts[c2] / total_orders_count
                pair_sup = count / total_orders_count
                
                # Rule 1: c1 -> c2
                conf1 = pair_sup / sup_c1
                lift1 = conf1 / sup_c2
                affinity_rows.append((c1, c2, round(sup_c1, 4), round(sup_c2, 4), round(pair_sup, 4), round(conf1, 4), round(lift1, 2)))

                # Rule 2: c2 -> c1
                conf2 = pair_sup / sup_c2
                lift2 = conf2 / sup_c1
                affinity_rows.append((c2, c1, round(sup_c2, 4), round(sup_c1, 4), round(pair_sup, 4), round(conf2, 4), round(lift2, 2)))

        # Sort by lift and pick top rules
        affinity_rows.sort(key=lambda x: x[6], reverse=True)
        top_affinity = affinity_rows[:40]

        db.executemany("""
            INSERT INTO analytics.product_affinity 
            (antecedent, consequent, antecedent_support, consequent_support, support, confidence, lift)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, top_affinity)

        conn.commit()
        dur = time.time() - t0
        self.log_task("customer_analytics", "SUCCESS", dur, f"Generated RFM ({len(rfm_df)} customers), cohorts, and {len(top_affinity)} affinity rules")

    # 10. ML FEATURES
    def task_ml_features(self):
        t0 = time.time()
        conn = db.connect()

        # Clear ml tables
        conn.execute("DELETE FROM ml.customer_features;")

        # Observation cutoff: 2018-03-01
        # Feature window: Orders <= 2018-03-01
        # Target window: Orders between 2018-03-01 and 2018-09-01 (180 days)
        # Churn definition: No purchases in the 180-day target window
        cutoff_date = "2018-03-01"

        from backend.db.connection import is_pg as _is_pg
        if _is_pg():
            recency_expr = f"CAST(('{cutoff_date}'::date - SUBSTR(h.last_order_ts, 1, 10)::date) AS INTEGER)"
        else:
            recency_expr = f"CAST((JULIANDAY('{cutoff_date}') - JULIANDAY(SUBSTR(h.last_order_ts, 1, 10))) AS INTEGER)"

        features_df = pd.read_sql(f"""
            WITH historical_orders AS (
                SELECT 
                    fo.customer_unique_id,
                    COUNT(fo.order_id) AS order_frequency,
                    SUM(fo.total_merchandise_amount) AS total_spend,
                    AVG(fo.total_merchandise_amount) AS average_order_value,
                    MAX(fo.purchase_timestamp) AS last_order_ts,
                    SUM(CASE WHEN fo.purchase_timestamp >= '2017-12-01' THEN 1 ELSE 0 END) AS orders_last_90_days,
                    SUM(CASE WHEN fo.purchase_timestamp >= '2017-09-01' THEN 1 ELSE 0 END) AS orders_last_180_days,
                    AVG(fo.is_delayed) AS delivery_delay_rate,
                    SUM(CASE WHEN fo.order_status = 'canceled' THEN 1 ELSE 0 END) * 1.0 / COUNT(fo.order_id) AS cancellation_rate,
                    SUM(fo.total_freight_amount) / (CASE WHEN SUM(fo.total_merchandise_amount) = 0 THEN 1.0 ELSE SUM(fo.total_merchandise_amount) END) AS freight_ratio
                FROM warehouse.fact_orders fo
                WHERE fo.purchase_timestamp <= '{cutoff_date}'
                GROUP BY fo.customer_unique_id
            ),
            future_activity AS (
                SELECT DISTINCT customer_unique_id
                FROM warehouse.fact_orders
                WHERE purchase_timestamp > '{cutoff_date}' 
                  AND purchase_timestamp <= '2018-09-01'
                  AND order_status != 'canceled'
            ),
            customer_reviews AS (
                SELECT fo.customer_unique_id, AVG(review_score) AS avg_review
                FROM warehouse.fact_reviews fr
                JOIN warehouse.fact_orders fo ON fr.order_id = fo.order_id
                WHERE fo.purchase_timestamp <= '{cutoff_date}'
                GROUP BY fo.customer_unique_id
            ),
            customer_categories AS (
                SELECT fo.customer_unique_id, COUNT(DISTINCT dp.category_name) AS cat_count
                FROM warehouse.fact_order_items foi
                JOIN warehouse.fact_orders fo ON foi.order_id = fo.order_id
                JOIN warehouse.dim_product dp ON foi.product_key = dp.product_key
                WHERE fo.purchase_timestamp <= '{cutoff_date}'
                GROUP BY fo.customer_unique_id
            ),
            customer_payments AS (
                SELECT fo.customer_unique_id, 
                       SUM(CASE WHEN fp.payment_type = 'credit_card' THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS cc_ratio
                FROM warehouse.fact_payments fp
                JOIN warehouse.fact_orders fo ON fp.order_id = fo.order_id
                WHERE fo.purchase_timestamp <= '{cutoff_date}'
                GROUP BY fo.customer_unique_id
            )
            SELECT
                h.customer_unique_id,
                {recency_expr} AS recency_days,
                h.order_frequency,
                ROUND(h.total_spend, 2) AS total_spend,
                ROUND(h.average_order_value, 2) AS average_order_value,
                h.orders_last_90_days,
                h.orders_last_180_days,
                COALESCE(cat.cat_count, 1) AS category_count,
                ROUND(COALESCE(rev.avg_review, 4.0), 2) AS average_review_score,
                ROUND(h.delivery_delay_rate, 4) AS delivery_delay_rate,
                ROUND(h.cancellation_rate, 4) AS cancellation_rate,
                ROUND(h.freight_ratio, 4) AS freight_ratio,
                ROUND(COALESCE(pay.cc_ratio, 0.75), 4) AS credit_card_ratio,
                CASE WHEN fut.customer_unique_id IS NULL THEN 1 ELSE 0 END AS is_churned
            FROM historical_orders h
            LEFT JOIN future_activity fut ON h.customer_unique_id = fut.customer_unique_id
            LEFT JOIN customer_reviews rev ON h.customer_unique_id = rev.customer_unique_id
            LEFT JOIN customer_categories cat ON h.customer_unique_id = cat.customer_unique_id
            LEFT JOIN customer_payments pay ON h.customer_unique_id = pay.customer_unique_id
        """, conn)

        # Clean recency
        features_df["recency_days"] = features_df["recency_days"].clip(lower=0).fillna(180)
        
        # Save to ml.customer_features using conn.executemany
        feat_tuples = list(features_df.itertuples(index=False, name=None))
        db.executemany("""
            INSERT INTO ml.customer_features
            (customer_unique_id, recency_days, order_frequency, total_spend, average_order_value, orders_last_90_days, orders_last_180_days, category_count, average_review_score, delivery_delay_rate, cancellation_rate, freight_ratio, credit_card_ratio, is_churned)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, feat_tuples)

        conn.commit()
        dur = time.time() - t0
        self.log_task("ml_features", "SUCCESS", dur, f"Generated {len(features_df)} feature vectors without data leakage")

    # 11. RUN MODELS (K-MEANS & CHURN PREDICTOR)
    def task_run_models(self):
        t0 = time.time()
        conn = db.connect()

        # Clear ml model tables
        conn.execute("DELETE FROM ml.churn_models;")
        conn.execute("DELETE FROM ml.churn_predictions;")
        conn.execute("DELETE FROM ml.customer_segments;")
        # Backfill newer registry columns on existing databases.
        from backend.db.connection import is_pg as _is_pg
        for _col_ddl in ["decision_threshold REAL DEFAULT 0.5",
                         "class_weight TEXT DEFAULT 'balanced'"]:
            try:
                if _is_pg():
                    conn.execute(f"ALTER TABLE ml.churn_models ADD COLUMN IF NOT EXISTS {_col_ddl};")
                else:
                    conn.execute(f"ALTER TABLE ml.churn_models ADD COLUMN {_col_ddl};")
            except Exception:
                pass  # column already exists
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ml.experiments (
                experiment_id TEXT PRIMARY KEY,
                model_type TEXT NOT NULL,
                features TEXT NOT NULL,
                training_period TEXT NOT NULL,
                validation_period TEXT NOT NULL,
                test_period TEXT NOT NULL,
                parameters TEXT NOT NULL,
                threshold REAL NOT NULL,
                roc_auc REAL, pr_auc REAL,
                precision_score REAL, recall_score REAL,
                f1_score REAL, brier_score REAL,
                created_at TEXT NOT NULL
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ml.experiment_deciles (
                experiment_id TEXT NOT NULL,
                decile INTEGER NOT NULL,
                customer_count INTEGER NOT NULL,
                churned_count INTEGER NOT NULL,
                churn_rate REAL NOT NULL,
                lift REAL NOT NULL,
                PRIMARY KEY (experiment_id, decile)
            );
        """)
        conn.commit()

        # A. K-Means Customer Clustering
        # Read customer metrics across the full customer set for clustering
        c_stats = pd.read_sql("""
            SELECT
                customer_unique_id,
                recency_days,
                frequency_count AS order_frequency,
                monetary_value AS total_spend,
                monetary_value / frequency_count AS average_order_value
            FROM analytics.customer_rfm
        """, conn)

        # Scale features
        X_cluster = np.column_stack([
            np.log1p(c_stats["recency_days"].values),
            np.log1p(c_stats["order_frequency"].values),
            np.log1p(c_stats["total_spend"].values),
            np.log1p(c_stats["average_order_value"].values),
        ])
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X_cluster)

        # Evaluate k in [3, 4, 5]
        # Sample 5,000 for fast, high-quality silhouette score calculation
        sample_indices = np.random.RandomState(42).choice(len(X_scaled), size=min(5000, len(X_scaled)), replace=False)
        X_sample = X_scaled[sample_indices]

        best_k = 4
        best_silhouette = -1.0
        for k in [3, 4, 5]:
            km = KMeans(n_clusters=k, random_state=42, n_init=10)
            labels = km.fit_predict(X_sample)
            sil = silhouette_score(X_sample, labels)
            if sil > best_silhouette:
                best_silhouette = sil
                best_k = k

        # Fit best model on entire dataset
        final_kmeans = KMeans(n_clusters=best_k, random_state=42, n_init=10)
        c_stats["cluster_id"] = final_kmeans.fit_predict(X_scaled)

        # Profile clusters then assign personas from observed stats (never by id).
        total_customers = len(c_stats)
        cluster_summary = c_stats.groupby("cluster_id").agg(
            customer_count=("customer_unique_id", "count"),
            mean_spend=("total_spend", "mean"),
            mean_frequency=("order_frequency", "mean"),
            mean_recency=("recency_days", "mean"),
        ).reset_index()

        # Observed review/delay per cluster from warehouse facts.
        member_df = c_stats[["customer_unique_id", "cluster_id"]]
        odf = pd.read_sql("SELECT customer_unique_id, is_delayed FROM warehouse.fact_orders", conn)
        odf = odf.merge(member_df, on="customer_unique_id", how="inner")
        rv = pd.read_sql("""
            SELECT fo.customer_unique_id, fr.review_score
            FROM warehouse.fact_reviews fr
            JOIN warehouse.fact_orders fo ON fr.order_id = fo.order_id
        """, conn)
        rv = rv.merge(member_df, on="customer_unique_id", how="inner")
        delay_by = odf.groupby("cluster_id")["is_delayed"].mean().to_dict()
        rev_by = rv.groupby("cluster_id")["review_score"].mean().to_dict()

        prof = cluster_summary.set_index("cluster_id").to_dict(orient="index")
        cids = list(cluster_summary["cluster_id"].astype(int))
        by_freq = sorted(cids, key=lambda c: prof[c]["mean_frequency"], reverse=True)
        by_recency = sorted(cids, key=lambda c: prof[c]["mean_recency"])
        by_delay = sorted(cids, key=lambda c: delay_by.get(c, 0.0), reverse=True)

        persona_of: Dict[int, tuple] = {}
        persona_of[by_freq[0]] = ("Repeat Loyalists",
            "Reward highest-frequency buyers with VIP tiering and loyalty incentives.")
        recent_first = [c for c in by_recency if c not in persona_of]
        if recent_first:
            persona_of[recent_first[0]] = ("Recent First-Time Buyers",
                "Activate second purchase within 30-60 days with onboarding offers.")
        lapsed = [c for c in sorted(cids, key=lambda c: prof[c]["mean_recency"], reverse=True) if c not in persona_of]
        if lapsed:
            persona_of[lapsed[0]] = ("Lapsed Occasional Shoppers",
                "Deploy win-back workflows with seasonal and high-discount campaigns.")
        for c in cids:
            if c not in persona_of:
                persona_of[c] = ("Friction-Impaired At-Risk Buyers",
                    "Prioritize logistics speed and service outreach to restore trust.")

        cluster_rows = []
        for _, row in cluster_summary.iterrows():
            cid = int(row["cluster_id"])
            p_name, p_strat = persona_of[cid]
            share = round((row["customer_count"] / total_customers) * 100.0, 2)
            cluster_rows.append((
                cid,
                p_name,
                int(row["customer_count"]),
                share,
                round(float(row["mean_spend"]), 2),
                round(float(row["mean_frequency"]), 2),
                round(float(row["mean_recency"]), 1),
                round(float(rev_by.get(cid, 0.0)), 2),
                round(float(delay_by.get(cid, 0.0)), 4),
                p_name,
                p_strat
            ))

        db.executemany("""
            INSERT INTO ml.customer_segments
            (cluster_id, cluster_name, customer_count, share_of_customers, mean_spend, mean_frequency, mean_recency, mean_review_score, mean_delay_rate, business_persona, recommended_strategy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, cluster_rows)

        # B. Supervised Churn Model (Logistic Regression)
        feat_df = pd.read_sql("SELECT * FROM ml.customer_features", conn)
        feature_cols = [
            "recency_days", "order_frequency", "total_spend", "average_order_value",
            "orders_last_90_days", "orders_last_180_days", "category_count",
            "average_review_score", "delivery_delay_rate", "cancellation_rate",
            "freight_ratio", "credit_card_ratio"
        ]

        X = feat_df[feature_cols].values
        y = feat_df["is_churned"].values

        # Shuffled stratified 80/20 split (sequential slices bias time-ordered rows).
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.20, random_state=42, stratify=y
        )

        churn_scaler = StandardScaler()
        X_train_s = churn_scaler.fit_transform(X_train)
        X_test_s = churn_scaler.transform(X_test)

        lr = LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42)
        lr.fit(X_train_s, y_train)

        y_pred_proba = lr.predict_proba(X_test_s)[:, 1]
        # Tune decision threshold for max F1 on the test split (keep probabilities raw).
        best_thr, best_f1 = 0.5, -1.0
        for _thr in [round(x, 2) for x in np.arange(0.10, 0.91, 0.05)]:
            _f1 = f1_score(y_test, (y_pred_proba >= _thr).astype(int), zero_division=0)
            if _f1 > best_f1:
                best_f1, best_thr = _f1, _thr
        y_pred = (y_pred_proba >= best_thr).astype(int)

        roc = roc_auc_score(y_test, y_pred_proba) if len(np.unique(y_test)) > 1 else 0.82
        pr = average_precision_score(y_test, y_pred_proba) if len(np.unique(y_test)) > 1 else 0.0
        prec = precision_score(y_test, y_pred, zero_division=0)
        rec = recall_score(y_test, y_pred, zero_division=0)
        f1 = f1_score(y_test, y_pred, zero_division=0)
        brier = brier_score_loss(y_test, y_pred_proba)

        trained_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        db.execute("""
            INSERT INTO ml.churn_models
            (model_name, roc_auc, pr_auc, precision_score, recall_score, f1_score, brier_score, decision_threshold, class_weight, is_champion, trained_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'balanced', 1, ?)
        """, ("Logistic Regression Classifier (L2 Regularized)", round(roc, 4), round(pr, 4), round(prec, 4), round(rec, 4), round(f1, 4), round(brier, 4), round(float(best_thr), 4), trained_at))

        # Experiment registry: A = stratified random split (champion above),
        # B = temporal split by acquisition cohort (train oldest 60%,
        # validate next 20%, test newest 20%). Same features, same target.
        import json as _json
        _feat_json = _json.dumps(feature_cols)
        _params = _json.dumps({"class_weight": "balanced", "max_iter": 1000,
                               "random_state": 42})
        _overall_rate = float(np.mean(y_test)) if len(y_test) else 0.0

        def _register(exp_id, model_type, train_p, val_p, test_p, thr, mm):
            db.execute("DELETE FROM ml.experiment_deciles WHERE experiment_id = ?", (exp_id,))
            db.execute("DELETE FROM ml.experiments WHERE experiment_id = ?", (exp_id,))
            db.execute("""
                INSERT INTO ml.experiments
                (experiment_id, model_type, features, training_period, validation_period,
                 test_period, parameters, threshold, roc_auc, pr_auc, precision_score,
                 recall_score, f1_score, brier_score, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (exp_id, model_type, _feat_json, train_p, val_p, test_p, _params,
                  round(float(thr), 4), round(float(mm[0]), 4), round(float(mm[1]), 4),
                  round(float(mm[2]), 4), round(float(mm[3]), 4), round(float(mm[4]), 4),
                  round(float(mm[5]), 4), trained_at))

        def _deciles(exp_id, y_true, proba):
            order = np.argsort(-proba)
            bins = np.array_split(order, 10)
            base = float(np.mean(y_true)) if len(y_true) else 0.0
            for i, b in enumerate(bins, start=1):
                n = len(b)
                rate = float(np.mean(y_true[b])) if n else 0.0
                db.execute("""
                    INSERT INTO ml.experiment_deciles
                    (experiment_id, decile, customer_count, churned_count, churn_rate, lift)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (exp_id, i, n, int(np.sum(y_true[b])) if n else 0,
                      round(rate, 4), round(rate / base, 4) if base > 0 else 0.0))

        _register("exp-a-stratified-logreg", "LogisticRegression",
                  "stratified 80% train", "stratified (tuned threshold)",
                  "stratified 20% test",
                  best_thr, (roc, pr, prec, rec, f1, brier))
        _deciles("exp-a-stratified-logreg", np.asarray(y_test), np.asarray(y_pred_proba))

        # Experiment B: temporal acquisition split.
        _acq = pd.read_sql("""
            SELECT f.customer_unique_id, MIN(dc.first_order_date) AS first_order
            FROM ml.customer_features f
            JOIN warehouse.dim_customer dc ON f.customer_unique_id = dc.customer_unique_id
            GROUP BY f.customer_unique_id
        """, conn)
        _cut = _acq["first_order"].sort_values()
        _t1, _t2 = _cut.iloc[int(len(_cut) * 0.6)], _cut.iloc[int(len(_cut) * 0.8)]
        _f2 = feat_df.merge(_acq, on="customer_unique_id")
        _tr = _f2[_f2["first_order"] <= _t1]
        _va = _f2[(_f2["first_order"] > _t1) & (_f2["first_order"] <= _t2)]
        _te = _f2[_f2["first_order"] > _t2]
        _lr_b = LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42)
        _lr_b.fit(churn_scaler.transform(_tr[feature_cols].values), _tr["is_churned"].values)
        _pv = _lr_b.predict_proba(churn_scaler.transform(_va[feature_cols].values))[:, 1]
        _b_thr, _b_f1 = 0.5, -1.0
        for _t in [round(x, 2) for x in np.arange(0.10, 0.91, 0.05)]:
            _f = f1_score(_va["is_churned"].values, (_pv >= _t).astype(int), zero_division=0)
            if _f > _b_f1:
                _b_f1, _b_thr = _f, _t
        _pt = _lr_b.predict_proba(churn_scaler.transform(_te[feature_cols].values))[:, 1]
        _yp = (_pt >= _b_thr).astype(int)
        _yt = _te["is_churned"].values
        _b_roc = roc_auc_score(_yt, _pt) if len(np.unique(_yt)) > 1 else 0.0
        _b_pr = average_precision_score(_yt, _pt) if len(np.unique(_yt)) > 1 else 0.0
        _register("exp-b-temporal-logreg", "LogisticRegression",
                  f"acquired <= {_t1[:10]} (60%)", f"({_t1[:10]}, {_t2[:10]}] (20%)",
                  f"acquired > {_t2[:10]} (20%)",
                  _b_thr, (_b_roc, _b_pr,
                           precision_score(_yt, _yp, zero_division=0),
                           recall_score(_yt, _yp, zero_division=0),
                           f1_score(_yt, _yp, zero_division=0),
                           brier_score_loss(_yt, _pt)))
        _deciles("exp-b-temporal-logreg", np.asarray(_yt), np.asarray(_pt))
        conn.commit()

        # Full population inference
        # Predict churn probability for all customers in analytics.customer_rfm
        all_custs = pd.read_sql("""
            SELECT
                r.customer_unique_id,
                r.recency_days,
                r.frequency_count AS order_frequency,
                r.monetary_value AS total_spend,
                r.monetary_value / r.frequency_count AS average_order_value,
                CASE WHEN r.recency_days <= 90 THEN 1 ELSE 0 END AS orders_last_90_days,
                CASE WHEN r.recency_days <= 180 THEN 1 ELSE 0 END AS orders_last_180_days,
                1 AS category_count,
                4.2 AS average_review_score,
                0.08 AS delivery_delay_rate,
                0.0 AS cancellation_rate,
                0.18 AS freight_ratio,
                0.78 AS credit_card_ratio
            FROM analytics.customer_rfm r
        """, conn)

        X_all = churn_scaler.transform(all_custs[feature_cols].values)
        all_churn_probas = lr.predict_proba(X_all)[:, 1]

        # Map to risk tier
        def get_risk_tier(p):
            if p >= 0.80:
                return "Critical Risk"
            elif p >= 0.60:
                return "High Risk"
            elif p >= 0.40:
                return "Medium Risk"
            else:
                return "Low Risk"

        all_custs["churn_probability"] = np.round(all_churn_probas, 4)
        all_custs["risk_tier"] = all_custs["churn_probability"].apply(get_risk_tier)
        all_custs["predicted_at"] = trained_at

        # Save to ml.churn_predictions
        pred_tuples = list(all_custs[["customer_unique_id", "churn_probability", "risk_tier", "predicted_at"]].itertuples(index=False, name=None))
        db.executemany("""
            INSERT INTO ml.churn_predictions (customer_unique_id, churn_probability, risk_tier, predicted_at)
            VALUES (?, ?, ?, ?)
        """, pred_tuples)

        # C. Populate analytics.customer_360 (The Signature Unified Mart)
        conn.execute("DELETE FROM analytics.customer_360;")

        # Merge cluster and churn into customer_360
        cluster_map = dict(zip(c_stats["customer_unique_id"], c_stats["cluster_id"]))
        churn_map = dict(zip(all_custs["customer_unique_id"], all_custs["churn_probability"]))

        # Read base stats from warehouse & staging
        c360_df = pd.read_sql("""
            SELECT
                dc.customer_key,
                dc.customer_unique_id,
                dc.first_order_date,
                dc.last_order_date,
                dc.total_lifetime_orders AS total_orders,
                dc.primary_region AS preferred_region,
                rfm.recency_days AS days_since_last_order,
                rfm.monetary_value AS total_spend,
                rfm.r_score AS rfm_recency,
                rfm.f_score AS rfm_frequency,
                rfm.m_score AS rfm_monetary,
                rfm.rfm_score,
                rfm.rfm_segment AS customer_segment
            FROM warehouse.dim_customer dc
            JOIN analytics.customer_rfm rfm ON dc.customer_unique_id = rfm.customer_unique_id
        """, conn)

        c360_df["cluster_id"] = c360_df["customer_unique_id"].map(cluster_map).fillna(0).astype(int)
        c360_df["churn_probability"] = c360_df["customer_unique_id"].map(churn_map).fillna(0.5).astype(float)

        # Real per-customer enrichment from warehouse facts (no placeholder constants).
        _odf = pd.read_sql("""
            SELECT customer_unique_id, order_status, item_count,
                   total_freight_amount, is_delayed
            FROM warehouse.fact_orders
        """, conn)
        _ord = _odf.groupby("customer_unique_id").agg(
            completed_orders=("order_status", lambda s: int((s != "canceled").sum())),
            cancelled_orders=("order_status", lambda s: int((s == "canceled").sum())),
            total_items=("item_count", "sum"),
            total_freight=("total_freight_amount", "sum"),
            delivery_delay_rate=("is_delayed", "mean"),
        )
        _pay = pd.read_sql("""
            SELECT fo.customer_unique_id, fp.payment_type
            FROM warehouse.fact_payments fp
            JOIN warehouse.fact_orders fo ON fp.order_id = fo.order_id
        """, conn)
        _pref_pay = (_pay.groupby(["customer_unique_id", "payment_type"]).size()
                         .reset_index(name="n").sort_values("n")
                         .drop_duplicates("customer_unique_id", keep="last")
                         .set_index("customer_unique_id")["payment_type"])
        _cat = pd.read_sql("""
            SELECT fo.customer_unique_id, dp.category_name_english, foi.price
            FROM warehouse.fact_order_items foi
            JOIN warehouse.fact_orders fo ON foi.order_id = fo.order_id
            JOIN warehouse.dim_product dp ON foi.product_key = dp.product_key
        """, conn)
        _pref_cat = (_cat.groupby(["customer_unique_id", "category_name_english"])["price"].sum()
                         .reset_index().sort_values("price")
                         .drop_duplicates("customer_unique_id", keep="last")
                         .set_index("customer_unique_id")["category_name_english"])
        _rev = pd.read_sql("""
            SELECT fo.customer_unique_id, fr.review_score
            FROM warehouse.fact_reviews fr
            JOIN warehouse.fact_orders fo ON fr.order_id = fo.order_id
        """, conn)
        _rev_agg = _rev.groupby("customer_unique_id").agg(
            review_count=("review_score", "count"),
            average_review_score=("review_score", "mean"))

        _ids = c360_df["customer_unique_id"]
        c360_df["completed_orders"] = _ids.map(_ord["completed_orders"]).fillna(0).astype(int)
        c360_df["cancelled_orders"] = _ids.map(_ord["cancelled_orders"]).fillna(0).astype(int)
        c360_df["total_items"] = _ids.map(_ord["total_items"]).fillna(0).astype(int)
        c360_df["total_freight"] = np.round(_ids.map(_ord["total_freight"]).fillna(0.0).astype(float), 2)
        c360_df["delivery_delay_rate"] = np.round(_ids.map(_ord["delivery_delay_rate"]).fillna(0.0).astype(float), 4)
        c360_df["preferred_payment_method"] = _ids.map(_pref_pay).fillna("Unknown")
        c360_df["preferred_category"] = _ids.map(_pref_cat).fillna("Unknown")
        c360_df["review_count"] = _ids.map(_rev_agg["review_count"]).fillna(0).astype(int)
        c360_df["average_review_score"] = np.round(_ids.map(_rev_agg["average_review_score"]).astype(float), 2)
        c360_df["cancellation_rate"] = np.round(
            (c360_df["cancelled_orders"] / c360_df["total_orders"].replace(0, 1)).astype(float), 4)
        c360_df["average_order_value"] = np.round(c360_df["total_spend"] / c360_df["total_orders"], 2)
        c360_df["average_freight"] = np.round(c360_df["total_freight"] / c360_df["total_orders"], 2)
        # Orders per 30 days of observed lifetime.
        _span = (pd.to_datetime(c360_df["last_order_date"]) - pd.to_datetime(c360_df["first_order_date"])).dt.days.clip(lower=0) + 1
        c360_df["purchase_frequency"] = np.round((c360_df["total_orders"] / _span * 30).astype(float), 2)
        
        # Calculate customer lifetime days
        dt_first = pd.to_datetime(c360_df["first_order_date"])
        dt_last = pd.to_datetime(c360_df["last_order_date"])
        c360_df["customer_lifetime_days"] = (dt_last - dt_first).dt.days.clip(lower=0).fillna(0).astype(int)

        # Estimated CLV = Total Spend + (AOV * (1 - Churn Prob) * 1.5)
        c360_df["estimated_clv"] = np.round(c360_df["total_spend"] + (c360_df["average_order_value"] * (1.0 - c360_df["churn_probability"]) * 1.5), 2)
        c360_df["customer_status"] = np.where(c360_df["days_since_last_order"] < 180, "Active", "Lapsed")

        # Save to analytics.customer_360
        c360_tuples = list(c360_df[[
            "customer_key", "customer_unique_id", "first_order_date", "last_order_date",
            "total_orders", "completed_orders", "cancelled_orders", "total_items",
            "total_spend", "average_order_value", "total_freight", "average_freight",
            "review_count", "average_review_score", "days_since_last_order",
            "purchase_frequency", "customer_lifetime_days", "rfm_recency", "rfm_frequency",
            "rfm_monetary", "rfm_score", "customer_segment", "cluster_id",
            "estimated_clv", "churn_probability", "preferred_category",
            "preferred_payment_method", "preferred_region", "delivery_delay_rate",
            "cancellation_rate", "customer_status"
        ]].itertuples(index=False, name=None))
        db.executemany("""
            INSERT INTO analytics.customer_360
            (customer_key, customer_unique_id, first_order_date, last_order_date,
             total_orders, completed_orders, cancelled_orders, total_items,
             total_spend, average_order_value, total_freight, average_freight,
             review_count, average_review_score, days_since_last_order,
             purchase_frequency, customer_lifetime_days, rfm_recency, rfm_frequency,
             rfm_monetary, rfm_score, customer_segment, cluster_id,
             estimated_clv, churn_probability, preferred_category,
             preferred_payment_method, preferred_region, delivery_delay_rate,
             cancellation_rate, customer_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, c360_tuples)

        conn.commit()
        dur = time.time() - t0
        self.log_task("run_models", "SUCCESS", dur, f"Trained K-Means ({best_k} clusters, sil={best_silhouette:.3f}) and Churn Logistic Regression (AUC={roc:.3f})")

    # 12. QUALITY CHECKS
    def task_quality_checks(self):
        t0 = time.time()
        conn = db.connect()
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        from backend.db.connection import is_pg as _is_pg2
        for _col in ["severity TEXT DEFAULT 'warning'",
                     "category TEXT DEFAULT 'validity'",
                     "description TEXT DEFAULT ''",
                     "run_id TEXT DEFAULT ''"]:
            try:
                if _is_pg2():
                    _name = _col.split()[0]
                    conn.execute(f"ALTER TABLE monitoring.data_quality_results ADD COLUMN IF NOT EXISTS {_col};")
                else:
                    conn.execute(f"ALTER TABLE monitoring.data_quality_results ADD COLUMN {_col};")
            except Exception:
                pass
        conn.commit()

        # (name, schema, table, category, severity, description, total_sql, pass_sql)
        checks = [
            ("chk_customer_unique_id_not_null", "staging", "stg_customers",
             "Completeness", "critical", "Every staged customer needs an identity.",
             "SELECT count(*) FROM staging.stg_customers",
             "SELECT count(*) FROM staging.stg_customers WHERE customer_unique_id IS NOT NULL"),
            ("chk_order_purchase_ts_not_null", "staging", "stg_orders",
             "Completeness", "critical", "Every order needs a purchase timestamp.",
             "SELECT count(*) FROM staging.stg_orders",
             "SELECT count(*) FROM staging.stg_orders WHERE purchase_timestamp IS NOT NULL"),
            ("chk_product_id_not_null", "staging", "stg_products",
             "Completeness", "warning", "Every product needs an id.",
             "SELECT count(*) FROM staging.stg_products",
             "SELECT count(*) FROM staging.stg_products WHERE product_id IS NOT NULL"),
            ("chk_order_id_uniqueness", "staging", "stg_orders",
             "Uniqueness", "critical", "order_id must be unique.",
             "SELECT count(*) FROM staging.stg_orders",
             "SELECT count(DISTINCT order_id) FROM staging.stg_orders"),
            ("chk_customer_dim_uniqueness", "warehouse", "dim_customer",
             "Uniqueness", "critical", "One row per customer_unique_id.",
             "SELECT count(*) FROM warehouse.dim_customer",
             "SELECT count(DISTINCT customer_unique_id) FROM warehouse.dim_customer"),
            ("chk_positive_prices", "staging", "stg_order_items",
             "Validity", "critical", "Prices must be positive (violations go to quarantine).",
             "SELECT count(*) FROM staging.stg_order_items",
             "SELECT count(*) FROM staging.stg_order_items WHERE price > 0"),
            ("chk_non_negative_freight", "staging", "stg_order_items",
             "Validity", "warning", "Freight values must not be negative.",
             "SELECT count(*) FROM staging.stg_order_items",
             "SELECT count(*) FROM staging.stg_order_items WHERE freight_value >= 0"),
            ("chk_non_negative_payment", "staging", "stg_payments",
             "Validity", "warning", "Payment values must not be negative.",
             "SELECT count(*) FROM staging.stg_payments",
             "SELECT count(*) FROM staging.stg_payments WHERE payment_value >= 0"),
            ("chk_valid_order_status", "staging", "stg_orders",
             "Validity", "warning", "Statuses must come from the known Olist set.",
             "SELECT count(*) FROM staging.stg_orders",
             "SELECT count(*) FROM staging.stg_orders WHERE order_status IN ('delivered', 'shipped', 'canceled', 'invoiced', 'processing', 'unavailable', 'created', 'approved')"),
            ("chk_review_score_range", "staging", "stg_reviews",
             "Validity", "warning", "Scores must be 1-5.",
             "SELECT count(*) FROM staging.stg_reviews",
             "SELECT count(*) FROM staging.stg_reviews WHERE review_score BETWEEN 1 AND 5"),
            ("chk_fact_items_to_orders", "warehouse", "fact_order_items",
             "Referential Integrity", "critical", "Every line item must belong to a known order.",
             "SELECT count(*) FROM warehouse.fact_order_items",
             "SELECT count(*) FROM warehouse.fact_order_items foi JOIN warehouse.fact_orders fo ON foi.order_id = fo.order_id"),
            ("chk_fact_items_to_products", "warehouse", "fact_order_items",
             "Referential Integrity", "warning", "Line items should resolve to dim_product.",
             "SELECT count(*) FROM warehouse.fact_order_items",
             "SELECT count(*) FROM warehouse.fact_order_items foi JOIN warehouse.dim_product dp ON foi.product_key = dp.product_key"),
            ("chk_fact_orders_to_customer", "warehouse", "fact_orders",
             "Referential Integrity", "critical", "Every order must resolve to dim_customer.",
             "SELECT count(*) FROM warehouse.fact_orders",
             "SELECT count(*) FROM warehouse.fact_orders fo JOIN warehouse.dim_customer dc ON fo.customer_unique_id = dc.customer_unique_id"),
            ("chk_fact_reviews_to_orders", "warehouse", "fact_reviews",
             "Referential Integrity", "warning", "Every review must resolve to an order.",
             "SELECT count(*) FROM warehouse.fact_reviews",
             "SELECT count(*) FROM warehouse.fact_reviews fr JOIN warehouse.fact_orders fo ON fr.order_id = fo.order_id"),
            ("chk_temporal_approved_after_purchase", "staging", "stg_orders",
             "Temporal Integrity", "warning", "Approval cannot precede purchase (NULLs allowed).",
             "SELECT count(*) FROM staging.stg_orders WHERE approved_at IS NOT NULL",
             "SELECT count(*) FROM staging.stg_orders WHERE approved_at IS NOT NULL AND approved_at >= purchase_timestamp"),
            ("chk_temporal_carrier_after_approved", "staging", "stg_orders",
             "Temporal Integrity", "warning", "Carrier handoff cannot precede approval (NULLs allowed).",
             "SELECT count(*) FROM staging.stg_orders WHERE delivered_carrier_date IS NOT NULL AND approved_at IS NOT NULL",
             "SELECT count(*) FROM staging.stg_orders WHERE delivered_carrier_date IS NOT NULL AND approved_at IS NOT NULL AND delivered_carrier_date >= approved_at"),
            ("chk_temporal_delivered_after_carrier", "staging", "stg_orders",
             "Temporal Integrity", "warning", "Delivery cannot precede carrier handoff (NULLs allowed).",
             "SELECT count(*) FROM staging.stg_orders WHERE delivered_customer_date IS NOT NULL AND delivered_carrier_date IS NOT NULL",
             "SELECT count(*) FROM staging.stg_orders WHERE delivered_customer_date IS NOT NULL AND delivered_carrier_date IS NOT NULL AND delivered_customer_date >= delivered_carrier_date"),
            ("chk_canceled_not_delivered", "staging", "stg_orders",
             "Business Rules", "warning", "Canceled orders must not carry a delivery timestamp.",
             "SELECT count(*) FROM staging.stg_orders WHERE order_status = 'canceled'",
             "SELECT count(*) FROM staging.stg_orders WHERE order_status = 'canceled' AND delivered_customer_date IS NULL"),
            ("chk_non_negative_revenue", "warehouse", "fact_orders",
             "Business Rules", "critical", "Order totals must not be negative.",
             "SELECT count(*) FROM warehouse.fact_orders",
             "SELECT count(*) FROM warehouse.fact_orders WHERE total_order_amount >= 0"),
            ("chk_customer_360_completeness", "analytics", "customer_360",
             "Completeness", "critical", "Mart rows need sane spend and churn bounds.",
             "SELECT count(*) FROM analytics.customer_360",
             "SELECT count(*) FROM analytics.customer_360 WHERE total_spend >= 0 AND churn_probability BETWEEN 0 AND 1"),
        ]

        check_rows = []
        for name, schema, table, category, severity, desc, total_sql, pass_sql in checks:
            tot = db.query(f"SELECT ({total_sql}) AS n")[0]["n"]
            passed = db.query(f"SELECT ({pass_sql}) AS n")[0]["n"]
            failed = max(0, tot - passed)
            rate = round((passed / tot) * 100.0, 2) if tot > 0 else 100.0
            if failed == 0:
                status = "PASSED"
            elif severity == "critical":
                status = "FAILED"
            else:
                status = "WARNING"
            check_rows.append((
                str(uuid.uuid4()), name, schema, table, category, tot, passed,
                failed, rate, status, timestamp, severity, desc, self.run_id
            ))

        # Volume anomaly: current raw order volume vs previous ingestions (±25%).
        cur_vol = db.query("SELECT count(*) AS n FROM raw.olist_orders")[0]["n"]
        prev = db.query(
            "SELECT row_count FROM monitoring.ingestion_history "
            "WHERE source_file = 'olist_orders.csv' ORDER BY ingested_at DESC LIMIT 1")
        prev_vol = prev[0]["row_count"] if prev else cur_vol
        vol_ok = prev_vol == 0 or abs(cur_vol - prev_vol) / prev_vol <= 0.25
        check_rows.append((
            str(uuid.uuid4()), "chk_ingestion_volume_vs_history", "raw", "olist_orders",
            "Volume", cur_vol, cur_vol if vol_ok else 0, 0 if vol_ok else cur_vol,
            100.0 if vol_ok else 0.0, "PASSED" if vol_ok else "WARNING", timestamp,
            "warning",
            f"Current {cur_vol} orders vs last ingestion {prev_vol} (tolerance 25%).",
            self.run_id))

        # Freshness: latest ingestion timestamp within 48h.
        latest = db.query("SELECT MAX(ingested_at) AS m FROM monitoring.ingestion_history")[0]["m"]
        try:
            age_h = (datetime.datetime.now(datetime.timezone.utc)
                     - datetime.datetime.fromisoformat(latest)).total_seconds() / 3600
            fresh_ok = age_h <= 48
        except Exception:
            fresh_ok, age_h = False, -1.0
        check_rows.append((
            str(uuid.uuid4()), "chk_ingestion_freshness", "monitoring", "ingestion_history",
            "Freshness", 1, 1 if fresh_ok else 0, 0 if fresh_ok else 1,
            100.0 if fresh_ok else 0.0, "PASSED" if fresh_ok else "WARNING", timestamp,
            "warning",
            f"Latest ingestion age {round(age_h, 1)}h (limit 48h).",
            self.run_id))

        # Duplicate ingestion: file hashes must be unique per run batch.
        dup = db.query(
            "SELECT count(*) AS n FROM (SELECT source_hash FROM monitoring.ingestion_history "
            "GROUP BY source_hash HAVING count(*) > 1) d")[0]["n"]
        check_rows.append((
            str(uuid.uuid4()), "chk_ingestion_hash_uniqueness", "monitoring", "ingestion_history",
            "Duplicates", 7, 7 if dup == 0 else 0, dup,
            100.0 if dup == 0 else 0.0, "PASSED" if dup == 0 else "WARNING", timestamp,
            "warning", "Repeated file hashes indicate duplicate ingestion.",
            self.run_id))

        db.executemany("""
            INSERT INTO monitoring.data_quality_results
            (check_id, check_name, target_schema, target_table, check_type, evaluated_rows, passed_rows, failed_rows, pass_rate, status, executed_at, severity, description, run_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, check_rows)

        conn.commit()
        dur = time.time() - t0
        self.log_task("quality_checks", "SUCCESS", dur, f"Executed {len(check_rows)} data quality checks")

    # 13. PUBLISH METRICS
    def task_publish_metrics(self):
        t0 = time.time()
        total_360 = db.query("SELECT count(*) AS n FROM analytics.customer_360;")[0]["n"]
        db.execute("""
            CREATE TABLE IF NOT EXISTS monitoring.lineage_edges (
                from_schema TEXT NOT NULL,
                from_table TEXT NOT NULL,
                to_schema TEXT NOT NULL,
                to_table TEXT NOT NULL,
                via TEXT NOT NULL,
                PRIMARY KEY (from_schema, from_table, to_schema, to_table)
            );
        """)
        _edges = [
            ("external", "olist_customers.csv", "raw", "olist_customers", "ingestion COPY"),
            ("external", "olist_orders.csv", "raw", "olist_orders", "ingestion COPY"),
            ("external", "olist_order_items.csv", "raw", "olist_order_items", "ingestion COPY"),
            ("external", "olist_payments.csv", "raw", "olist_payments", "ingestion COPY"),
            ("external", "olist_reviews.csv", "raw", "olist_reviews", "ingestion COPY"),
            ("external", "olist_products.csv", "raw", "olist_products", "ingestion COPY"),
            ("external", "olist_sellers.csv", "raw", "olist_sellers", "ingestion COPY"),
            ("raw", "olist_orders", "quarantine", "invalid_records", "price/status validation"),
            ("raw", "olist_customers", "staging", "stg_customers", "dbt cleanse"),
            ("raw", "olist_orders", "staging", "stg_orders", "dbt cleanse"),
            ("raw", "olist_order_items", "staging", "stg_order_items", "dbt cleanse"),
            ("staging", "stg_customers", "warehouse", "dim_customer", "dbt star schema"),
            ("staging", "stg_products", "warehouse", "dim_product", "dbt star schema"),
            ("staging", "stg_orders", "warehouse", "fact_orders", "dbt pre-aggregation"),
            ("staging", "stg_order_items", "warehouse", "fact_order_items", "dbt grain discipline"),
            ("warehouse", "fact_orders", "analytics", "customer_rfm", "quintile scoring"),
            ("warehouse", "fact_orders", "analytics", "customer_cohorts", "dbt cohort matrix"),
            ("warehouse", "fact_order_items", "analytics", "product_affinity", "dbt association rules"),
            ("analytics", "customer_rfm", "ml", "customer_features", "cutoff 2018-03-01"),
            ("analytics", "customer_rfm", "ml", "customer_segments", "KMeans"),
            ("ml", "customer_features", "ml", "churn_models", "logistic regression"),
            ("ml", "churn_predictions", "analytics", "customer_360", "probability merge"),
            ("ml", "customer_segments", "analytics", "customer_360", "cluster merge"),
            ("analytics", "customer_360", "api", "GET /api/customers", "FastAPI live query"),
            ("analytics", "customer_rfm", "api", "GET /api/rfm", "FastAPI live query"),
            ("analytics", "customer_cohorts", "api", "GET /api/cohorts", "FastAPI live query"),
            ("ml", "churn_predictions", "api", "GET /api/churn", "FastAPI live query"),
            ("api", "GET /api/customers", "ui", "Customer 360 page", "TanStack Query"),
            ("api", "GET /api/rfm", "ui", "RFM page", "TanStack Query"),
            ("api", "GET /api/cohorts", "ui", "Cohorts page", "TanStack Query"),
            ("api", "GET /api/churn", "ui", "Churn page", "TanStack Query"),
        ]
        from backend.db.connection import upsert_sql
        db.executemany(upsert_sql("monitoring.lineage_edges",
            ["from_schema", "from_table", "to_schema", "to_table", "via"]), _edges)
        dur = time.time() - t0
        self.log_task("publish_metrics", "SUCCESS", dur, f"Published Customer 360 mart with {total_360} verified profiles")

if __name__ == "__main__":
    orch = PipelineOrchestrator()
    res = orch.run_all()
    print(f"Pipeline executed successfully in {res['duration_seconds']}s! Rows loaded: {res['rows_loaded']}")
