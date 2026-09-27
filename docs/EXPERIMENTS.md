# Experiments

Registered in `ml.experiments` with deciles in `ml.experiment_deciles`.
Compared live in the Churn page registry.

## exp-a-stratified-logreg (champion)
LogisticRegression, class_weight balanced, shuffled stratified 80/20,
threshold tuned for F1. Same 12 leak-free features and 180-day target as below.

## exp-b-temporal-logreg
Same model and features. Train on oldest 60% by acquisition date, validate
next 20%, test newest 20%. Answers whether the model travels forward in time.

## Reading deciles
Deciles rank test customers by predicted risk (D1 riskiest). Lift = decile
churn rate / overall rate. Base churn ~99%, so lift concentrates weakly;
the tables show this instead of hiding it.

## Latest results
See the Churn page experiment registry (live from `ml.experiments`) or query:

```sql
SELECT experiment_id, roc_auc, pr_auc, precision_score, recall_score,
       f1_score, brier_score, decision_threshold
FROM ml.experiments ORDER BY created_at DESC;
```
