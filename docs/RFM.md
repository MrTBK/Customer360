# RFM Analytics & Customer Segmentation

## 1. Methodology
RFM (Recency, Frequency, Monetary) is a classical behavioral segmentation technique that groups customers based on three purchasing dimensions:
1. **Recency ($R$)**: How recently did the customer make a purchase?
2. **Frequency ($F$)**: How many distinct purchase orders has the customer completed?
3. **Monetary Value ($M$)**: How much total merchandise currency has the customer spent?

---

## 2. Score Calculation & Distribution
- We compute values for every unique customer (`customer_unique_id`).
- For continuous variables ($R$ and $M$), quintiles (20th, 40th, 60th, 80th percentiles) are calculated over the population.
- For Frequency, because the Olist marketplace exhibits an interpurchase distribution with a long tail and heavy single-transaction volume, customers with 2+ orders are prioritized into higher frequency tiers.

| Score | Recency (Days Elapsed) | Frequency (Order Count) | Monetary (Spend in BRL) |
|---|---|---|---|
| **5** | < 110 days | 3+ orders | > R$ 350.00 |
| **4** | 110 – 190 days | 2 orders | R$ 180.00 – R$ 350.00 |
| **3** | 191 – 280 days | 1 order (high basket) | R$ 100.00 – R$ 180.00 |
| **2** | 281 – 390 days | 1 order (avg basket) | R$ 55.00 – R$ 100.00 |
| **1** | > 390 days | 1 order (low basket) | < R$ 55.00 |

---

## 3. Segment Mapping Logic
Using composite scores $(R, F, M)$ and the combined score string:
- **Champions**: $R \in [4,5]$, $F \in [4,5]$, $M \in [4,5]$ — High spenders who bought recently and repeatedly. Strategy: Reward with early product access and VIP support.
- **Loyal Customers**: $R \in [3,5]$, $F \ge 3$, $M \ge 3$ — Consistent repeat buyers. Strategy: Upsell higher-value categories and cross-sell accessories.
- **Potential Loyalists**: $R \in [4,5]$, $F \in [1,2]$, $M \ge 3$ — High initial basket size or recent second order. Strategy: Offer personalized repeat incentives.
- **Recent Customers**: $R \in [4,5]$, $F = 1$, $M \le 3$ — New acquisitions. Strategy: Onboarding series, satisfaction follow-up.
- **Promising**: $R \in [3,4]$, $F = 1$, $M \in [2,4]$ — Moderate spenders with room for repeat activation.
- **Needs Attention**: $R \in [2,3]$, $F \in [2,3]$ — Previously repeat buyers entering risk window. Strategy: Reactivation campaigns with limited-time vouchers.
- **About to Sleep**: $R \in [2,3]$, $F \le 2$, $M \le 3$ — Below-average recency and spend.
- **At Risk**: $R \in [1,2]$, $F \ge 3$, $M \ge 3$ — High historic spenders who haven't ordered in over 300 days. Strategy: Aggressive re-engagement discounts.
- **Hibernating**: $R \in [1,2]$, $F \le 2$, $M \le 3$ — Low activity for an extended period.
- **Lost**: $R = 1$, $F = 1$, $M = 1$ — Oldest single-purchase buyers with minimal monetary value.
