# Security

## Authentication
- JWT (HS256, pyjwt), 8h TTL (`C360_JWT_TTL`), secret from `C360_JWT_SECRET`.
- Passwords: pbkdf2-sha256, 200k iterations, per-user salt (`auth.users`).
- Open local mode: with zero provisioned users and no `C360_API_KEY`, the API
  accepts all requests as `local-dev` (documented convenience, not a bypass:
  provisioning any user disables it).
- Optional shared-key gate: `C360_API_KEY` enforces `x-api-key` on `/api/*`
  except `/api/health`. Frontend sends `VITE_API_KEY` when set.

## Roles
- **Viewer**: read dashboards and analytics (GET only).
- **Analyst**: + Data Explorer queries and CSV export logging.
- **Admin**: + user management, audit log view, pipeline trigger.
- Enforcement is server-side on every management endpoint (401/403 tested).

## Audit logging
- `auth.audit_log` records LOGIN, LOGOUT, USER_CREATE, PIPELINE_RUN,
  CSV_EXPORT, EXPLORE with username, resource, row counts and status.
- Viewed at `/api/audit` and the Audit page (Admin only).

## Notes
- Demo accounts (admin/analyst/viewer) exist in this workspace DB; rotate or
  drop them before any shared deployment.
- No secrets are committed: credentials travel via environment only.
- JWT secret defaults to a dev value; set `C360_JWT_SECRET` in real use.
