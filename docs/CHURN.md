# Churn Prediction Model

## 1. Problem Formulation
- **Objective**: Predict the probability of a customer churning ($y \in \{0, 1\}$) within a future prediction horizon based strictly on historical purchase behavior and satisfaction signals.
- **Contract Type**: Non-contractual e-commerce setting.
- **Ground Truth Definition**: A customer is defined as churned if they place zero orders in the 180 days following their observation cutoff date $T_{obs}$.
- **Data Leakage Safeguards**:
  - Feature window: All order, spend, review, and delay features are computed using transactions with timestamps $\le T_{obs}$.
  - Target window: The churn label is evaluated exclusively on orders occurring in $(T_{obs}, T_{obs} + 180\text{ days}]$.
  - Zero future variables (such as total lifetime orders or final review score) are accessible to the model at feature extraction time.

---

## 2. Feature Engineering
The feature store computes the following 12 explanatory variables per customer:
1. `recency_days`: Days between last order and $T_{obs}$.
2. `order_frequency`: Total count of orders placed prior to $T_{obs}$.
3. `total_spend`: Cumulative merchandise expenditure in BRL prior to $T_{obs}$.
4. `average_order_value`: Average spend per order.
5. `orders_last_90_days`: Number of orders placed in $[T_{obs} - 90, T_{obs}]$.
6. `orders_last_180_days`: Number of orders placed in $[T_{obs} - 180, T_{obs}]$.
7. `category_count`: Number of distinct product categories purchased.
8. `average_review_score`: Mean review rating submitted by customer.
9. `delivery_delay_rate`: Proportion of orders delivered past the estimated delivery date.
10. `cancellation_rate`: Proportion of orders canceled or returned.
11. `freight_ratio`: Total freight spend divided by total merchandise spend.
12. `credit_card_ratio`: Proportion of payments made using credit cards.

---

## 3. Modeling & Evaluation

### Models Compared:
1. **Logistic Regression (Baseline with L2 Regularization & Standard Scaler)**:
   - High interpretability via learned feature odds ratios.
   - Well-calibrated probabilities.
2. **Random Forest Classifier**:
   - Captures non-linear feature interactions (e.g., high spend + high delay).
3. **Gradient Boosting Classifier**:
   - Iterative error minimization focusing on hard-to-classify margin cases.

### Evaluation Metrics:
- **ROC-AUC**: Evaluates ranking capability across all classification thresholds. Target: $\ge 0.76$.
- **PR-AUC (Average Precision)**: Critical for class-imbalanced scenarios.
- **Brier Score / Probability Calibration**: Ensures predicted probabilities directly reflect true churn proportions rather than uncalibrated confidence scores.
- **Top Risk Factors**:
  - `recency_days` (strongest positive coefficient with churn risk)
  - `delivery_delay_rate` (strong positive driver of abandonment)
  - `average_review_score` (strong negative driver; satisfied customers churn less)
  - `order_frequency` (repeat buyers have substantially lower churn rate)
