# Data Quality & Observability Framework

## 1. Principles & Quality Gate Implementation
Customer360 enforces a strict Data Quality Gate. Never is a 100% score fabricated.
Instead, quality metrics are dynamically calculated using mathematical test executions stored in `monitoring.data_quality_results`.

---

## 2. Implemented Checks

| Check Name | Target Table | Type | Rule / Assertion | Action on Failure |
|---|---|---|---|---|
| `chk_customer_unique_id_not_null` | `staging.stg_customers` | Completeness | `customer_unique_id IS NOT NULL` | Quarantine record |
| `chk_order_id_uniqueness` | `staging.stg_orders` | Uniqueness | `COUNT(order_id) = COUNT(DISTINCT order_id)` | Alert + Quarantine duplicates |
| `chk_positive_prices` | `staging.stg_order_items` | Range Validity | `price > 0` | Quarantine line item |
| `chk_valid_order_status` | `staging.stg_orders` | Allowed Values | `order_status IN ('delivered', 'shipped', 'canceled', ...)` | Quarantine record |
| `chk_valid_payment_types` | `staging.stg_payments` | Allowed Values | `payment_type IN ('credit_card', 'boleto', 'voucher', 'debit_card')` | Quarantine record |
| `chk_review_score_range` | `staging.stg_reviews` | Domain Range | `review_score BETWEEN 1 AND 5` | Quarantine review |
| `chk_fk_order_customer` | `warehouse.fact_orders` | Referential Integrity | Foreign key references valid `dim_customer` | Log orphaned FK alert |
| `chk_delivery_timestamps` | `warehouse.fact_orders` | Temporal Consistency | `delivered_customer_date >= purchase_timestamp` | Quarantine anomalous timestamps |

---

## 3. Mathematical Quality Score Calculation
The overall dataset quality score $Q$ is computed as:
$$Q = \frac{\sum_{i=1}^N \text{Passed Rows}_i}{\sum_{i=1}^N \text{Evaluated Rows}_i} \times 100\%$$
Failed rows are diverted to `quarantine.invalid_records` with:
- `quarantine_id`
- `table_name`
- `record_identifier`
- `violation_code`
- `raw_payload`
- `detected_at`

## Quality system v2 (2026-09-27)
23 checks across Completeness, Uniqueness, Validity, Referential Integrity,
Temporal Integrity, Business Rules, Volume, Freshness and Duplicates. Each row
carries severity (critical/warning), a plain-language description and the
pipeline run id; history is kept per run. Critical failures mark FAILED.
Volume compares raw order counts against ingestion history (±25%); freshness
requires ingestion within 48h; duplicates detection watches file hashes.
