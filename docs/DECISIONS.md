# Architecture Decision Records (ADR)

## ADR 001: Environment Execution & Multi-Engine Compatibility Strategy
- **Current Technology Specified**: PostgreSQL, Apache Airflow, dbt-core, FastAPI, React.
- **Context & Constraints**:
  - The project is deployed in an isolated AI Studio runtime environment running Linux gVisor sandbox container.
  - The runtime container does not permit running Docker-in-Docker or running an unprivileged systemd PostgreSQL daemon service without specific socket configuration.
  - Furthermore, for zero-friction local reproducibility by any reviewer evaluating this portfolio repository, the project must run out-of-the-box both in standard containerized environments (via provided `docker-compose.yml` with Postgres and Airflow containers) AND standalone with an embedded zero-configuration execution engine.
- **Decision**:
  - Implement full ANSI SQL schema, DDL, and migrations conforming strictly to PostgreSQL standard syntax with schema isolation (`raw`, `staging`, `warehouse`, `analytics`, `ml`, `monitoring`, `quarantine`).
  - Provide a dual-mode database engine:
    1. Direct native PostgreSQL connection handler (`psycopg2` / `asyncpg` / `SQLAlchemy`) for standard Docker or external PostgreSQL cluster deployment.
    2. Zero-dependency SQL database persistence engine conforming to the identical table schemas and queries for instant preview and automated testing in constrained sandboxes.
  - Implement the Apache Airflow DAG definitions (`dags/customer360_daily_pipeline.py`) with full Airflow operators, tasks, and task dependencies, coupled with a standalone DAG runner CLI that executes the exact pipeline graph step-by-step and records execution metadata into `monitoring.pipeline_runs` and `monitoring.pipeline_tasks`.
  - Provide complete dbt project configuration (`dbt_project.yml`, models for staging, warehouse, and marts, and schema test YAMLs) alongside Python-based dbt-compatible runner for environment flexibility.
- **Trade-offs**: Dual-mode ensures 100% testability, instant responsiveness, and zero build failures in any developer environment while preserving full enterprise Docker/Postgres/Airflow/dbt compatibility.

## ADR 002: Customer Identification & Fact Grain
- **Context**: In Olist, `customer_id` is generated anew for every single order, while `customer_unique_id` identifies the actual distinct human person.
- **Decision**:
  - Dimensional Customer table (`warehouse.dim_customer`) and `analytics.customer_360` are built at the grain of `customer_unique_id`.
  - `warehouse.fact_orders` preserves `customer_id` (order-level token) and links foreign key to `customer_unique_id`.
  - `fact_order_items` has the grain `(order_id, order_item_id)`.
  - Metric calculations never join `fact_order_items` directly with `fact_payments` without aggregating first, avoiding Cartesian fan-out bugs.

## ADR 003: Churn Definition & Data Leakage Prevention
- **Context**: E-commerce marketplace churn is non-contractual. A customer does not cancel a subscription; they simply cease purchasing.
- **Decision**:
  - Churn is defined by empirical interpurchase intervals: with an observation window $T_{obs}$ and prediction window $T_{pred}$, customers with no purchases in the subsequent 180 days are labeled as churned.
  - All feature engineering (recency, frequency, spend, average review score, delay rates) strictly utilizes transactions occurring *prior* to the observation cut-off date, eliminating target and feature leakage.

## ADR 004: Customer Lifetime Value (CLV) Calculation
- **Context**: The dataset lacks supplier cost-of-goods-sold and marketing acquisition spend (CAC).
- **Decision**:
  - We do not fabricate cost metrics. Historical CLV is calculated as Gross Realized Spend (`total_spend`).
  - Predictive CLV is modeled using historical purchase frequency, average order value, and churn probability discount factor: $\text{Expected CLV} = \text{AOV} \times \text{Purchase Frequency} \times (1 - \text{Churn Probability}) \times \text{Horizon Multiplier}$.

## ADR 005: PostgreSQL Runtime Port & Dual-Mode Connector (2026-09-27)
- **Context**: Port 5432 on this host is occupied by an unrelated project database. The runtime must be PostgreSQL without touching foreign databases.
- **Decision**: `customer360-postgres` (Postgres 15) listens on host port 5433. `backend/db/connection.py` uses `DATABASE_URL` when set (psycopg2, `%s` translation, COPY bulk loads) and falls back to SQLite files otherwise. `run.sh` guarantees the container and exports `DATABASE_URL`.

## ADR 006: Canonical Churn Risk Mapping (2026-09-27)
- **Context**: `COALESCE(p.risk_tier,'Low Risk')` labeled every customer Low Risk while `ml.churn_predictions` was empty, contradicting probabilities (e.g. 0.89 → Low Risk).
- **Decision**: Single mapping everywhere (pipeline inference + API SQL CASE): ≥0.80 Critical, ≥0.60 High, ≥0.40 Medium, else Low. `churn_probability` = P(no purchase in next 180d).

## ADR 007: Top Navigation Dark Theme (2026-09-27)
- **Context**: Left sidebar consumed horizontal space; light theme washed out dense BI tables.
- **Decision**: Sticky top bar with grouped tabs (Analytics / Intelligence / Operations), live health + run badges. Dark-only enterprise theme (slate-950 base, slate-900 surfaces, blue accent). No router; state-tab navigation kept.

## ADR 008: Data-Driven Cluster Personas (2026-09-27)
- **Context**: Persona names were hardcoded by cluster id and mismatched observed stats (lowest-spend cluster labeled "High-Value").
- **Decision**: Personas assigned from profiled stats (frequency/recency/delay ranks); review score and delay rate computed per cluster from warehouse facts.

## ADR 009: Single Transformation Path (2026-09-27)
- **Context**: Standalone `dbt/` project (5 models, no profiles, never executed) duplicated the orchestrator SQL transforms with drift risk.
- **Decision**: Removed `dbt/` folder. All transforms live versioned in `backend/pipeline/orchestrator.py`; constraint tests live in `tests/test_dbt_models.py`. Stage names (`dbt_staging`, `dbt_tests`, `dbt_warehouse`) kept as pipeline vocabulary.

## ADR 010: Airflow Scheduler Deployment (2026-09-27)
- **Context**: DAG file existed but no scheduler ever ran it; telemetry rows were manual runs.
- **Decision**: `customer360-airflow:2.8.3` image (Python 3.11, sklearn baked), LocalExecutor, metadata in `airflow` DB on project Postgres. Scheduler + webserver (:8080) run as containers (and compose services). DAG tasks share one run id (`airflow-<dag_run>`) via per-task orchestrator instances + `ensure_run_row()`, so all 13 task logs land under a single `monitoring.pipeline_runs` row.

## ADR 011: Churn Tuning (2026-09-27)
- **Context**: Test ROC-AUC 0.573; 99% positive base rate; fixed 0.5 threshold; PR-AUC was fabricated as ROC*0.94.
- **Decision**: `class_weight='balanced'`, F1-tuned decision threshold stored in `ml.churn_models.decision_threshold`, real `average_precision_score`. Probabilities stay raw; risk tiers unchanged (ADR 006).

## ADR 012: Optional API-Key Gate (2026-09-27)
- **Context**: No auth on any endpoint.
- **Decision**: `C360_API_KEY` env enables `x-api-key` checks on `/api/*` except `/api/health` (401 otherwise). Off by default for local dev; frontend sends `VITE_API_KEY` when set. Full user roles remain follow-up.

## ADR-001 Why PostgreSQL?
Transactional warehouse with real schemas, constraints, COPY bulk load and
locking semantics SQLite cannot provide. SQLite stays only as a zero-dependency
fallback for tests.

## ADR-002 Why Kimball dimensional modeling?
Conformed dimensions and explicit fact grains prevent fan-out, make metrics
auditable, and match how BI tools consume data.

## ADR-003 Why dbt?
SQL transforms belong in versioned, tested, DAG-ordered models, not embedded
strings. dbt build/test is orchestrated per stage; 18 models, 12 data tests.

## ADR-004 Why Airflow?
Scheduled, retried, observable batch execution with per-task telemetry stored
in the warehouse itself (monitoring.*), not in log files.

## ADR-005 Why FastAPI?
Typed Python API with validation, auto docs, and direct access to the same
pandas/sklearn stack as the pipeline.

## ADR-006 Why React + TypeScript?
Component states (loading/error/empty/data) map 1:1 to query states; types
enforce API contracts at build time.

## ADR-007 Why RFM?
Interpretable, deterministic behavioral scoring that works on sparse
non-contractual retail data where latent models would be unverifiable.

## ADR-008 Why the 180-day churn definition?
Empirical Olist interpurchase intervals cluster under 180 days; the cutoff
gives a binary target without subscription semantics.

## ADR-009 Why temporal validation?
Random splits hide distribution shift. The acquisition-cohort experiment tests
whether the model travels forward in time.

## ADR-010 Why exclude cancelled-only customers from behavioral analytics?
No completed purchase means no recency, frequency or monetary signal. They
remain in the warehouse universe (96,096) but outside RFM/marts (95,560).

## ADR-011 Why Logistic Regression as baseline?
Calibrated probabilities, inspectable coefficients, fast retrains. A simpler
honest model beats an exotic unverifiable one.

## ADR-012 Why the project does not use an LLM?
Every number must trace to SQL and arithmetic a reviewer can re-run. An LLM
cannot provide provenance for metrics, and would add cost, latency and
hallucination risk with zero analytical benefit.
