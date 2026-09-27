# Customer360 Final Review

## Project purpose
Customer intelligence from transactional e-commerce data: who buys, what
they are worth, whether they return, and whether they will churn. Built on
the public Olist dataset with a full raw-to-UI analytical path.

## Actual architecture
Olist CSVs -> COPY bulk load -> raw -> **dbt** staging/warehouse/analytics
(RFM scoring stays Python: quintile binning is statistical) -> sklearn ML
-> quality gates -> FastAPI -> React. PostgreSQL 15 is the runtime store;
SQLite is a test fallback. Airflow 2.8.3 schedules and executes the 13-task
DAG with per-task telemetry in `monitoring.*`.

## Actual technology stack
Python (FastAPI, pandas, scikit-learn, dbt-postgres), PostgreSQL 15,
Apache Airflow 2.8.3, React 19 + TypeScript + Tailwind + TanStack Query +
Recharts, pytest + vitest, Docker Compose, `run.sh` runner.

## Data source
Public Olist Brazilian E-Commerce (Kaggle olistbr/brazilian-ecommerce),
2016-2018. 7 files, 551,464 rows, verified against published counts.

## Data volumes (latest verified PG load)
raw 551,464 total (orders 99,441; items 112,650; payments 103,886; reviews
100,000; products 32,951; sellers 3,095; customers 99,441) -> warehouse
dim_customer 96,096, facts 99,441/112,650/103,886/100,000 -> analytics
customer_360 95,560, rfm 95,560, cohorts 189, affinity 40 -> ml features
57,510, predictions 95,560, 4 segments.

## Database schemas
raw, staging, warehouse (Kimball dims + single-grain facts), analytics,
ml (features, model registry, predictions, segments, experiments, deciles),
monitoring (runs, tasks, ingestion history, quality results, lineage edges),
quarantine, auth (users, audit log).

## Pipeline
`customer360_daily_pipeline`, 13 tasks, daily 02:00 UTC. dbt owns SQL
transforms (18 models, 12 data tests); Python owns ingestion, RFM scoring,
ML, quality, publishing. All telemetry real; failures propagate visibly.

## Data quality
23 checks across completeness, uniqueness, validity, referential/temporal
integrity, business rules, volume (vs ingestion history), freshness and
duplicates. Severity critical/warning, FAILED vs WARNING states, per-run
history, quarantine for rejected rows. Score derived, never hardcoded.

## Customer 360
31 real metrics per profile (city, spend, orders, items, freight, reviews,
RFM, segment, cluster, churn, CLV, payment/category preferences, delay and
cancel rates), order/product/review tabs plus a chronological activity
timeline. No placeholder constants.

## RFM
Scores 1-5 vs 2018-09-01 snapshot (qcut R/M, calibrated F), documented rule
map to 7 observed segments. 536 cancelled-only buyers excluded by design.

## Cohorts
189 acquisition-month x period cells, retention = active/size*100, 12-period
horizon, revenue per cell.

## Retention
Decay curve averaged across cohorts; totals from dim_customer (96,096 unique,
~3k repeat, ~3.1%). No fabricated driver statistics.

## Churn
180-day no-purchase target, cutoff 2018-03-01, no leakage, stratified split +
temporal acquisition experiment, both registered with decile lift tables.
Logistic baseline, class-balanced, tuned threshold. Test ROC-AUC 0.573
(weak, stated), PR-AUC 0.991 (99% base rate), precision 0.988, recall 1.0,
F1 0.994, Brier 0.012. Canonical risk mapping documented and shared.

## Segmentation
KMeans k in [3,4,5] by silhouette (5k sample, seed 42). Personas from
profiled stats; per-customer labels in customer_360; review/delay computed.

## Product affinity
Pairwise category rules (support>=3 orders), support/confidence/lift, top 40
bidirectional. Pure SQL in dbt.

## ML methodology
See docs/ML_METHODOLOGY.md and docs/EXPERIMENTS.md. Leakage-free features,
stratified + temporal validation, calibrated probabilities, honest metrics.

## API
16 read endpoints (paged/filtered/sorted, 404s), auth/users/audit/explore/
pipeline-trigger/lineage/datasets metadata endpoints. JWT roles
Admin/Analyst/Viewer + optional API key. Rollback-safe PG layer.

## Frontend
Dark enterprise UI, 9 fixed tabs (RFM matrix inside Segments; Datasets +
Explorer inside Pipelines; Audit inside Pipelines for Admins). All data views
carry loading/error/empty/data states, metric definitions, CSV export,
city search, activity timeline. tsc + vite build clean.

## Security
pbkdf2 hashing, HS256 JWT, role guards server-side, audit log, no committed
secrets, demo accounts documented for rotation. See docs/SECURITY.md.

## Audit logging
Login/logout, user creation, pipeline triggers, CSV exports and explorer
queries recorded with user, resource, rows and status.

## Observability
Per-run/per-task durations, statuses, row counts, error text; quality per
check; lineage edges per run. UI reads the same tables the pipeline writes.

## Testing
pytest 24 (analytics math, warehouse integrity, ML bounds, API validation,
404s, failure modes: DB down, dbt failure propagation) + vitest 4 + dbt
build/test on every run. No inflated counts.

## Known limitations
Churn ROC-AUC weak; Olist historical; Portuguese reviews; inference
auxiliaries defaulted; anonymized IDs; cancelled-only buyers excluded;
locally-verified architecture, not a production system (no HA/backups).

## Remaining technical debt
- Airflow webserver basic-auth only; no TLS.
- Churn needs feature/threshold work to lift ROC.
- Quality violating-record drill-down not yet exposed via API.
- dbt docs site not generated/published.
- Frontend has no automated component/interaction tests beyond utils/client.

## Verification results
See CUSTOMER360_DATA_CONSISTENCY_AUDIT.md for the count-level trace
(PostgreSQL -> API -> React) and the monitoring-row classification.

## What is genuinely production-style
Real orchestration with retries and telemetry, tested transforms, honest
metrics, auth + audit, reproducible one-command runs, documented decisions.

## What is still portfolio/academic scope
Single-node Postgres, local executor, demo credentials, weak churn ranker,
manual webserver auth, no staging/prod environment split.
