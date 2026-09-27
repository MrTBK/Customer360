# Customer360 Metrics Dictionary

Every metric across the analytics schema is formally documented below with its business definition, exact mathematical formulation, underlying tables, and operational assumptions.

---

## 1. Customer Level Metrics (`analytics.customer_360`)

### `total_spend`
- **Definition**: Total cumulative monetary expenditure paid by the customer across all completed orders.
- **Formula**: $\sum (\text{fact\_order\_items.price}) \text{ where fact\_orders.order\_status} \neq \text{'canceled'}$.
- **Source**: `warehouse.fact_order_items` joined to `warehouse.fact_orders`.
- **Grain**: One value per `customer_unique_id`.
- **Assumptions**: Freight is tracked separately under `total_freight` to distinguish product merchandise value from logistics fees.

### `average_order_value (AOV)`
- **Definition**: Average merchandise expenditure per completed order.
- **Formula**: $\frac{\text{total\_spend}}{\text{completed\_orders}}$.
- **Source**: `warehouse.fact_orders` & `warehouse.fact_order_items`.
- **Grain**: One value per `customer_unique_id`.

### `customer_lifetime_days`
- **Definition**: Number of calendar days between a customer's first purchase timestamp and their most recent purchase timestamp.
- **Formula**: $\text{DATE\_DIFF}(\text{last\_order\_date}, \text{first\_order\_date})$. For single-order customers, equals 0.

### `days_since_last_order (Recency)`
- **Definition**: Elapsed days from the customer's last order purchase date to the reference analysis date ($T_{snapshot}$).
- **Formula**: $\text{DATE\_DIFF}(T_{snapshot}, \text{last\_order\_date})$.

### `delivery_delay_rate`
- **Definition**: Percentage of customer orders where actual delivery to customer occurred after the estimated delivery date quoted at checkout.
- **Formula**: $\frac{\sum \text{is\_delayed}}{\text{total\_delivered\_orders}} \times 100\%$.

### `cancellation_rate`
- **Definition**: Percentage of customer orders with status `canceled` or `unavailable`.
- **Formula**: $\frac{\text{canceled\_orders}}{\text{total\_orders}} \times 100\%$.

### `average_review_score`
- **Definition**: Mean satisfaction rating given by the customer across all submitted reviews.
- **Formula**: $\frac{\sum \text{review\_score}}{\text{review\_count}}$. Range: 1.00 to 5.00.

---

## 2. RFM & Segmentation Rules

### `rfm_recency` (Score 1-5)
- Quintile 5: Most recent (Top 20% lowest days since last order).
- Quintile 1: Least recent (Bottom 20% highest days since last order).

### `rfm_frequency` (Score 1-5)
- In Olist marketplace data where 97% of buyers make 1 order, standard statistical quintiles collapse.
- Rule: Repeat buyers (orders >= 2) earn frequency scores 4 or 5; buyers with 1 order earn frequency scores calibrated by recency and basket depth.

### `rfm_monetary` (Score 1-5)
- Quintiles 1 to 5 based on total merchandise spend distribution.

### Segment Definitions:
1. **Champions**: Recency score 4-5, Frequency 4-5, Monetary 4-5.
2. **Loyal Customers**: Recency 3-5, Frequency 3-4, Monetary 3-5.
3. **Potential Loyalists**: Recency 4-5, Frequency 1-2, Monetary 3-5.
4. **Recent Customers**: Recency 4-5, Frequency 1, Monetary 1-3.
5. **Promising**: Recency 3-4, Frequency 1, Monetary 2-4.
6. **Needs Attention**: Recency 2-3, Frequency 2-3, Monetary 2-4.
7. **About to Sleep**: Recency 2-3, Frequency 1-2, Monetary 1-3.
8. **At Risk**: Recency 1-2, Frequency 3-5, Monetary 3-5.
9. **Hibernating**: Recency 1-2, Frequency 1-2, Monetary 1-3.
10. **Lost**: Recency 1, Frequency 1, Monetary 1.
