with baskets as (
    select distinct oi.order_id, dp.category_name_english as cat
    from {{ ref('fact_order_items') }} oi
    join {{ ref('dim_product') }} dp on oi.product_key = dp.product_key
    where dp.category_name_english != 'Uncategorized'
),
multi as (
    select order_id from baskets group by order_id having count(*) > 1
),
pairs as (
    select b1.cat as c1, b2.cat as c2
    from baskets b1
    join baskets b2 on b1.order_id = b2.order_id and b1.cat < b2.cat
    where b1.order_id in (select order_id from multi)
),
pc as (
    select c1, c2, count(*) as n from pairs group by c1, c2 having count(*) >= 3
),
tot as (
    select count(distinct order_id)::numeric as t from baskets
),
cc as (
    select cat, count(distinct order_id)::numeric as n from baskets group by cat
),
rules as (
    select c1 as antecedent, c2 as consequent,
        round(cc1.n / tot.t, 4) as antecedent_support,
        round(cc2.n / tot.t, 4) as consequent_support,
        round(pc.n / tot.t, 4) as support,
        round((pc.n / tot.t) / (cc1.n / tot.t), 4) as confidence,
        round(((pc.n / tot.t) / (cc1.n / tot.t)) / (cc2.n / tot.t), 2) as lift
    from pc
    cross join tot
    join cc cc1 on cc1.cat = pc.c1
    join cc cc2 on cc2.cat = pc.c2
    union all
    select c2, c1,
        round(cc2.n / tot.t, 4),
        round(cc1.n / tot.t, 4),
        round(pc.n / tot.t, 4),
        round((pc.n / tot.t) / (cc2.n / tot.t), 4),
        round(((pc.n / tot.t) / (cc2.n / tot.t)) / (cc1.n / tot.t), 2)
    from pc
    cross join tot
    join cc cc1 on cc1.cat = pc.c1
    join cc cc2 on cc2.cat = pc.c2
)
select antecedent, consequent, antecedent_support, consequent_support, support, confidence, lift
from rules
order by lift desc
limit 40
