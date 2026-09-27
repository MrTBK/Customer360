# Data Lineage

Lineage is stored data, not a static diagram. Each pipeline run writes
`monitoring.lineage_edges` (from_schema, from_table, to_schema, to_table, via)
and `GET /api/lineage` serves nodes + edges from it. The Datasets page renders
the live graph counts.

## Canonical chains
- `olist_orders.csv -> raw.olist_orders -> staging.stg_orders -> warehouse.fact_orders -> analytics.customer_360 -> GET /api/customers/{id} -> Customer 360 page`
- `warehouse.fact_orders -> analytics.customer_rfm -> ml.customer_features -> ml.churn_models -> ml.churn_predictions -> GET /api/churn -> Churn page`
- `warehouse.fact_orders -> analytics.customer_cohorts -> GET /api/cohorts -> Cohorts page`
- `warehouse.fact_order_items -> analytics.product_affinity -> GET /api/affinity -> Products page`

## Metric origins (see docs/METRICS.md for full definitions)
- `customer_360.total_spend`: SUM(fact_order_items.price), non-canceled orders.
- `customer_360.churn_probability`: logistic predict_proba, 12 leak-free features.
- `customer_360.customer_segment`: deterministic R/F/M rule map (orchestrator).
- `monitoring.data_quality_results`: per-check total/pass SQL in pipeline code.
