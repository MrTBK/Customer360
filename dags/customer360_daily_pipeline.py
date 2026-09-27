"""
Apache Airflow DAG: customer360_daily_pipeline
Orchestrates end-to-end extraction, validation, quarantine, dbt staging,
dimensional warehouse, customer analytics, ML feature engineering & models,
quality gates, and metrics publishing.
"""
from datetime import datetime, timedelta
import os
import sys

# Airflow DAG definition
try:
    from airflow import DAG
    from airflow.operators.python import PythonOperator
except ImportError:
    # Airflow compatibility shim when running in standalone mode
    class DAG:
        def __init__(self, dag_id, default_args=None, schedule_interval=None, start_date=None, catchup=False, tags=None):
            self.dag_id = dag_id
            self.default_args = default_args or {}
            self.schedule_interval = schedule_interval
            self.tags = tags or []
        def __enter__(self):
            return self
        def __exit__(self, exc_type, exc_val, exc_tb):
            pass

    class PythonOperator:
        def __init__(self, task_id, python_callable, dag=None, **kwargs):
            self.task_id = task_id
            self.python_callable = python_callable
            self.dag = dag
            self.upstream_list = []
            self.downstream_list = []
        def __rshift__(self, other):
            if isinstance(other, list):
                for item in other:
                    item.upstream_list.append(self)
                    self.downstream_list.append(item)
            else:
                other.upstream_list.append(self)
                self.downstream_list.append(other)
            return other

# Import task logic from production pipeline module
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from backend.pipeline.orchestrator import PipelineOrchestrator

default_args = {
    'owner': 'data-engineering',
    'depends_on_past': False,
    'start_date': datetime(2026, 1, 1),
    'email': ['aziztbk31@gmail.com'],
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
}

with DAG(
    'customer360_daily_pipeline',
    default_args=default_args,
    description='Production Customer360 daily batch warehouse and ML intelligence pipeline',
    schedule_interval='0 2 * * *', # Daily at 02:00 UTC
    catchup=False,
    tags=['customer360', 'analytics', 'dbt', 'ml', 'warehouse'],
) as dag:

    # One orchestrator per task, sharing the Airflow dag_run id so all 13
    # task logs land under a single monitoring.pipeline_runs row.
    STAGES = [
        'check_sources', 'extract_sources', 'load_raw', 'validate_raw',
        'quarantine_invalid', 'dbt_staging', 'dbt_tests', 'dbt_warehouse',
        'customer_analytics', 'ml_features', 'run_models', 'quality_checks',
        'publish_metrics',
    ]

    def _make_task(stage):
        def _run(**context):
            orch = PipelineOrchestrator(
                run_id=f"airflow-{context['dag_run'].run_id}")
            orch.ensure_run_row()
            out = getattr(orch, f"task_{stage}")()
            if stage == 'publish_metrics':
                orch.finalize_run()
            return out
        _run.__name__ = f"run_{stage}"
        return _run

    _ops = {}
    for _stage in STAGES:
        _ops[_stage] = PythonOperator(
            task_id=_stage,
            python_callable=_make_task(_stage),
        )

    (check_sources, extract_sources, load_raw, validate_raw, quarantine_invalid,
     dbt_staging, dbt_tests, dbt_warehouse, customer_analytics, ml_features,
     run_models, quality_checks, publish_metrics) = (
        _ops[s] for s in STAGES
    )

    # Conceptual task dependency flow from prompt specification:
    # check_sources -> extract_sources -> load_raw -> validate_raw -> quarantine_invalid
    # -> dbt_staging -> dbt_tests -> dbt_warehouse -> customer_analytics -> ml_features
    # -> run_models -> quality_checks -> publish_metrics
    check_sources >> extract_sources >> load_raw >> validate_raw >> quarantine_invalid \
        >> dbt_staging >> dbt_tests >> dbt_warehouse >> customer_analytics >> ml_features \
        >> run_models >> quality_checks >> publish_metrics
