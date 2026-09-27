select
    row_number() over (order by c.customer_unique_id) as customer_key,
    c.customer_unique_id,
    min(c.zip_code_prefix) as primary_zip_code_prefix,
    min(c.city) as primary_city,
    min(c.state) as primary_state,
    min(c.region) as primary_region,
    min(o.purchase_timestamp) as first_order_date,
    max(o.purchase_timestamp) as last_order_date,
    count(distinct o.order_id) as total_lifetime_orders
from {{ ref('stg_customers') }} c
left join {{ ref('stg_orders') }} o on c.customer_id = o.customer_id
group by c.customer_unique_id
