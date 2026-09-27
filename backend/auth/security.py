"""Minimal JWT auth: pbkdf2 hashing (stdlib), HS256 tokens (pyjwt), 3 roles."""
import hashlib
import hmac
import os
import secrets
import time
from typing import Any, Dict, List, Optional

import jwt

from backend.db.connection import db, is_pg

JWT_SECRET = os.environ.get("C360_JWT_SECRET", "dev-only-change-me")
JWT_TTL_SECONDS = int(os.environ.get("C360_JWT_TTL", "28800"))

ROLES = ("Admin", "Analyst", "Viewer")


def init_auth_schema() -> None:
    db.execute("CREATE SCHEMA IF NOT EXISTS auth;")
    db.execute("""
        CREATE TABLE IF NOT EXISTS auth.users (
            username TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS auth.audit_log (
            log_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            resource TEXT NOT NULL,
            rows_affected INTEGER DEFAULT 0,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
    """)


def hash_password(password: str, salt: Optional[str] = None) -> tuple:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return digest, salt


def verify_password(password: str, digest: str, salt: str) -> bool:
    check, _ = hash_password(password, salt)
    return hmac.compare_digest(check, digest)


def create_user(username: str, password: str, role: str) -> None:
    if role not in ROLES:
        raise ValueError(f"role must be one of {ROLES}")
    import datetime
    digest, salt = hash_password(password)
    from backend.db.connection import upsert_sql
    db.execute(upsert_sql("auth.users",
        ["username", "password_hash", "salt", "role", "created_at"]),
        (username, digest, salt, role,
         datetime.datetime.now(datetime.timezone.utc).isoformat()))


def authenticate(username: str, password: str) -> Optional[Dict[str, Any]]:
    row = db.query_one("SELECT * FROM auth.users WHERE username = ?", (username,))
    if not row or not verify_password(password, row["password_hash"], row["salt"]):
        return None
    return {"username": row["username"], "role": row["role"]}


def issue_token(username: str, role: str) -> str:
    now = int(time.time())
    return jwt.encode({"sub": username, "role": role, "iat": now, "exp": now + JWT_TTL_SECONDS},
                      JWT_SECRET, algorithm="HS256")


def parse_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("role") not in ROLES:
            return None
        return payload
    except Exception:
        return None


def record_audit(username: str, action: str, resource: str,
                 rows_affected: int = 0, status: str = "SUCCESS") -> None:
    import datetime
    import uuid
    db.execute("""
        INSERT INTO auth.audit_log
        (log_id, username, action, resource, rows_affected, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (str(uuid.uuid4()), username, action, resource, rows_affected, status,
          datetime.datetime.now(datetime.timezone.utc).isoformat()))


def list_audit(limit: int = 100) -> List[Dict[str, Any]]:
    return db.query("SELECT * FROM auth.audit_log ORDER BY created_at DESC LIMIT ?", (limit,))
