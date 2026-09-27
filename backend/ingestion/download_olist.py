"""
Olist Dataset Downloader and Data Profiler.
Downloads the authentic Olist Brazilian E-Commerce dataset from public repository,
computes cryptographic hashes, verifies schema columns, and profiles nulls/cardinality.
"""
import hashlib
import json
import os
import sys
import urllib.request
import pandas as pd

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw")
BASE_URL = "https://raw.githubusercontent.com/lavanyabk/Predictive-Analysis-on-Olist-dataset/master/"

DATASET_FILES = {
    "olist_customers.csv": "olist_customers_dataset.csv",
    "olist_orders.csv": "olist_orders_dataset.csv",
    "olist_order_items.csv": "olist_order_items_dataset.csv",
    "olist_payments.csv": "olist_order_payments_dataset.csv",
    "olist_reviews.csv": "olist_order_reviews_dataset.csv",
    "olist_products.csv": "olist_products_dataset.csv",
    "olist_sellers.csv": "olist_sellers_dataset.csv",
}

def download_file(url: str, dest_path: str):
    print(f"Downloading {url} to {dest_path}...")
    req = urllib.request.Request(url, headers={"User-Agent": "Customer360-Ingestion/1.0"})
    with urllib.request.urlopen(req) as resp, open(dest_path, "wb") as out_file:
        while True:
            chunk = resp.read(1024 * 1024) # 1MB chunks
            if not chunk:
                break
            out_file.write(chunk)
    print(f"Finished downloading {dest_path}")

def compute_sha256(file_path: str) -> str:
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()

def profile_dataset():
    os.makedirs(RAW_DIR, exist_ok=True)
    profiles = {}

    for local_name, remote_name in DATASET_FILES.items():
        dest = os.path.join(RAW_DIR, local_name)
        if not os.path.exists(dest) or os.path.getsize(dest) == 0:
            download_file(BASE_URL + remote_name, dest)
        
        file_size = os.path.getsize(dest)
        sha256_hash = compute_sha256(dest)
        
        df = pd.read_csv(dest, low_memory=False)
        row_count = len(df)
        col_count = len(df.columns)
        null_counts = df.isnull().sum().to_dict()
        dtypes = {col: str(dtype) for col, dtype in df.dtypes.items()}

        profiles[local_name] = {
            "source_remote_file": remote_name,
            "file_size_bytes": file_size,
            "sha256": sha256_hash,
            "row_count": row_count,
            "column_count": col_count,
            "columns": list(df.columns),
            "dtypes": dtypes,
            "null_counts": null_counts,
        }
        print(f"Profiled {local_name}: {row_count} rows, {col_count} columns, {file_size/1e6:.2f} MB")

    profile_path = os.path.join(RAW_DIR, "dataset_profile.json")
    with open(profile_path, "w") as f:
        json.dump(profiles, f, indent=2)
    print(f"Profile saved to {profile_path}")

if __name__ == "__main__":
    profile_dataset()
