with base as (
    select
        product_id,
        coalesce(product_category_name, 'uncategorized') as category_name,
        coalesce(product_photos_qty, 0)::integer as photos_qty,
        coalesce(product_weight_g, 0.0)::float as weight_g
    from {{ source('raw', 'olist_products') }}
)
select
    product_id,
    category_name,
    case lower(trim(category_name))
        when 'cama_mesa_banho' then 'Bed, Bath & Table'
        when 'beleza_saude' then 'Health & Beauty'
        when 'esporte_lazer' then 'Sports & Leisure'
        when 'moveis_decoracao' then 'Furniture & Decor'
        when 'informatica_acessorios' then 'Computers & Accessories'
        when 'utilidades_domesticas' then 'Housewares'
        when 'relogios_presentes' then 'Watches & Gifts'
        when 'telefonia' then 'Telephony'
        when 'automotivo' then 'Automotive'
        when 'brinquedos' then 'Toys'
        when 'ferramentas_jardim' then 'Garden Tools'
        when 'perfumaria' then 'Perfumes'
        when 'bebes' then 'Babies'
        when 'eletronicos' then 'Electronics'
        when 'papelaria' then 'Stationery'
        when 'fashion_bolsas_e_acessorios' then 'Fashion Bags & Accessories'
        when 'pet_shop' then 'Pet Shop'
        when 'construcao_ferramentas_construcao' then 'Construction Tools'
        when 'malas_e_acessorios' then 'Luggage & Bags'
        when 'moveis_escritorio' then 'Office Furniture'
        when 'consoles_games' then 'Video Games & Consoles'
        when 'alimentos' then 'Food & Beverages'
        when 'audio' then 'Audio'
        when 'livros_interesse_geral' then 'Books'
        when 'climatizacao' then 'Air Conditioning'
        else initcap(replace(lower(trim(category_name)), '_', ' '))
    end as category_name_english,
    photos_qty,
    weight_g
from base
