select
    order_id,
    customer_id,
    order_status,
    order_purchase_timestamp as purchase_timestamp,
    order_approved_at as approved_at,
    order_delivered_carrier_date as delivered_carrier_date,
    order_delivered_customer_date as delivered_customer_date,
    order_estimated_delivery_date as estimated_delivery_date,
    case when order_status = 'delivered' then 1 else 0 end as is_delivered,
    case when order_status = 'canceled' then 1 else 0 end as is_canceled
from {{ source('raw', 'olist_orders') }}
where order_id is not null and customer_id is not null
