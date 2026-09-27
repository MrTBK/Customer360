# Customer Lifetime Value (CLV) Analytics

## 1. Principles of Truthful Value Modeling
In many commercial systems, vendors fabricate fictional "profit margins" (e.g. assuming a generic 30% margin) to display inflated CLV figures. Customer360 adheres strictly to empirical data boundaries:
- **Available Data**: Customer gross order spend (`fact_order_items.price`) and freight paid (`freight_value`).
- **Unavailable Data**: Merchant supplier procurement costs, payment gateway processing fees, warehouse storage charges, and per-user marketing CAC.
- **Decision**: All financial figures are explicitly presented as **Gross Realized Revenue (GMV)** and **Projected Future Gross Spend**, never fabricated as net profit.

---

## 2. Formulation

### A. Realized Historical Customer Spend ($CLV_{hist}$)
$$CLV_{hist} = \sum_{i=1}^{N_{orders}} \text{Order Value}_i$$

### B. Expected Future Spend ($CLV_{proj}$)
For an analytical projection horizon $H$ (12 months):
$$CLV_{proj} = AOV \times \hat{F}_{annual} \times (1 - \hat{P}_{\text{churn}}) \times \frac{1}{(1 + d)}$$
Where:
- $AOV$: Historical average order value of the customer.
- $\hat{F}_{annual}$: Expected annual order frequency based on customer RFM segment baseline.
- $\hat{P}_{\text{churn}}$: Calibrated churn probability from the supervised ML model.
- $d$: Annual discount factor (assumed 10% annual rate $\rightarrow d = 0.10$).
- Total Expected CLV: $CLV_{total} = CLV_{hist} + CLV_{proj}$.
