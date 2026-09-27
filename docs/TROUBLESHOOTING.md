# Troubleshooting Guide

## 1. Common Issues & Resolutions

### Database Connection / Schema Missing
- **Symptom**: `relation "raw.olist_orders" does not exist`.
- **Cause**: Database migrations or initial DDL scripts have not executed.
- **Fix**: Run `python3 backend/init_db.py` to create all 7 schemas and run seed ingestion.

### Pipeline Task Quarantine Volume Spike
- **Symptom**: Unusually high row count in `quarantine.invalid_records`.
- **Diagnosis**: Query `SELECT violation_code, count(*) FROM quarantine.invalid_records GROUP BY violation_code;`.
- **Fix**: Check source CSV format or upstream source changes.

### Zero-Variance ML Feature Error
- **Symptom**: `StandardScaler` throws warning or constant value in frequency.
- **Fix**: Ensure `order_frequency` is scaled using logarithmic transformation $\log(1 + f)$ and verify min-max clipping.

### Port Collisions (3002 / 5433)
- **Symptom**: Dev server or Postgres fails to bind.
- **Fix**: Frontend runs on 3002 (`APP_PORT` overrides). Project Postgres runs on host 5433 (`PG_PORT` overrides) to avoid clashing with other local databases on 5432. Check processes via `lsof -i :3002` or `fuser -k 5433/tcp` (only your own containers).

### API returns 401 on every endpoint
- Auth is enforced because users exist. Sign in via the UI or pass
  `Authorization: Bearer <token>` from POST /api/auth/login.
### Airflow task stuck in load_raw with COPY errors
- Review comments carry raw carriage returns and empty numerics; the loader
  flattens newlines and maps NaN to NULL (see `copy_df`). Check the task log
  under /opt/airflow/logs in the scheduler container.
### Postgres lock waits during dbt build
- Long-lived idle connections block DDL. The connector uses autocommit; if a
  foreign client holds locks, find it in pg_stat_activity/pg_locks and
  terminate only your own backends.
