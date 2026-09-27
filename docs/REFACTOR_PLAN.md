# REFACTOR PLAN (incremental, verify each layer)

Order matters. Each phase ends with tests + runtime check before next begins.

## Phase 0 - Safety (first)
1. `git init` + initial commit (spec demands checkpoints; none exist).
2. Record baselines: pytest 13/13, vitest 4/4, API 14/16 200, PG counts table.

## Phase 1 - Real dbt (ONE transform path)
1. `pip install dbt-postgres` (light, ~1 min) + `dbt/profiles.yml.example`.
2. Recreate `dbt/` with staging/warehouse/analytics models ported 1:1 from
   orchestrator SQL (19 models per spec) + schema tests.
3. Orchestrator stages call `dbt build`/`dbt test` via subprocess against PG
   (separate `dbt_` schema to avoid clobbering? No: dbt OWNS staging/warehouse/
   analytics; orchestrator keeps raw-load + quarantine + ML + quality).
   Decision: dbt owns staging->marts SQL; Python keeps ingestion/ML/quality.
4. Verify: `dbt build` + `dbt test` green, counts identical to current marts.
5. Delete duplicated SQL from orchestrator only after parity proven.

## Phase 2 - Quality system
1. New tables: check definitions (category, severity, description, rule SQL),
   check run history per pipeline run.
2. Categories: completeness, uniqueness, validity, referential, temporal,
   business rules, volume (vs 7-run average), freshness, duplicates.
3. Quality UI: grouped by category with severity, rows affected, failure rate,
   last run, drill to affected records (capped sample, no raw SQL endpoint).
4. Alerting: `needs_attention` already exists; add per-check severity surfacing.

## Phase 3 - Lineage + definitions
1. `monitoring.lineage_edges` (source->raw->staging->warehouse->mart->endpoint->page)
   populated by pipeline; `/api/lineage` reads it (no static topology).
2. `docs/METRICS.md` definitions surfaced in UI help panels (GMV, AOV, repeat
   rate, R/F/M, churn, retention, CLV, segments) with population + source.

## Phase 4 - Customer 360 signature
1. Timeline from fact_orders + fact_reviews (placed/delivered/reviewed events).
2. Explained blocks: RFM meaning, churn definition + signals + uncertainty note,
   segment interpretation per spec section 6-7.
3. Population terminology banner (96,096 universe vs 95,560 analytical vs 536
   excluded) in methodology UI.

## Phase 5 - ML experiments
1. `ml.experiments` registry (periods, params, threshold, all metrics, created_at).
2. Temporal split experiment (train early / validate mid / test late) + RFM-only
   baseline; lift/gain/decile table + calibration + confusion matrix endpoints.
3. UI compare view. Keep ROC 0.573 visible; no number tuning for looks.

## Phase 6 - Observability
1. Runs/tasks UI restored as Operations pages (Pipelines, Datasets removed
   earlier by user request; re-add ONLY if user approves - spec section 26 wants
   them, user earlier removed them: CONFLICT, needs user call).
2. Failure injection tests: bad CSV, duplicate ingestion, DB down, task fail.

## Phase 7 - Auth + audit + explorer
1. JWT login (pbkdf2 hashing), roles Admin/Analyst/Viewer, route guards.
2. Audit log table + API + UI (login, runs, exports, config).
3. Data Explorer: dataset picker + server-side filters + pagination (no raw SQL).

## Phase 8 - Light restrained theme
1. Convert dark -> light (#F7F8FA/#FFFFFF/#111827) LAST (after all pages final,
   avoids double conversion). Keep top nav, cut chart noise per spec 18.

## Phase 9 - Tests + docs + README
1. Behavior tests per spec 20 (RFM math, cohorts, leakage, failure scenarios,
   API filters/404s, frontend states). No count inflation.
2. Rewrite docs per required list; dedupe; engineer-tone README; ADR-001..012
   full set incl. "why no LLM"; limitations kept.

## Conflicts needing user decision
A. dbt ownership split (Phase 1) vs pure-Python path (ADR 009). Spec demands dbt.
B. Re-add Pipelines/Datasets pages for observability vs earlier removal order.
C. Auth scope: full JWT+roles is 1-2 days; confirm before Phase 7.
D. Light theme redo vs current dark (user approved dark days ago; spec wants light).
