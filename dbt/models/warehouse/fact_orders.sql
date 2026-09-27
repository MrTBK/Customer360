select
    o.order_id,
    dc.customer_key,
    dc.customer_unique_id,
    o.order_status,
    o.purchase_timestamp,
    replace(substr(o.purchase_timestamp, 1, 10), '-', '')::integer as order_date_key,
    o.delivered_customer_date,
    o.estimated_delivery_date,
    coalesce(i.item_count, 0) as item_count,
    round(coalesce(i.merchandise_sum, 0.0), 2) as total_merchandise_amount,
    round(coalesce(i.freight_sum, 0.0), 2) as total_freight_amount,
    round(coalesce(i.merchandise_sum, 0.0) + coalesce(i.freight_sum, 0.0), 2) as total_order_amount,
    case
        when o.delivered_customer_date is not null and o.delivered_customer_date > o.estimated_delivery_date
        then 1.0 else 0.0
    end as delivery_delay_days,
    case
        when o.delivered_customer_date is not null and o.delivered_customer_date > o.estimated_delivery_date
        then 1 else 0
    end as is_delayed
from {{ ref('stg_orders') }} o
join {{ ref('stg_customers') }} sc on o.customer_id = sc.customer_id
join {{ ref('dim_customer') }} dc on sc.customer_unique_id = dc.customer_unique_id
left join (
    select order_id, count(*) as item_count, sum(price) as merchandise_sum, sum(freight_value) as freight_sum
    from {{ ref('stg_order_items') }}
    group by order_id
) i on o.order_id = i.order_id
