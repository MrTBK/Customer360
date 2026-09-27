"""
Tests for Data Warehousing integrity, fact grains, and referential constraints.
"""
from backend.db.connection import db

def test_fact_orders_grain_uniqueness():
    """Verify grain: exactly one row per order_id in warehouse.fact_orders."""
    conn = db.connect()
    dups = conn.execute("""
        SELECT order_id, COUNT(*) 
        FROM warehouse.fact_orders 
        GROUP BY order_id 
        HAVING COUNT(*) > 1
    """).fetchall()
    assert len(dups) == 0

def test_dim_customer_natural_key_uniqueness():
    """Verify natural key uniqueness in warehouse.dim_customer."""
    conn = db.connect()
    dups = conn.execute("""
        SELECT customer_unique_id, COUNT(*) 
        FROM warehouse.dim_customer 
        GROUP BY customer_unique_id 
        HAVING COUNT(*) > 1
    """).fetchall()
    assert len(dups) == 0

def test_no_negative_prices_in_staging():
    """Verify staging gate prevents negative prices."""
    conn = db.connect()
    neg_prices = conn.execute("SELECT COUNT(*) FROM staging.stg_order_items WHERE price < 0").fetchone()[0]
    assert neg_prices == 0
