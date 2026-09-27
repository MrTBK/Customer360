select
    r.review_id,
    r.order_id,
    dc.customer_key,
    r.review_score,
    r.review_comment_message,
    r.review_creation_date
from {{ ref('stg_reviews') }} r
join {{ ref('stg_orders') }} o on r.order_id = o.order_id
join {{ ref('stg_customers') }} sc on o.customer_id = sc.customer_id
join {{ ref('dim_customer') }} dc on sc.customer_unique_id = dc.customer_unique_id
