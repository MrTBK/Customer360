select
    seller_id,
    seller_zip_code_prefix as zip_code_prefix,
    lower(trim(seller_city)) as city,
    upper(trim(seller_state)) as state
from {{ source('raw', 'olist_sellers') }}
