select
    p.order_id,
    dc.customer_key,
    p.payment_sequential,
    p.payment_type,
    p.payment_installments,
    p.payment_value
from {{ ref('stg_payments') }} p
join {{ ref('stg_orders') }} o on p.order_id = o.order_id
join {{ ref('stg_customers') }} sc on o.customer_id = sc.customer_id
join {{ ref('dim_customer') }} dc on sc.customer_unique_id = dc.customer_unique_id
