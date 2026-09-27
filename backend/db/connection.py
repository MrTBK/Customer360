"""
Database Connection and Schema Attachment Manager.
Dual-mode: PostgreSQL when DATABASE_URL is set (production runtime),
standalone multi-database SQLite otherwise (local backup / tests).

Supports:
  raw.olist_*
  staging.stg_*
  warehouse.dim_* / warehouse.fact_*
  analytics.customer_*
  ml.*
  monitoring.*
  quarantine.*
"""
import io
import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

DB_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "db")
SCHEMAS = ["raw", "staging", "warehouse", "analytics", "ml", "monitoring", "quarantine"]

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()


def is_pg() -> bool:
    return bool(DATABASE_URL)


def q(sql: str) -> str:
    """Translate SQLite `?` placeholders to Postgres `%s` when in PG mode."""
    if is_pg():
        return sql.replace("?", "%s")
    return sql


def get_db_path(schema: str) -> str:
    os.makedirs(DB_DIR, exist_ok=True)
    return os.path.join(DB_DIR, f"{schema}.db")


class _PGConnectionMixin:
    """SQLite-style helpers on a psycopg2 connection (translates `?` markers)."""

    def execute(self, sql: str, params=None):
        import psycopg2.extras
        cur = super().cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(q(sql), params or ())
        return cur

    def executemany(self, sql: str, seq):
        import psycopg2.extras
        cur = super().cursor()
        cur.executemany(q(sql), seq)
        return cur


def upsert_sql(table: str, columns: List[str]) -> str:
    """INSERT that tolerates re-runs: OR REPLACE on SQLite, ON CONFLICT DO NOTHING on PG."""
    cols = ", ".join(columns)
    holders = ", ".join(["?"] * len(columns))
    if is_pg():
        holders = ", ".join(["%s"] * len(columns))
        return f"INSERT INTO {table} ({cols}) VALUES ({holders}) ON CONFLICT DO NOTHING"
    return f"INSERT OR REPLACE INTO {table} ({cols}) VALUES ({holders})"


class Database:
    def __init__(self, meta_db_name: str = "c360_meta"):
        self.meta_db_name = meta_db_name
        self.conn = None

    def connect(self):
        if self.conn is None:
            if is_pg():
                import psycopg2
                import psycopg2.extensions
                import numpy as _np
                from psycopg2.extensions import AsIs as _AsIs, register_adapter as _reg
                _reg(_np.integer, lambda v: _AsIs(int(v)))
                _reg(_np.floating, lambda v: _AsIs(float(v)))
                _reg(_np.bool_, lambda v: _AsIs(bool(v)))

                class PGConnection(_PGConnectionMixin, psycopg2.extensions.connection):
                    pass

                self.conn = psycopg2.connect(DATABASE_URL, connection_factory=PGConnection)
                # Autocommit: every statement commits immediately so idle API
                # connections never hold locks open across requests. Explicit
                # conn.commit() calls elsewhere stay valid as no-ops.
                self.conn.autocommit = True
            else:
                os.makedirs(DB_DIR, exist_ok=True)
                meta_path = os.path.join(DB_DIR, f"{self.meta_db_name}.db")
                self.conn = sqlite3.connect(meta_path, timeout=30.0, check_same_thread=False)
                self.conn.row_factory = sqlite3.Row
                # Enable WAL mode
                self.conn.execute("PRAGMA journal_mode=WAL;")
                self.conn.execute("PRAGMA synchronous=NORMAL;")

                # Attach all 7 schemas explicitly
                for schema in SCHEMAS:
                    schema_path = get_db_path(schema)
                    try:
                        self.conn.execute(f"ATTACH DATABASE '{schema_path}' AS {schema};")
                    except sqlite3.OperationalError:
                        pass  # already attached
        return self.conn

    def _cursor(self):
        conn = self.connect()
        if is_pg():
            import psycopg2.extras
            return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return conn.cursor()

    def execute(self, sql: str, params: Optional[Tuple[Any, ...]] = None):
        cursor = self._cursor()
        try:
            if params:
                cursor.execute(q(sql), params)
            else:
                cursor.execute(q(sql))
            self.connect().commit()
        except Exception:
            self.connect().rollback()
            raise
        return cursor

    def executemany(self, sql: str, params_list: List[Tuple[Any, ...]]):
        if is_pg() and params_list:
            import re
            import psycopg2.extras
            cursor = self._cursor()
            try:
                base, n = re.subn(r"VALUES\s*\(%s(?:\s*,\s*%s)*\)",
                                  "VALUES %s", q(sql), count=1)
                if n == 1:
                    template = "(" + ", ".join(["%s"] * len(params_list[0])) + ")"
                    psycopg2.extras.execute_values(
                        cursor, base, params_list, template=template, page_size=1000)
                else:
                    cursor.executemany(q(sql), params_list)
                self.connect().commit()
            except Exception:
                self.connect().rollback()
                raise
            return cursor
        cursor = self._cursor()
        try:
            cursor.executemany(q(sql), params_list)
            self.connect().commit()
        except Exception:
            self.connect().rollback()
            raise
        return cursor

    def query(self, sql: str, params: Optional[Tuple[Any, ...]] = None) -> List[Dict[str, Any]]:
        cursor = self._cursor()
        try:
            if params:
                cursor.execute(q(sql), params)
            else:
                cursor.execute(q(sql))
            rows = cursor.fetchall()
        except Exception:
            self.connect().rollback()
            raise
        return [dict(row) for row in rows]

    def query_one(self, sql: str, params: Optional[Tuple[Any, ...]] = None) -> Optional[Dict[str, Any]]:
        results = self.query(sql, params)
        return results[0] if results else None

    def copy_df(self, df, schema_table: str) -> None:
        """Bulk-load a pandas DataFrame. COPY on PG, to_sql on SQLite."""
        if is_pg():
            # Postgres COPY rejects raw CR bytes and '' numerics: flatten
            # newlines in text (documented) and let NaN pass as NULL.
            for _c in df.select_dtypes(include=["object"]).columns:
                df[_c] = df[_c].str.replace(r"[\r\n]+", " ", regex=True)
            buf = io.StringIO()
            df.to_csv(buf, index=False, header=False, lineterminator="\n")
            buf.seek(0)
            cols = ", ".join([f'"{c}"' for c in df.columns])
            cursor = self._cursor()
            cursor.copy_expert(f'COPY {schema_table} ({cols}) FROM STDIN WITH CSV', buf)
            self.connect().commit()
        else:
            import sqlite3 as _sqlite3
            schema, table = schema_table.split(".")
            sub_conn = _sqlite3.connect(get_db_path(schema), timeout=60.0)
            sub_conn.execute(f"DELETE FROM {table};")
            df.to_sql(table, sub_conn, if_exists="append", index=False, chunksize=10000)
            sub_conn.commit()
            sub_conn.close()

    def close(self):
        if self.conn:
            self.conn.close()
            self.conn = None


# Global singleton instance
db = Database()
