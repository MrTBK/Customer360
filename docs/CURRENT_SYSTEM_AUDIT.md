# CURRENT SYSTEM AUDIT (2026-09-27, read-only inspection)

## Runtime architecture (verified, not claimed)
- Python API + pipeline, TypeScript React frontend, PostgreSQL 15 (host 5433),
  Airflow 2.8.3 scheduler + webserver (:8080), SQLite fallback for tests.
- Execution: `./run.sh` (PG + API :8000 + Vite :3002). Compose mirrors it.
- Data flow: Olist CSVs -> COPY bulk load -> raw -> staging SQL -> warehouse
  star schema -> analytics marts -> sklearn ML -> FastAPI -> React. All live.

## Component verdicts
| Component | Actual | Verdict | Why |
| Backend API | FastAPI, 16 GET endpoints, live SQL, key gate optional | KEEP | Correct, tested |
| Pipeline | orchestrator.py, 13 real stages, PG+COPY, Airflow tasks share run id | KEEP | Proven runs |
| DB layer | dual-mode connector, placeholder translation, rollback safety | KEEP | Works both modes |
| Warehouse | Kimball dims/facts, documented grains, 536 canceled-only excluded | KEEP | Sound + documented |
| RFM/cohorts | qcut scoring, rule segments, 189 cohort cells | KEEP | Verified math |
| Churn | logreg balanced, stratified split, real PR-AUC, ROC 0.573 honest | IMPROVE | Temporal validation + experiments registry missing |
| KMeans | k 3-5 by silhouette, profiled personas | KEEP | Fixed id-mislabel |
| Quality | 8 real assertions, needs_attention flag | IMPROVE | Needs categories/severity/volume/freshness |
| Lineage | static topology JSON in /api/lineage | MIGRATE | Must become metadata-driven |
| Transform path | orchestrator SQL only (dbt/ removed ADR 009) | MIGRATE | Spec demands real dbt; ONE path required |
| Frontend | dark top-nav, 9 tabs, states everywhere, no mocks | IMPROVE | Spec wants restrained LIGHT theme + definitions + less noise |
| Auth | optional x-api-key gate | MIGRATE | Spec wants login/JWT + roles |
| Audit log | none | MIGRATE | New: actions table + API + UI |
| Data explorer | none | MIGRATE | New: filtered server-side explorer, no raw SQL |
| Experiments | single champion row, no registry | MIGRATE | New: ml.experiments table + UI compare |
| Customer 360 | profile + subs + reviews work, city labels, RFM chips | IMPROVE | Needs timeline + explained sections per spec |
| Tests | pytest 13/13, vitest 4/4 | IMPROVE | Needs behavior/failure-scenario coverage |
| Docs | 18 files + 2 audit docs, mostly accurate | IMPROVE | Rewrite per required doc list, cut duplication |

## Hardcoded / fake remnants: NONE in production paths (verified by grep + DB).
- Old: risk fallback, dataset rows, persona-by-id, PR-AUC formula, review 4.2.
  All removed and verified. Test fixtures clearly separated (tests/ mock arrays).

## Dead code
- backend/api/builtin_server.py, fast_populate.py, populate_analytics_ml.py
  (legacy SQLite seeders, superseded by orchestrator; run.sh never uses them).
- server.ts Express proxy still functional (npm dev uses vite proxy instead).

## Duplicated logic
- Risk-tier mapping lives in orchestrator + API SQL CASE (identical, documented
  ADR 006; acceptable duplication, single documented source of truth).
- Transform SQL only in orchestrator (dbt/ removed, no duplication).

## Weak areas
1. Churn ROC 0.573, no temporal validation, no experiment comparison.
2. Quality: 8 checks, no categories/severity/history.
3. Lineage static; metric definitions not in UI.
4. Auth single key, no roles; no audit log.
5. Dark "AI dashboard" look vs required restrained light theme.
6. Airflow runs full 3-min ML per trigger; no failure-injection tests.
7. No git repo: checkpoints impossible; recommend `git init` first.
