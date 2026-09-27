"""
Schema Initialization and DDL definitions.
Creates all tables across raw, staging, warehouse, analytics, ml, monitoring, and quarantine.
"""
from backend.db.connection import db, is_pg


def _run(cursor, sql: str) -> None:
    if is_pg():
        sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
    cursor.execute(sql)


def init_all_schemas():
    conn = db.connect()
    cursor = conn.cursor()
    run = lambda sql: _run(cursor, sql)

    if is_pg():
        for _schema in ["raw", "staging", "warehouse", "analytics", "ml", "monitoring", "quarantine"]:
            cursor.execute(f"CREATE SCHEMA IF NOT EXISTS {_schema};")
        # Compat: SQLite allows ROUND(float, int); Postgres only ROUND(numeric, int).
        cursor.execute("""
            CREATE OR REPLACE FUNCTION round(real, integer) RETURNS numeric AS
            'SELECT round($1::numeric, $2)' LANGUAGE sql IMMUTABLE;
        """)
        cursor.execute("""
            CREATE OR REPLACE FUNCTION round(double precision, integer) RETURNS numeric AS
            'SELECT round($1::numeric, $2)' LANGUAGE sql IMMUTABLE;
        """)

    # 1. QUARANTINE SCHEMA
    run("""
    CREATE TABLE IF NOT EXISTS quarantine.invalid_records (
        quarantine_id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        record_identifier TEXT,
        violation_code TEXT NOT NULL,
        violation_message TEXT NOT NULL,
        raw_payload TEXT,
        detected_at TEXT NOT NULL
    );
    """)

    # 2. MONITORING SCHEMA
    run("""
    CREATE TABLE IF NOT EXISTS monitoring.pipeline_runs (
        run_id TEXT PRIMARY KEY,
        pipeline_name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_seconds REAL,
        status TEXT NOT NULL,
        rows_read INTEGER DEFAULT 0,
        rows_loaded INTEGER DEFAULT 0,
        rows_rejected INTEGER DEFAULT 0,
        error_message TEXT
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS monitoring.pipeline_tasks (
        task_execution_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        status TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_seconds REAL,
        log_output TEXT
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS monitoring.ingestion_history (
        ingestion_id TEXT PRIMARY KEY,
        source_file TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        row_count INTEGER NOT NULL,
        ingested_at TEXT NOT NULL
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS monitoring.data_quality_results (
        check_id TEXT PRIMARY KEY,
        check_name TEXT NOT NULL,
        target_schema TEXT NOT NULL,
        target_table TEXT NOT NULL,
        check_type TEXT NOT NULL,
        evaluated_rows INTEGER NOT NULL,
        passed_rows INTEGER NOT NULL,
        failed_rows INTEGER NOT NULL,
        pass_rate REAL NOT NULL,
        status TEXT NOT NULL,
        executed_at TEXT NOT NULL,
        severity TEXT DEFAULT 'warning',
        category TEXT DEFAULT 'validity',
        description TEXT DEFAULT '',
        run_id TEXT DEFAULT ''
    );
    """)

    # 3. RAW SCHEMA
    run("""
    CREATE TABLE IF NOT EXISTS raw.olist_customers (
        customer_id TEXT PRIMARY KEY,
        customer_unique_id TEXT,
        customer_zip_code_prefix INTEGER,
        customer_city TEXT,
        customer_state TEXT,
        _ingestion_id TEXT,
        _source_file TEXT,
        _source_hash TEXT,
        _ingested_at TEXT,
        _source_row_number INTEGER
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS raw.olist_orders (
        order_id TEXT PRIMARY KEY,
        customer_id TEXT,
        order_status TEXT,
        order_purchase_timestamp TEXT,
        order_approved_at TEXT,
        order_delivered_carrier_date TEXT,
        order_delivered_customer_date TEXT,
        order_estimated_delivery_date TEXT,
        _ingestion_id TEXT,
        _source_file TEXT,
        _source_hash TEXT,
        _ingested_at TEXT,
        _source_row_number INTEGER
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS raw.olist_order_items (
        order_id TEXT,
        order_item_id INTEGER,
        product_id TEXT,
        seller_id TEXT,
        shipping_limit_date TEXT,
        price REAL,
        freight_value REAL,
        _ingestion_id TEXT,
        _source_file TEXT,
        _source_hash TEXT,
        _ingested_at TEXT,
        _source_row_number INTEGER,
        PRIMARY KEY (order_id, order_item_id)
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS raw.olist_payments (
        order_id TEXT,
        payment_sequential INTEGER,
        payment_type TEXT,
        payment_installments INTEGER,
        payment_value REAL,
        _ingestion_id TEXT,
        _source_file TEXT,
        _source_hash TEXT,
        _ingested_at TEXT,
        _source_row_number INTEGER,
        PRIMARY KEY (order_id, payment_sequential)
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS raw.olist_reviews (
        review_id TEXT,
        order_id TEXT,
        review_score INTEGER,
        review_comment_title TEXT,
        review_comment_message TEXT,
        review_creation_date TEXT,
        review_answer_timestamp TEXT,
        _ingestion_id TEXT,
        _source_file TEXT,
        _source_hash TEXT,
        _ingested_at TEXT,
        _source_row_number INTEGER
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS raw.olist_products (
        product_id TEXT PRIMARY KEY,
        product_category_name TEXT,
        product_name_lenght REAL,
        product_description_lenght REAL,
        product_photos_qty REAL,
        product_weight_g REAL,
        product_length_cm REAL,
        product_height_cm REAL,
        product_width_cm REAL,
        _ingestion_id TEXT,
        _source_file TEXT,
        _source_hash TEXT,
        _ingested_at TEXT,
        _source_row_number INTEGER
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS raw.olist_sellers (
        seller_id TEXT PRIMARY KEY,
        seller_zip_code_prefix INTEGER,
        seller_city TEXT,
        seller_state TEXT,
        _ingestion_id TEXT,
        _source_file TEXT,
        _source_hash TEXT,
        _ingested_at TEXT,
        _source_row_number INTEGER
    );
    """)

    # 4. STAGING SCHEMA
    run("""
    CREATE TABLE IF NOT EXISTS staging.stg_customers (
        customer_id TEXT PRIMARY KEY,
        customer_unique_id TEXT NOT NULL,
        zip_code_prefix INTEGER,
        city TEXT,
        state TEXT,
        region TEXT
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS staging.stg_orders (
        order_id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        order_status TEXT NOT NULL,
        purchase_timestamp TEXT NOT NULL,
        approved_at TEXT,
        delivered_carrier_date TEXT,
        delivered_customer_date TEXT,
        estimated_delivery_date TEXT NOT NULL,
        is_delivered INTEGER DEFAULT 0,
        is_canceled INTEGER DEFAULT 0
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS staging.stg_order_items (
        order_id TEXT NOT NULL,
        order_item_id INTEGER NOT NULL,
        product_id TEXT NOT NULL,
        seller_id TEXT NOT NULL,
        shipping_limit_date TEXT,
        price REAL NOT NULL,
        freight_value REAL NOT NULL,
        total_item_value REAL NOT NULL,
        PRIMARY KEY (order_id, order_item_id)
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS staging.stg_products (
        product_id TEXT PRIMARY KEY,
        category_name TEXT NOT NULL,
        category_name_english TEXT NOT NULL,
        photos_qty INTEGER DEFAULT 0,
        weight_g REAL DEFAULT 0.0
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS staging.stg_payments (
        order_id TEXT NOT NULL,
        payment_sequential INTEGER NOT NULL,
        payment_type TEXT NOT NULL,
        payment_installments INTEGER NOT NULL,
        payment_value REAL NOT NULL,
        PRIMARY KEY (order_id, payment_sequential)
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS staging.stg_reviews (
        review_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        review_score INTEGER NOT NULL,
        review_comment_title TEXT,
        review_comment_message TEXT,
        review_creation_date TEXT,
        review_answer_timestamp TEXT
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS staging.stg_sellers (
        seller_id TEXT PRIMARY KEY,
        zip_code_prefix INTEGER,
        city TEXT,
        state TEXT
    );
    """)

    # 5. WAREHOUSE SCHEMA
    run("""
    CREATE TABLE IF NOT EXISTS warehouse.dim_customer (
        customer_key INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_unique_id TEXT UNIQUE NOT NULL,
        primary_zip_code_prefix INTEGER,
        primary_city TEXT,
        primary_state TEXT,
        primary_region TEXT,
        first_order_date TEXT,
        last_order_date TEXT,
        total_lifetime_orders INTEGER DEFAULT 0
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS warehouse.dim_product (
        product_key INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id TEXT UNIQUE NOT NULL,
        category_name TEXT,
        category_name_english TEXT,
        photos_qty INTEGER,
        weight_g REAL
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS warehouse.dim_seller (
        seller_key INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_id TEXT UNIQUE NOT NULL,
        zip_code_prefix INTEGER,
        city TEXT,
        state TEXT
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS warehouse.dim_date (
        date_key INTEGER PRIMARY KEY,
        calendar_date TEXT UNIQUE NOT NULL,
        day_of_week INTEGER,
        day_name TEXT,
        month_number INTEGER,
        month_name TEXT,
        quarter INTEGER,
        year INTEGER,
        is_weekend INTEGER
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS warehouse.fact_orders (
        order_key INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT UNIQUE NOT NULL,
        customer_key INTEGER NOT NULL,
        customer_unique_id TEXT NOT NULL,
        order_status TEXT NOT NULL,
        purchase_timestamp TEXT NOT NULL,
        order_date_key INTEGER,
        delivered_customer_date TEXT,
        estimated_delivery_date TEXT,
        item_count INTEGER DEFAULT 0,
        total_merchandise_amount REAL DEFAULT 0.0,
        total_freight_amount REAL DEFAULT 0.0,
        total_order_amount REAL DEFAULT 0.0,
        delivery_delay_days REAL DEFAULT 0.0,
        is_delayed INTEGER DEFAULT 0
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS warehouse.fact_order_items (
        order_item_key INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        order_item_id INTEGER NOT NULL,
        customer_key INTEGER,
        customer_unique_id TEXT,
        product_key INTEGER,
        seller_key INTEGER,
        price REAL NOT NULL,
        freight_value REAL NOT NULL,
        total_amount REAL NOT NULL
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS warehouse.fact_payments (
        payment_key INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        customer_key INTEGER,
        payment_sequential INTEGER,
        payment_type TEXT,
        payment_installments INTEGER,
        payment_value REAL
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS warehouse.fact_reviews (
        review_key INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        customer_key INTEGER,
        review_score INTEGER NOT NULL,
        review_comment_message TEXT,
        review_creation_date TEXT
    );
    """)

    # 6. ANALYTICS SCHEMA
    run("""
    CREATE TABLE IF NOT EXISTS analytics.customer_360 (
        customer_key INTEGER PRIMARY KEY,
        customer_unique_id TEXT UNIQUE NOT NULL,
        first_order_date TEXT,
        last_order_date TEXT,
        total_orders INTEGER DEFAULT 0,
        completed_orders INTEGER DEFAULT 0,
        cancelled_orders INTEGER DEFAULT 0,
        total_items INTEGER DEFAULT 0,
        total_spend REAL DEFAULT 0.0,
        average_order_value REAL DEFAULT 0.0,
        total_freight REAL DEFAULT 0.0,
        average_freight REAL DEFAULT 0.0,
        review_count INTEGER DEFAULT 0,
        average_review_score REAL DEFAULT 0.0,
        days_since_last_order INTEGER DEFAULT 0,
        purchase_frequency REAL DEFAULT 0.0,
        customer_lifetime_days INTEGER DEFAULT 0,
        rfm_recency INTEGER DEFAULT 1,
        rfm_frequency INTEGER DEFAULT 1,
        rfm_monetary INTEGER DEFAULT 1,
        rfm_score TEXT DEFAULT '111',
        customer_segment TEXT DEFAULT 'Lost',
        cluster_id INTEGER DEFAULT 0,
        estimated_clv REAL DEFAULT 0.0,
        churn_probability REAL DEFAULT 0.5,
        preferred_category TEXT DEFAULT 'uncategorized',
        preferred_payment_method TEXT DEFAULT 'credit_card',
        preferred_region TEXT DEFAULT 'Sudeste',
        delivery_delay_rate REAL DEFAULT 0.0,
        cancellation_rate REAL DEFAULT 0.0,
        customer_status TEXT DEFAULT 'Active'
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS analytics.customer_rfm (
        customer_unique_id TEXT PRIMARY KEY,
        recency_days INTEGER NOT NULL,
        frequency_count INTEGER NOT NULL,
        monetary_value REAL NOT NULL,
        r_score INTEGER NOT NULL,
        f_score INTEGER NOT NULL,
        m_score INTEGER NOT NULL,
        rfm_score TEXT NOT NULL,
        rfm_segment TEXT NOT NULL
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS analytics.customer_cohorts (
        cohort_month TEXT NOT NULL,
        period_number INTEGER NOT NULL,
        cohort_size INTEGER NOT NULL,
        active_customers INTEGER NOT NULL,
        retention_rate REAL NOT NULL,
        total_period_revenue REAL DEFAULT 0.0,
        PRIMARY KEY (cohort_month, period_number)
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS analytics.product_affinity (
        rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
        antecedent TEXT NOT NULL,
        consequent TEXT NOT NULL,
        antecedent_support REAL NOT NULL,
        consequent_support REAL NOT NULL,
        support REAL NOT NULL,
        confidence REAL NOT NULL,
        lift REAL NOT NULL
    );
    """)

    # 7. ML SCHEMA
    run("""
    CREATE TABLE IF NOT EXISTS ml.customer_features (
        customer_unique_id TEXT PRIMARY KEY,
        recency_days INTEGER,
        order_frequency INTEGER,
        total_spend REAL,
        average_order_value REAL,
        orders_last_90_days INTEGER,
        orders_last_180_days INTEGER,
        category_count INTEGER,
        average_review_score REAL,
        delivery_delay_rate REAL,
        cancellation_rate REAL,
        freight_ratio REAL,
        credit_card_ratio REAL,
        is_churned INTEGER
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS ml.churn_models (
        model_name TEXT PRIMARY KEY,
        roc_auc REAL NOT NULL,
        pr_auc REAL NOT NULL,
        precision_score REAL NOT NULL,
        recall_score REAL NOT NULL,
        f1_score REAL NOT NULL,
        brier_score REAL NOT NULL,
        decision_threshold REAL DEFAULT 0.5,
        class_weight TEXT DEFAULT 'balanced',
        is_champion INTEGER DEFAULT 0,
        trained_at TEXT NOT NULL
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS ml.churn_predictions (
        customer_unique_id TEXT PRIMARY KEY,
        churn_probability REAL NOT NULL,
        risk_tier TEXT NOT NULL,
        predicted_at TEXT NOT NULL
    );
    """)

    run("""
    CREATE TABLE IF NOT EXISTS ml.customer_segments (
        cluster_id INTEGER PRIMARY KEY,
        cluster_name TEXT NOT NULL,
        customer_count INTEGER NOT NULL,
        share_of_customers REAL NOT NULL,
        mean_spend REAL NOT NULL,
        mean_frequency REAL NOT NULL,
        mean_recency REAL NOT NULL,
        mean_review_score REAL NOT NULL,
        mean_delay_rate REAL NOT NULL,
        business_persona TEXT NOT NULL,
        recommended_strategy TEXT NOT NULL
    );
    """)

    conn.commit()
    print("All 7 schemas and tables initialized successfully!")

if __name__ == "__main__":
    init_all_schemas()
