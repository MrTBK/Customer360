# Pipeline & Orchestration Architecture

## 1. Apache Airflow DAG Structure
The production pipeline is codified as `dags/customer360_daily_pipeline.py`
(schedule `0 2 * * *`, 13 tasks). The scheduler runs in Docker
(`customer360-airflow:2.8.3`, LocalExecutor, metadata in the `airflow` database
on project Postgres; UI on :8080, admin/admin local-only). Each task builds its
own orchestrator bound to the shared `airflow-<dag_run>` id, so all 13 task logs
land under one `monitoring.pipeline_runs` row. Manual runs remain possible via
`python -m backend.pipeline.orchestrator`.
It orchestrates an atomic, idempotent, 13-task pipeline:

```
check_sources
     │
     ▼
extract_sources
     │
     ▼
load_raw
     │
     ▼
validate_raw
     │
     ▼
quarantine_invalid
     │
     ▼
dbt_staging
     │
     ▼
dbt_tests
     │
     ▼
dbt_warehouse
     │
     ▼
customer_analytics
     │
     ▼
ml_features
     │
     ▼
run_models
     │
     ▼
quality_checks
     │
     ▼
publish_metrics
```

---

## 2. Execution Logging & Operational Tables
Every run is logged into `monitoring.pipeline_runs`:
- `run_id`: UUID string
- `pipeline_name`: `customer360_daily_pipeline`
- `status`: `SUCCESS` | `FAILED` | `RUNNING`
- `start_time`, `end_time`, `duration_seconds`
- `rows_read`, `rows_loaded`, `rows_rejected`
- `error_message`

Every individual task step is logged into `monitoring.pipeline_tasks`:
- `task_id`: e.g. `dbt_staging`, `ml_features`
- `run_id`: FK to `monitoring.pipeline_runs`
- `status`: `SUCCESS` | `FAILED`
- `duration_seconds`
- `log_output`
