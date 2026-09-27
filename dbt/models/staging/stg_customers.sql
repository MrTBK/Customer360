select
    customer_id,
    customer_unique_id,
    customer_zip_code_prefix as zip_code_prefix,
    lower(trim(customer_city)) as city,
    upper(trim(customer_state)) as state,
    case
        when upper(trim(customer_state)) in ('SP', 'RJ', 'MG', 'ES') then 'Sudeste'
        when upper(trim(customer_state)) in ('PR', 'RS', 'SC') then 'Sul'
        when upper(trim(customer_state)) in ('BA', 'CE', 'PE', 'MA', 'PB', 'RN', 'AL', 'PI', 'SE') then 'Nordeste'
        when upper(trim(customer_state)) in ('DF', 'GO', 'MT', 'MS') then 'Centro-Oeste'
        else 'Norte'
    end as region
from {{ source('raw', 'olist_customers') }}
where customer_id is not null and customer_unique_id is not null
