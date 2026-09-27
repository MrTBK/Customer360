select
    review_id,
    order_id,
    review_score,
    review_comment_title,
    review_comment_message,
    review_creation_date,
    review_answer_timestamp
from {{ source('raw', 'olist_reviews') }}
where review_score between 1 and 5
