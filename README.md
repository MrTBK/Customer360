# Customer360

Customer intelligence platform for analyzing customer value,
lifecycle, retention and churn from transactional e-commerce data.

The project uses the public Olist Brazilian E-Commerce dataset
and builds a complete analytical path from raw ingestion to
customer-level analytics and API-driven visualization.

## Why it exists

Answer concrete business questions from order history:

- Which customers generate the most value, and who is about to leave?
- How does repeat purchasing behave after the first order?
- Which product categories are bought together?
- Can we trust the numbers on the dashboard, and where did they come from?

## Business questions

- Who are the highest-value buyers and how do they behave?
- What does the customer base look like by recency, frequency and spend?
- How does retention evolve by acquisition month?
- Does the churn model identify concentrated, actionable risk?
- What happened to one individual customer, in order?

## Architecture

```
Olist CSVs -> PostgreSQL raw -> dbt staging -> dbt warehouse (Kimball star)
  -> dbt analytics (cohorts, affinity) + Python RFM scoring
  -> sklearn ML (features, KMeans, churn) -> quality gates
  -> FastAPI -> React dashboard
```

PostgreSQL 15 is the runtime database (schemas: raw, staging, warehouse,
analytics, ml, monitoring, quarantine, auth). A SQLite fallback exists for
tests and environments without Docker; it is never the primary store.

## Data model

Kimball dimensional model. Grain discipline is enforced: facts never join
across item/payment/review lines without prior aggregation.

- `warehouse.dim_customer` — one row per `customer_unique_id` (96,096 buyers)
- `warehouse.fact_orders` — one row per order; `fact_order_items` — one row
  per order line; plus `fact_payments`, `fact_reviews`
- `analytics.customer_360` — one unified profile per analytical customer
- `analytics.customer_rfm`, `customer_cohorts`, `product_affinity`
- `ml.*` — features, model registry, predictions, segments, experiments

Population note: the customer universe is 96,096 buyers; the analytical
population is 95,560 because 536 buyers hold only cancelled orders and are
excluded from behavioral analytics by design (see docs/DECISIONS.md ADR-010).
This is methodology, not data loss.

## Pipeline

`customer360_daily_pipeline` (daily 02:00 UTC), 13 tasks, executed by Apache
Airflow (LocalExecutor, metadata in Postgres) or manually:

```
check_sources -> extract_sources -> load_raw (COPY bulk load) -> validate_raw
-> quarantine_invalid -> dbt build (staging) -> dbt test -> dbt build (warehouse)
-> dbt build (analytics) + RFM scoring -> ML features -> models -> quality checks
-> publish (metrics + lineage)
```

Every run and task is recorded in `monitoring.pipeline_runs` /
`monitoring.pipeline_tasks`. Telemetry shown in the UI comes from these
tables; nothing is synthesized. Trigger from the Pipelines page (Admin) or
`python -m backend.pipeline.orchestrator` with `DATABASE_URL` set.

## Analytics

- **RFM**: recency/frequency/monetary scored 1-5 against a 2018-09-01 snapshot,
  mapped to named segments (Champions, Hibernating, ...) with documented rules.
- **Cohorts**: acquisition-month x activity-month retention matrix, 12 periods.
- **Affinity**: category association rules with support/confidence/lift.
- **Customer 360**: 31 real per-customer metrics plus order/product/review
  history and an activity timeline. No placeholder constants.

## ML methodology

- Churn = no purchase in the 180 days after 2018-03-01. Features use only
  pre-cutoff orders (no leakage). Shuffled stratified 80/20 split plus a
  temporal acquisition-cohort experiment; both registered in `ml.experiments`
  with decile lift tables.
- Logistic Regression baseline (`class_weight='balanced'`, F1-tuned threshold).
  Honest test metrics: ROC-AUC 0.573 (weak ranker, stated openly), PR-AUC 0.991
  (base churn rate ~99%), precision 0.988, recall 1.0, F1 0.994, Brier 0.012.
- KMeans (k in 3-5 by silhouette, seed 42); personas assigned from profiled
  cluster stats, never by cluster id.

## API

FastAPI on :8000. Sixteen read endpoints with pagination, filters, sorting and
proper 404s, plus auth (`/api/auth/*`), users/audit (Admin), explorer
(Analyst+), pipeline trigger (Admin) and lineage/datasets metadata endpoints.
Optional `x-api-key` gate; JWT sessions with Admin/Analyst/Viewer roles.
Docs at `/docs` when running.

## Frontend

React 19 + TypeScript + Tailwind (dark), TanStack Query, Recharts, Lucide.
Nine main tabs plus Pipelines, Datasets, Explorer and Audit. Every data view
handles loading, error (+retry), empty and data states. Metric definitions
ship inline (hover the info icons). CSV export on directory and categories.
No mock numbers; empty marts render honest empty states.

## Data quality

23 checks across completeness, uniqueness, validity, referential/temporal
integrity, business rules, volume (vs ingestion history), freshness and
duplicates, each with severity, description and per-run history. Failed
critical checks mark FAILED, never silent 100%. Quarantine holds rejected rows.

## Testing

- `pytest tests/` (13 behavioral tests: analytics math, warehouse integrity,
  ML bounds, API validation/404s, failure modes like dbt-runner errors).
- `npm run test-ui` (vitest: display helpers, API client errors).
- `dbt build` + `dbt test` (18 models, 12 data tests) on every pipeline run.

## Limitations

- Churn ROC-AUC is weak (0.573); the model ranks barely above random.
- Olist is historical (2016-2018), not live data.
- Review text is Portuguese; newlines are flattened on COPY load.
- Full-population inference defaults some auxiliaries (documented in code).
- Customer names do not exist; Olist IDs are anonymized by the publisher.
- Cancelled-only buyers sit outside behavioral analytics (see above).
- This is production-style architecture verified locally, not a production
  system: no HA, no backups, no secret management beyond env vars.

## How to run

```bash
./run.sh
# Postgres :5433, API :8000, UI http://127.0.0.1:3002
# Override: PG_PORT / API_PORT / APP_PORT
```

First data load, then open the UI. Airflow UI on :8080, API docs on
:8000/docs. See docs/ for architecture, decisions (ADR-001..012), methodology
and troubleshooting.

## Push to GitHub

The repo excludes runtime data and build artifacts (see `.gitignore`):
`data/` (re-downloaded, ~60 MB), `node_modules/`, `dist/`, `__pycache__/`,
`dbt/target/`, `.venv/`. Nothing secret is tracked (`.env*` ignored).

```bash
# 1. Create the empty repo on GitHub, then:
git remote add origin git@github.com:<you>/customer360-intelligence-platform.git
git branch -M main
git push -u origin main
```

Clone-and-run for reviewers:

```bash
git clone git@github.com:<you>/customer360-intelligence-platform.git
cd customer360-intelligence-platform
python3 backend/ingestion/download_olist.py   # fetch public Olist CSVs -> data/raw/
./run.sh                                       # Postgres + API + UI
# first warehouse build:
DATABASE_URL=postgresql://c360_user:c360_password@127.0.0.1:5433/customer360 \
  PYTHONPATH=. python3 backend/pipeline/orchestrator.py
# open http://127.0.0.1:3002 (login: admin/admin123, analyst/analyst123,
# viewer/viewer123 — rotate before any shared deployment)
```

No Git LFS needed: the dataset downloads from its public mirror at setup time
and never enters version control.
