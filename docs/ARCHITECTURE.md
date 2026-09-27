# Customer360 Architecture

## 1. System Overview
Customer360 is organized into 5 primary logical tiers:
1. **Source / Ingestion Layer**: Ingests Olist Brazilian E-Commerce raw CSV data, generates ingestion hashes (`_source_hash`), assigns monotonic ingestion IDs and timestamps (`_ingested_at`, `_source_row_number`), and stores exact raw payloads into the `raw.*` schema.
2. **Data Cleansing, Quality & Quarantine Layer**: Validates column types, foreign key referential integrity, range boundaries, null limits, and geographic formats. Offending records are diverted to `quarantine.invalid_records` with failure reason metadata. Valid records are normalized and written to `staging.stg_*`.
3. **Dimensional Warehouse (Star Schema)**: Implements conformed dimensions (`dim_customer`, `dim_product`, `dim_seller`, `dim_geography`, `dim_date`) and granular facts (`fact_orders`, `fact_order_items`, `fact_payments`, `fact_reviews`) in the `warehouse.*` schema.
4. **Analytics Marts & Feature Store**:
   - `analytics.customer_360`: Unified customer 360 view aggregating order counts, completed/canceled orders, gross merchandise value (GMV), freight, review sentiments, delivery delay rates, preferred categories/payment methods, RFM scores, and predicted churn.
   - `analytics.customer_rfm`: Standardized quintile scoring (1 to 5) for Recency, Frequency, and Monetary dimensions.
   - `analytics.customer_cohorts`: Monthly acquisition cohorts tracking cohort customer retention over time.
   - `ml.customer_features` & `ml.churn_predictions`: Supervised churn model inference and K-Means segmentation results with silhouette metrics.
   - `monitoring.pipeline_runs`, `monitoring.pipeline_tasks`, `monitoring.data_quality_results`: Full observability of execution health, task durations, row counts, and data quality check passes.
5. **Serving Layer (REST API & Web UI)**:
   - High-throughput REST API serving endpoints for customer profiles, RFM segments, cohort matrices, churn predictions, affinity rules, pipeline logs, and data quality dashboards.
   - Enterprise React UI with responsive typography, interactive data tables, Recharts visualizations, and customer drilldowns.

---

## 2. Architecture Diagram (ASCII)

```
[Raw Sources: Olist CSV Datasets]
       |
       v
[Ingestion Pipeline (Airflow DAG)]
       |
       +---> [raw.* schemas + _ingestion_metadata]
       |
       v
[Data Quality Gate & Quarantine] ---> [quarantine.invalid_records]
       |
       v
[staging.stg_* Normalized Tables]
       |
       v
[dbt Transformation Engine]
       |
       +---> [warehouse.dim_* (customer, product, seller, geo, date)]
       +---> [warehouse.fact_* (orders, order_items, payments, reviews)]
       |
       v
[Customer Analytics & ML Feature Store]
       +---> [analytics.customer_360]
       +---> [analytics.customer_rfm]
       +---> [analytics.customer_cohorts]
       +---> [ml.churn_models & ml.customer_segments]
       |
       v
[Monitoring & Quality System] ---> [monitoring.pipeline_runs / data_quality_results]
       |
       v
[FastAPI / Express Backend Service (/api/*)]
       |
       v
[Enterprise Customer360 Frontend Application (React 19 / Tailwind / TanStack / Recharts)]
```

---

## 3. Technology Mapping & Execution Strategy
- **PostgreSQL / Relational Store**: Full ANSI SQL DDL schemas for all 7 schemas (`raw`, `staging`, `warehouse`, `analytics`, `ml`, `monitoring`, `quarantine`).
- **SQL Transforms**: Staging cleanse, Kimball star schema, and mart builds live as versioned SQL in `backend/pipeline/orchestrator.py` (stages `dbt_staging`, `dbt_warehouse`, `customer_analytics`); constraint checks (`unique`, `not_null`, relationships, accepted values) run as pytest in `tests/test_dbt_models.py`. The standalone `dbt/` project folder was removed to keep one transformation path.
- **Airflow Orchestration**: Standard DAG definition `dags/customer360_daily_pipeline.py` with 12 structured tasks capturing dependencies, retries, and monitoring callbacks.
- **FastAPI / Express API**: Real REST API endpoints adhering to standard HTTP statuses, pagination, filtering, and query parameters.
- **React Frontend**: Clean, high-density analytical workspace designed for data analysts, CRM managers, and VP of Growth.
