# Customer360 Data Consistency Audit (v1.0.0 gate)

Date: 2026-09-27. Runtime DB: SQLite files in `data/db/` (Postgres migration pending, locked scope).
Method: direct SQL counts → live FastAPI (`127.0.0.1:8000`) → React expectations.
Pipeline: `backend/pipeline/orchestrator.py` executed twice for real (26.88s, 32.77s, 551,464 rows each).
Run IDs: `9abfd5d3-…` (first), plus second run. `monitoring.pipeline_runs` = 2 rows, 13/13 tasks SUCCESS each.

## Canonical risk mapping (documented once, used everywhere)

`churn_probability >= 0.80` → Critical Risk; `>= 0.60` → High Risk;
`>= 0.40` → Medium Risk; else Low Risk.
Source: `backend/pipeline/orchestrator.py` inference step; API mirrors it in SQL
(`backend/api/main.py` `/api/customers`, `/api/customers/{id}`).
Fixed bug: `COALESCE(p.risk_tier,'Low Risk')` labeled every customer Low Risk when
`ml.churn_predictions` was empty (e.g. p=0.89 → Low Risk). Now derived from probability.

## Consistency table (verified counts/values)

| Area | Database (direct SQL) | API | Frontend | Status |
| RFM | `customer_rfm` 95,560 rows | `/api/rfm` 200: matrix 76 cells, quintiles 5/4/5 | RFM grid renders; empty note if 0 | CONSISTENT |
| Cohorts | `customer_cohorts` 189 rows, 23 cohort months | `/api/cohorts` 200: 189 cells | Heatmap renders; empty note if 0 | CONSISTENT |
| Churn | `churn_models` 1 row; `predictions` 95,560 rows | `/api/churn`, `/churn/model`, `/churn/features` 200 | Scorecards + observed averages; empty note if null | CONSISTENT |
| K-Means | `customer_segments` 4 archetype rows; per-customer labels in `customer_360.cluster_id` | `/api/segments` 200: 4 clusters via `ml_clusters` | Archetype cards render; empty note if 0 | CONSISTENT |
| Customer 360 | `customer_360` 95,560 rows | `/api/customers/{id}` + `/orders` `/products` `/reviews` 200 with rows | Profile + histories render | CONSISTENT |
| Quality | `data_quality_results` 8 rows, 8 PASSED | `/api/quality` 200: score 100.0, 8 checks | Gate shows live score; empty note if 0 | CONSISTENT |
| Airflow | No scheduler run ever (see §1) | `/api/runs` 200: 2 manual runs, 13/13 tasks | "No runs recorded" only when table empty | CONSISTENT |

## 1. Airflow / monitoring — classification

- Airflow scheduler/webserver never executed this DAG in any environment. No Airflow metadata DB exists.
- `dags/customer360_daily_pipeline.py` parses OK; 13 task IDs match orchestrator stages 1:1.
- `monitoring.pipeline_runs` (2 rows): MANUAL EXECUTION (`python -m backend.pipeline.orchestrator`, real pandas/sklearn run, 551,464 rows each). NOT Airflow execution.
- `monitoring.pipeline_tasks` (26 rows): MANUAL EXECUTION, 13/13 SUCCESS per run.
- `monitoring.data_quality_results` (8 rows): REAL assertion output from pipeline run (all PASSED, 0 failed rows).
- `backend/api/main.py` `/api/pipelines` DAG topology is static but matches the DAG file exactly.
- UI "No runs recorded" appeared only while tables were empty; now shows live runs.
- Remaining: deploy scheduler (compose has webserver only, no scheduler/db-init) for true DAG execution.

## 2. RFM — verified

- 95,560 records. R/F/M 1–5, composite `rfm_score` (e.g. "215"), segment via documented rule map (`task_customer_analytics`).
- Reference date 2018-09-01; R via `qcut` (reversed labels), F via thresholds (≥4:5, 3:4, 2:3, else 1), M via ranked quintiles.
- Gap explained: `dim_customer` 96,096 vs mart 95,560. 536 customers hold ONLY canceled orders; RFM source filters `order_status != 'canceled'`. Methodology, not data loss.
- Segment distribution live via `/api/segments` (7 segments; e.g. Hibernating 21,507).

## 3. Cohorts — verified

- 189 rows: `cohort_month` (2016-09 …), `period_number` 0–12, `cohort_size`, `active_customers`, `retention_rate = active/size*100`, `total_period_revenue`. Sample: 2016-10/M0 size 297 rate 100.0%.
- Retention: decay_curve 13 periods; totals from `dim_customer`: 96,096 unique, 2,997 repeat (F≥2), 3.12%.

## 4. Churn — verified, model-generated

- Training: cutoff 2018-03-01; features ≤ cutoff; target = purchase in (2018-03-01, 2018-09-01]; shuffled stratified 80/20 (fixed sequential-slice bias).
- No leakage: all features computed from pre-cutoff orders only.
- Metrics (test): ROC-AUC 0.5729 (weak ranker, stated honestly), PR-AUC 0.9907 (base churn rate ~99%), precision 0.9882, recall 0.9998, F1 0.9940, Brier 0.0117.
- Inference: `predict_proba` per customer; auxiliaries (review/delay/category) defaulted for full-population scoring — documented limitation.
- Distribution: Critical 95,528 (mean p 0.99), High 19, Medium 3, Low 10. Skew reflects base rate, not a bug.
- `churn_probability` = P(churn in next 180d). Canonical risk mapping above (§top).

## 5. K-Means — verified

- Table holds 4 archetype rows (not assignments). Assignments live in `customer_360.cluster_id` (all 95,560 labeled).
- Personas now assigned from profiled stats (fixed hardcoded id→name bug that labeled lowest-spend cluster "High-Value").
- Current: c0 Recent First-Time (15,929, recency 45.9d), c1 Friction-Impaired (39,716, delay 0.089), c2 Lapsed (36,991, recency 285.9d), c3 Repeat Loyalists (2,924, freq 2.11). Review/delay per cluster computed from facts.
- Best k=4 selected by silhouette on 5k sample (seed 42). Silhouette value itself not persisted — UI no longer claims 0.428.

## 6. Customer 360 detail — fixed

- Subs endpoints were correct SQL against empty warehouse facts. After pipeline: orders/products/reviews return rows (verified for `861eff47…`: 1 review, score 4).
- Profile JOINs `ml.customer_segments` for cluster name/persona/strategy; risk from §top mapping.

## 7. Quality gate — fixed

- Was: dashboard 100% fallback vs "No checks recorded" page. Root: `monitoring` empty + `?? 99.8` fallback.
- Now: 8 real checks, score = passed/evaluated = 100.0, badge derives from row statuses. COUNTs: evaluated 99441/112650/100000/96096 per check, 0 failed.

## 8. Executive dashboard — verified sources

- Unique customers: `/api/segments.total_customers` (95,560 = mart coverage; dim 96,096, gap §2).
- GMV: Σ mean_spend×count over live segments. AOV: mean of live mean_aov. Repeat rate: `/api/retention` (3.12%).
- RFM distribution, segment composition, decay curve, top spenders: all live queries, no fallbacks.

## Fixes applied (root causes)

1. Ran real pipeline twice (not fixtures): fills raw→warehouse→analytics→ml→monitoring.
2. Risk mapping bug (`COALESCE…'Low Risk'`) → canonical CASE in both customer endpoints.
3. `/api/datasets` hardcoded rows + duplicate `table` key → live `COUNT(*)` per table (34 entries).
4. KMeans persona-by-id + hardcoded review 4.2/delay 0.08 → profiled assignment + computed values.
5. `pr_auc = roc*0.94` invented → `average_precision_score`. Sequential split → stratified shuffle.
6. Frontend: shared states, all fallbacks removed, bindings verified against live API.

## Verification evidence

- API: 16/16 endpoints 200 (list §8 + subs + model + features). Invalid customer → proper 404.
- Frontend: `npm run lint` clean, `npm run build` passes (757ms). Served 200 on 3002, `/api` proxy verified.
- Tests: `pytest` suite is mock-onlyanalytics/ML unit tests + SVM tests require populated DB (not run here — see Remaining).
- Console errors / 404s: no browser harness in this env; not claimed. Verify in DevTools on :3002.

## Remaining (blocks v1.0.0 declaration)

1. Postgres migration not done: runtime is SQLite; compose postgres/airflow never started (port 5432 occupied by unrelated `dataforge-postgres`; compose frontend fixed to 3002:80, backend 8000 OK).
2. Airflow true execution: scheduler + metadata DB + `airflow dags test` pending (needs airflow install + free 5433 mapping).
3. Churn ROC 0.573: consider class-weight/threshold tuning as follow-up (reported honestly, not hidden).
4. dbt CLI models (5 files) vs orchestrator SQL: dual transformation paths undocumented; reconcile or remove one.
5. Inference auxiliaries defaulted (review 4.0/delay/credit-card) — documented; recompute from full history as follow-up.

## PG cutover + enrichment + nav trim (2026-09-27, later same day)

- Runtime moved SQLite → PostgreSQL 15 (`customer360-postgres`, host 5433).
  Dual-mode `backend/db/connection.py`: `?`→`%s` translation, COPY bulk loads,
  dialect upserts, numpy adapters, rollback safety, `ROUND(float,int)` compat
  functions, AUTOINCREMENT→SERIAL DDL branch.
- Full pipeline re-executed on PG (EXIT 0, 551,464 rows, ~179s). Counts verified:
  raw 99,441 orders / warehouse dim 96,096 / marts 95,560 / cohorts 189 /
  affinity 40 / churn 1 model + 95,560 preds / segments 4 / features 57,510 /
  DQ 8 checks / runs 8 / tasks 65+.
- Fake enrichment removed: preferred_category/payment, review_count/score,
  delay/cancel rates, items, freight now computed from warehouse facts
  (e.g. categories span Bed Bath..Health..Sports; avg review 4.08; 99,460 reviews).
- API: profile/list expose real `customer_city/state`; risk CASE; `count(*)` aliases;
  numeric-key guard (PG strict typing); health fixed for RealDict rows.
- Verification: 14/14 endpoints 200 (subs populated), bad id → 404, pytest 13/13,
  Vite 200 on 3002 with proxy 200, tsc + build clean.
- UI: 9-tab fixed top nav (Retention/Pipelines/Datasets pages removed, no dead refs);
  dark theme; Buyer labels show real city + short id (Olist IDs are anonymized,
  no real person names exist in public data); RFM as R·F·M chips with legend.
- Remaining: Airflow true scheduler deploy; churn ROC 0.573 tuning; dbt CLI vs
  orchestrator SQL dual path; compose postgres/airflow services still reference
  old layout (run.sh is the supported runner).

## Refactor verification (2026-09-27, final)
- Airflow 13/13 SUCCESS with real dbt builds (staging/warehouse/analytics),
  ML, 23 quality checks, experiments A+B, lineage edges, all under shared run ids.
- dbt 29/29 (18 models + 12 tests). Orchestrator delegates; legacy SQL kept
  frozen for SQLite test mode only.
- Auth enforced (users seeded): anon explore 401, analyst token 200, analyst
  /users 403, admin full. JWT + audit log + CSV export logging verified.
- Lineage live: 39 nodes / 31 edges from monitoring.lineage_edges.
- Quality v2: 23 checks with severity/description/run history; /quality serves
  latest run only.
- Frontend: 9 fixed tabs, timeline, definitions, explorer, audit, login/logout,
  role gating. tsc + build clean. Served 200 on :3002.
- Tests: pytest 24/24, vitest 4/4.
