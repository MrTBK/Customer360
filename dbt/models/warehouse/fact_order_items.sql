select
    oi.order_id,
    oi.order_item_id,
    dc.customer_key,
    dc.customer_unique_id,
    dp.product_key,
    ds.seller_key,
    oi.price,
    oi.freight_value,
    oi.total_item_value as total_amount
from {{ ref('stg_order_items') }} oi
join {{ ref('stg_orders') }} o on oi.order_id = o.order_id
join {{ ref('stg_customers') }} sc on o.customer_id = sc.customer_id
join {{ ref('dim_customer') }} dc on sc.customer_unique_id = dc.customer_unique_id
left join {{ ref('dim_product') }} dp on oi.product_id = dp.product_id
left join {{ ref('dim_seller') }} ds on oi.seller_id = ds.seller_id
