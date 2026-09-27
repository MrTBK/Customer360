select
    row_number() over (order by product_id) as product_key,
    product_id, category_name, category_name_english, photos_qty, weight_g
from {{ ref('stg_products') }}
