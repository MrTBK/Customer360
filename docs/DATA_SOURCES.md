# Data Sources Documentation

## 1. Primary Dataset: Brazilian E-Commerce Public Dataset by Olist
- **Source**: Olist & Kaggle Public Datasets (Published by Olist, Brazilian e-commerce department store marketplace)
- **License**: CC BY-NC-SA 4.0 (Public analytical dataset)
- **Timeframe**: October 2016 to October 2018 (peak order window January 2017 to August 2018)
- **Coverage**: 99,441 orders across 27 Brazilian states (UF) and 4,119 cities.
- **Currency**: Brazilian Real (BRL - R$)
- **Total Tables**: 7 tables, 551,464 records, 61.2 MB uncompressed raw storage.

---

## 2. Source Tables, Verified Row Counts & Profiles

| Table File | Row Count | Column Count | Storage Size | SHA256 Checksum |
|---|---|---|---|---|
| `olist_customers.csv` | 99,441 | 5 | 9.03 MB | `983a422239e1712ded753b3bf9ecf47dc73f144d306029dcfa99e70a226883d2` |
| `olist_orders.csv` | 99,441 | 8 | 17.65 MB | `2e68ce0df08272fca6eb4351e34ff60b731caef0730d703bb3e5ec4f0a078d46` |
| `olist_order_items.csv` | 112,650 | 6 | 13.19 MB | `1dc8b16b5a5933617be8daff3f8ebbf45eaebaf6f54c93540026e6a12fa19869` |
| `olist_payments.csv` | 103,886 | 5 | 5.78 MB | `ea4017de83f6f36113b5e434f66a2e41bf1fcbf7fc4c207d56cc33ce105d15ca` |
| `olist_reviews.csv` | 100,000 | 7 | 14.41 MB | `f086207c5765c92c81d331908dfdf7cb641c888d3caad0ffb8bca612e69fb2fc` |
| `olist_products.csv` | 32,951 | 9 | 2.38 MB | `4c84a56a69efaf44c4b5d21394f45ca099710f2771b93f66d400e9803d2bfeec` |
| `olist_sellers.csv` | 3,095 | 4 | 0.17 MB | `a4ae8e805566378e9b60d4a9464654b5dfd4f09d846ff9c5f87bdfc83dcf8c86` |

### 1. `olist_customers`
- **Grain**: One row per customer order key (`customer_id`). Note: `customer_unique_id` represents the actual distinct human buyer, allowing identification of repeat purchasers across multiple orders.
- **Attributes**:
  - `customer_id` (PK for order customer instance)
  - `customer_unique_id` (Unique identifier of the actual human customer)
  - `customer_zip_code_prefix` (First 5 digits of postal code)
  - `customer_city` (City name)
  - `customer_state` (Federative state abbreviation, e.g., SP, RJ, MG)

### 2. `olist_orders`
- **Grain**: One row per unique order (`order_id`).
- **Attributes**:
  - `order_id` (PK)
  - `customer_id` (FK to `olist_customers`)
  - `order_status` (`delivered`, `shipped`, `canceled`, `invoiced`, `processing`, `unavailable`)
  - `order_purchase_timestamp`
  - `order_approved_at`
  - `order_delivered_carrier_date`
  - `order_delivered_customer_date`
  - `order_estimated_delivery_date`

### 3. `olist_order_items`
- **Grain**: One row per item line inside an order (`order_id`, `order_item_id`).
- **Attributes**:
  - `order_id` (FK to `olist_orders`)
  - `order_item_id` (Sequential item index: 1, 2, 3...)
  - `product_id` (FK to `olist_products`)
  - `seller_id` (FK to `olist_sellers`)
  - `shipping_limit_date`
  - `price` (Item price in BRL)
  - `freight_value` (Shipping fee in BRL)

### 4. `olist_products`
- **Grain**: One row per distinct product SKU (`product_id`).
- **Attributes**:
  - `product_id` (PK)
  - `product_category_name` (Portuguese category name, e.g., `beleza_saude`, `cama_mesa_banho`, `informatica_acessorios`)
  - `product_name_lenght`
  - `product_description_lenght`
  - `product_photos_qty`
  - `product_weight_g`
  - `product_length_cm`, `product_height_cm`, `product_width_cm`

### 5. `olist_payments`
- **Grain**: One row per payment sequence installment or tender method (`order_id`, `payment_sequential`).
- **Attributes**:
  - `order_id` (FK to `olist_orders`)
  - `payment_sequential` (Payment sequence index)
  - `payment_type` (`credit_card`, `boleto`, `voucher`, `debit_card`, `not_defined`)
  - `payment_installments` (Number of credit installments)
  - `payment_value` (Monetary transaction value in BRL)

### 6. `olist_reviews`
- **Grain**: One row per customer order feedback survey (`review_id`).
- **Attributes**:
  - `review_id` (PK)
  - `order_id` (FK to `olist_orders`)
  - `review_score` (Integer 1 to 5)
  - `review_comment_title`
  - `review_comment_message`
  - `review_creation_date`
  - `review_answer_timestamp`

### 7. `olist_sellers`
- **Grain**: One row per marketplace seller (`seller_id`).
- **Attributes**:
  - `seller_id` (PK)
  - `seller_zip_code_prefix`
  - `seller_city`
  - `seller_state`

---

## 3. Data Integrity & Business Realities
1. **Repeat Purchase Rate**: In Olist marketplace data, repeat purchase frequency is approximately 3% to 4% at the unique customer level (`customer_unique_id`), reflecting a typical marketplace where many buyers make an occasional purchase. This makes churn modeling and RFM analysis particularly interesting because true loyalists (Frequency >= 2 or 3) are high-value champions.
2. **Missing Product Categories**: Approximately 0.6% of products lack a category name in raw data. The staging layer categorizes these as `uncategorized` and logs the data quality metric.
3. **Delivery Performance**: Delivery delay is calculated by comparing `order_delivered_customer_date` to `order_estimated_delivery_date`. Delays strongly correlate with negative review scores (1 or 2 stars).
4. **No Financial Fabrications**: Olist records transactional customer prices and shipping values (`freight_value`). It does *not* record merchant wholesale cost-of-goods-sold (COGS) or net corporate margins; therefore, Lifetime Value (CLV) is calculated strictly as **Historical Customer Revenue** and predicted future gross merchandise revenue without fabricating fictional profit margins.
