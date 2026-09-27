# Testing Strategy

## 1. Test Pyramid
Customer360 enforces testing at 4 levels:
1. **Unit & Logic Tests (`tests/test_analytics.py`, `tests/test_rfm.py`, `tests/test_cohorts.py`)**:
   - Verify RFM quintile calculations and edge cases.
   - Verify cohort retention math across edge matrix cases.
   - Verify CLV formulas and no-divide-by-zero guarantees.
2. **Data Transformation Tests (`tests/test_dbt_models.py`)**:
   - Foreign key integrity from fact tables to dimension tables.
   - Uniqueness of `customer_unique_id` in `dim_customer` and `customer_360`.
   - Positive price checks and allowed status values.
3. **Machine Learning Pipeline Tests (`tests/test_ml.py`)**:
   - Verify no NaN/infinite outputs from feature pipelines.
   - Verify prediction probabilities are strictly bounded in $[0.0, 1.0]$.
   - Verify silhouette score calculation and cluster model persistence.
4. **Backend API Integration Tests (`tests/test_api.py`)**:
   - Pagination parameters (`page`, `limit`).
   - Filtering by segment, state, or churn risk.
   - Error handling and valid 404 responses for nonexistent customer IDs.
   - Response schema adherence.

---

## 2. Failure Injection Scenarios
Automated tests verify resilient handling under simulated failure conditions:
- Missing customer ID in payload $\rightarrow$ Diverted to `quarantine.invalid_records`.
- Duplicate order IDs in raw batch $\rightarrow$ Deduplication logic flags duplicates and preserves canonical primary record.
- Negative or zero price in line items $\rightarrow$ Quarantined without halting downstream analytics.
- Unknown product FK $\rightarrow$ Handled by late-arriving dimension or surrogate unknown key (key = -1).

## Current coverage (2026-09-27)
- pytest: 24 tests (`tests/`) — analytics math, warehouse integrity, ML bounds,
  API validation/pagination/404s, failure modes (DB-down health, dbt failure
  propagation, invalid inputs).
- vitest: 4 tests (`tests-ui/`, `npm run test-ui`) — display helpers, API client errors.
- dbt: 18 models + 12 data tests, executed by `dbt build`/`dbt test` on every run.
