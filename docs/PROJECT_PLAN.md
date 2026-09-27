# Customer360 Project Plan

## 1. Executive Summary & Objective
Customer360 is an enterprise-grade Customer Intelligence & Segmentation Platform. It transforms real-world public e-commerce data (the Olist Brazilian E-Commerce dataset) through a disciplined multi-layer data architecture:
**Raw Ingestion → Data Validation & Quarantine → Normalized Staging → Star Schema Dimensional Warehouse → Analytical Marts & Behavior Metrics → Machine Learning (Clustering, Churn Modeling, Affinity) → REST API → Interactive Enterprise BI & Customer 360 Frontend Application**.

The platform is designed to be technically truthful, reproducible, and production-style, enforcing strict data quality metrics, factual metric calculations, and zero fabricated business claims.

---

## 2. Architecture & Tech Stack

### Target Stack
- **Database / Data Warehouse**: PostgreSQL with distinct schemas (`raw`, `staging`, `warehouse`, `analytics`, `ml`, `monitoring`, `quarantine`).
  *Environment Execution Strategy*: Fully functional database engine with schema isolation, complete dimensional model, ETL pipeline, dbt transformation logic, and ML pipeline.
- **Orchestration**: Directed Acyclic Graph (DAG) pipeline orchestrator replicating the Apache Airflow DAG structure (`customer360_daily_pipeline`) with task-level dependency tracking, execution logs, run metrics, error handling, and retry logic stored in `monitoring.pipeline_runs` and `monitoring.pipeline_tasks`.
- **Analytics Engineering & Transformation**: dbt-compatible SQL transformation models for staging, star-schema warehouse dimensions/facts, and analytical marts with foreign key checks, uniqueness constraints, and accepted values.
- **Machine Learning**: Python / scikit-learn / pandas / NumPy:
  - RFM Segmentation (Recency, Frequency, Monetary with 1-5 quintile scores and standard segment rules)
  - Unsupervised Clustering: K-Means segmentation evaluated using Silhouette Scores across multiple $k$
  - Supervised Churn Prediction: Feature store with historical observation window, target definition based on empirical purchase cycles, evaluated via ROC-AUC, PR-AUC, Precision, Recall, F1, and calibrated probabilities
  - Product Affinity: Market basket co-occurrence analysis calculating Support, Confidence, and Lift
- **Backend API**: Full-stack Node.js / Express / TypeScript & Python service exposing RESTful `/api/*` endpoints with validation, pagination, filtering, sorting, and error handling.
- **Frontend Application**: React 19, TypeScript, Tailwind CSS, TanStack Query, Recharts, Lucide React, supporting complete Customer 360 exploration, cohort retention heatmaps, RFM grids, churn analytics, data lineage, pipeline observability, and data quality dashboards.
- **Infrastructure & Reproducibility**: Dockerfile and `docker-compose.yml` configurations for multi-service deployment with environment variables and health checks.

---

## 3. Milestones & Phases

- **Phase 1: Environment & Architecture**: Workspace audit, architecture documentation, decision records (`docs/DECISIONS.md`), project plan.
- **Phase 2: Dataset Acquisition & Profiling**: Profile Olist Brazilian E-Commerce public dataset (customers, orders, items, products, payments, reviews, sellers). Document schema, nulls, date ranges, and distributions (`docs/DATA_SOURCES.md`).
- **Phase 3: Schemas, Ingestion & Staging**: Create schemas (`raw`, `staging`, `warehouse`, `analytics`, `ml`, `monitoring`, `quarantine`). Ingestion with metadata (`_ingested_at`, `_source_file`, `_source_hash`, `_source_row_number`). Staging validation and quarantine rules.
- **Phase 4: Dimensional Data Warehouse**: Build star schema (`dim_customer`, `dim_product`, `dim_seller`, `dim_geography`, `dim_date`, `fact_orders`, `fact_order_items`, `fact_payments`, `fact_reviews`). Enforce strict grain per fact table to eliminate fan-out.
- **Phase 5: Analytics Marts**: Build `analytics.customer_360`, `analytics.customer_rfm`, `analytics.customer_cohorts`, category affinity matrices.
- **Phase 6: Machine Learning Pipeline**: Feature engineering, K-Means clustering with silhouette scoring, Churn probability model (Logistic Regression & Tree ensemble comparison) without data leakage.
- **Phase 7: Data Quality & Pipeline Observability**: Implement mathematical data quality checks (uniqueness, referential integrity, null rates, range validity) logged in `monitoring.data_quality_results`. Dag run logging in `monitoring.pipeline_runs`.
- **Phase 8: High-Performance Backend API**: Implement all endpoints (`/api/customers`, `/api/customers/{id}`, `/api/rfm`, `/api/cohorts`, `/api/churn`, `/api/affinity`, `/api/quality`, `/api/pipelines`, etc.).
- **Phase 9: Enterprise BI & Customer 360 Interface**: Responsive, restrained enterprise UI with neutral backgrounds, clear data density, interactive drilldowns, visual customer 360 profile card, retention heatmaps, and DAG viewer.
- **Phase 10: Testing & Verification**: End-to-end integration tests, schema validation, test suite, and final review documentation.
