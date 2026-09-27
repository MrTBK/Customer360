with base as (
    select
        fo.customer_unique_id,
        substr(dc.first_order_date, 1, 7) as cohort_month,
        substr(fo.purchase_timestamp, 1, 7) as activity_month,
        fo.total_merchandise_amount
    from {{ ref('fact_orders') }} fo
    join {{ ref('dim_customer') }} dc
        on fo.customer_unique_id = dc.customer_unique_id
    where fo.order_status != 'canceled'
),
periods as (
    select
        customer_unique_id,
        cohort_month,
        activity_month,
        ((substr(activity_month, 1, 4)::integer - substr(cohort_month, 1, 4)::integer) * 12
         + (substr(activity_month, 6, 2)::integer - substr(cohort_month, 6, 2)::integer)) as period_number,
        total_merchandise_amount
    from base
),
sized as (
    select cohort_month, count(distinct customer_unique_id) as cohort_size
    from periods
    where period_number = 0
    group by cohort_month
),
agg as (
    select
        cohort_month,
        period_number,
        count(distinct customer_unique_id) as active_customers,
        round(sum(total_merchandise_amount), 2) as total_period_revenue
    from periods
    group by cohort_month, period_number
)
select
    a.cohort_month,
    a.period_number,
    s.cohort_size,
    a.active_customers,
    round(a.active_customers::numeric / s.cohort_size * 100, 2) as retention_rate,
    a.total_period_revenue
from agg a
join sized s on a.cohort_month = s.cohort_month
where a.period_number <= 12
