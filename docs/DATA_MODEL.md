# Data Model Documentation

## 1. Schema Hierarchy
Customer360 organizes data into 7 segregated schemas:
1. `raw`: Direct representation of source files with audit columns (`_ingestion_id`, `_source_file`, `_source_hash`, `_ingested_at`, `_source_row_number`).
2. `staging`: Sanitized, typed, and normalized relational representations with column renaming and null imputation where permissible.
3. `quarantine`: Storage for records rejected by validation tests (e.g., negative prices, orphan keys, invalid order status).
4. `warehouse`: Conformed dimensional model (Kimball Star Schema) consisting of conformed dimensions and granular fact tables.
5. `analytics`: Denormalized customer, RFM, cohort, and product affinity analytical marts.
6. `ml`: Preprocessed machine learning feature stores, model metadata, churn scoring, and K-Means cluster assignments.
7. `monitoring`: Operational metadata tracking pipeline runs, task durations, row counts, and data quality check executions.

---

## 2. Dimensional Model (Star Schema)

### Dimensions

#### `warehouse.dim_customer`
- **Grain**: One row per distinct physical customer (`customer_unique_id`).
- **Primary Key**: `customer_key` (surrogate integer key)
- **Natural Key**: `customer_unique_id`
- **Attributes**:
  - `primary_zip_code_prefix` (VARCHAR)
  - `primary_city` (VARCHAR)
  - `primary_state` (VARCHAR)
  - `first_order_date` (TIMESTAMP)
  - `latest_order_date` (TIMESTAMP)
  - `total_lifetime_orders` (INT)
  - `created_at` (TIMESTAMP)

#### `warehouse.dim_product`
- **Grain**: One row per SKU (`product_id`).
- **Primary Key**: `product_key`
- **Natural Key**: `product_id`
- **Attributes**:
  - `product_category_name` (VARCHAR)
  - `product_category_name_english` (VARCHAR)
  - `product_name_length` (INT)
  - `product_description_length` (INT)
  - `product_photos_qty` (INT)
  - `product_weight_g` (NUMERIC)
  - `product_length_cm`, `product_height_cm`, `product_width_cm` (NUMERIC)

#### `warehouse.dim_seller`
- **Grain**: One row per marketplace merchant (`seller_id`).
- **Primary Key**: `seller_key`
- **Natural Key**: `seller_id`
- **Attributes**:
  - `seller_zip_code_prefix` (VARCHAR)
  - `seller_city` (VARCHAR)
  - `seller_state` (VARCHAR)

#### `warehouse.dim_geography`
- **Grain**: One row per geographic zip code / city / state centroid.
- **Primary Key**: `geo_key`
- **Attributes**: `zip_code_prefix`, `city`, `state`, `region` (Sudeste, Sul, Nordeste, Centro-Oeste, Norte)

#### `warehouse.dim_date`
- **Grain**: One row per calendar date.
- **Primary Key**: `date_key` (YYYYMMDD integer)
- **Attributes**: `calendar_date`, `day_of_week`, `day_name`, `month_number`, `month_name`, `quarter`, `year`, `is_weekend`

---

### Fact Tables & Grains

#### `warehouse.fact_orders`
- **Grain**: Exactly one row per customer order transaction (`order_id`).
- **Primary Key**: `order_key`
- **Foreign Keys**: `customer_key`, `order_date_key`
- **Degenerate Dimensions**: `order_id`, `order_status`
- **Timestamps**: `purchase_timestamp`, `approved_at`, `delivered_carrier_date`, `delivered_customer_date`, `estimated_delivery_date`
- **Measures**:
  - `order_item_count` (Count of items in this order)
  - `total_merchandise_amount` (Sum of item prices in BRL)
  - `total_freight_amount` (Sum of shipping fees in BRL)
  - `total_order_amount` (Merchandise + Freight)
  - `delivery_delay_days` (Max(0, delivered_customer_date - estimated_delivery_date))
  - `is_delayed` (BOOLEAN: 1 if delivered after estimate, else 0)

#### `warehouse.fact_order_items`
- **Grain**: Exactly one row per item line item within an order (`order_id`, `order_item_id`).
- **Foreign Keys**: `order_key`, `customer_key`, `product_key`, `seller_key`, `order_date_key`
- **Measures**: `price`, `freight_value`, `total_item_value`

#### `warehouse.fact_payments`
- **Grain**: Exactly one row per payment installment or tender entry (`order_id`, `payment_sequential`).
- **Foreign Keys**: `order_key`, `customer_key`, `payment_date_key`
- **Attributes**: `payment_type`, `payment_installments`
- **Measures**: `payment_value`

#### `warehouse.fact_reviews`
- **Grain**: Exactly one row per customer satisfaction survey (`review_id`).
- **Foreign Keys**: `order_key`, `customer_key`
- **Attributes**: `review_score` (1-5), `review_comment_title`, `review_comment_message`
- **Timestamps**: `review_creation_date`, `review_answer_timestamp`
- **Measures**: `response_time_hours`
