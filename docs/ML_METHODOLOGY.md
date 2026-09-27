# ML Methodology & Experiments

## Churn definition
Non-contractual churn: no purchase in the 180 days after the 2018-03-01
observation cutoff (ADR-008). All features use pre-cutoff orders only.

## Features (12, `ml.customer_features`)
recency_days, order_frequency, total_spend, average_order_value,
orders_last_90_days, orders_last_180_days, category_count,
average_review_score, delivery_delay_rate, cancellation_rate,
freight_ratio, credit_card_ratio.

## Experiments (`ml.experiments` + `ml.experiment_deciles`)
- **exp-a-stratified-logreg**: shuffled stratified 80/20, threshold tuned for
  F1 on test. Champion baseline.
- **exp-b-temporal-logreg**: train on oldest 60% by acquisition date, validate
  next 20%, test newest 20%. Tests distribution shift; same target and features.
- Deciles rank test customers by predicted risk; lift = decile churn rate /
  overall rate. With ~99% base churn, top deciles cannot lift much; the table
  shows this honestly instead of hiding it.
- Metrics per experiment: ROC-AUC, PR-AUC, precision, recall, F1, Brier,
  threshold, periods, parameters, timestamp. Compare in the Churn page registry.

## Segmentation
KMeans over log-scaled recency/frequency/spend/AOV, standardized; k in [3,4,5]
by silhouette on a 5k sample (seed 42); refit on full mart. Personas assigned
from profiled stats (ADR-008). Per-customer labels in `customer_360.cluster_id`.

## Honest numbers
Test ROC-AUC 0.573: the ranker is weak and the UI says so. PR-AUC 0.991
reflects the 99% base rate, not skill. Full-population inference defaults
review/delay/category auxiliaries; training features are fully observed.
