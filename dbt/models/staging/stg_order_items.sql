select
    order_id,
    order_item_id,
    product_id,
    seller_id,
    shipping_limit_date,
    price,
    freight_value,
    round(price + freight_value, 2) as total_item_value
from {{ source('raw', 'olist_order_items') }}
where price > 0
