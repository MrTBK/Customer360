select
    to_char(d, 'YYYYMMDD')::integer as date_key,
    d::text as calendar_date,
    (extract(isodow from d)::integer - 1) as day_of_week,
    to_char(d, 'Dy') as day_name,
    extract(month from d)::integer as month_number,
    to_char(d, 'Mon') as month_name,
    extract(quarter from d)::integer as quarter,
    extract(year from d)::integer as year,
    case when extract(isodow from d) >= 6 then 1 else 0 end as is_weekend
from generate_series('2016-09-01'::date, '2018-11-01'::date, '1 day') as d
