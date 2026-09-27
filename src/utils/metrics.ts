// Plain-language metric definitions (mirrors docs/METRICS.md).
// Population: 95,560 analytical customers unless stated otherwise.

export const METRIC_DEFS: Record<string, string> = {
  customers:
    'Distinct buyers in analytics marts (customer_unique_id). Universe is 96,096; 536 cancelled-only buyers sit outside behavioral analytics.',
  gmv: 'Gross Merchandise Value: sum of fact_order_items.price over non-canceled orders. Source: analytics.customer_360.total_spend.',
  aov: 'Average Order Value: total_spend divided by completed orders, per customer, averaged.',
  repeat:
    'Repeat Purchase Rate: customers with 2+ completed orders divided by customers with 1+ completed orders.',
  recency:
    'Recency (R 1-5): days from last order to 2018-09-01, binned in quintiles. 5 means most recent.',
  frequency:
    'Frequency (F 1-5): lifetime completed orders mapped >=4:5, 3:4, 2:3, else 1.',
  monetary:
    'Monetary (M 1-5): lifetime spend binned in quintiles. 5 means top spenders.',
  churn:
    'Churn probability: estimated chance of no purchase in the next 180 days (logistic model). A model estimate, not a guarantee.',
  clv: 'Projected value: past spend plus expected next-12-month spend discounted by churn probability.',
  segment:
    'Behavioral segment from R/F/M scores (Champions, Loyal, Hibernating, ...). See Segments page.',
};
