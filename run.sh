#!/usr/bin/env bash
# Run Customer360 app: FastAPI backend (8000) + Vite frontend (3002).
# Usage: ./run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

API_PORT="${API_PORT:-8000}"
APP_PORT="${APP_PORT:-3002}"
PG_PORT="${PG_PORT:-5433}"
VENV="$ROOT/.venv"
LOG_DIR="/tmp/customer360"
mkdir -p "$LOG_DIR"

# 0. PostgreSQL container (production runtime database)
if ! docker exec customer360-postgres pg_isready -U c360_user -d customer360 >/dev/null 2>&1; then
  if docker ps -a --format '{{.Names}}' | grep -q '^customer360-postgres$'; then
    docker start customer360-postgres >/dev/null
  else
    docker run -d --name customer360-postgres \
      -e POSTGRES_USER=c360_user -e POSTGRES_PASSWORD=c360_password -e POSTGRES_DB=customer360 \
      -p "${PG_PORT}:5432" -v customer360_pgdata:/var/lib/postgresql/data \
      postgres:15-alpine >/dev/null
  fi
  for _ in $(seq 1 30); do
    docker exec customer360-postgres pg_isready -U c360_user -d customer360 >/dev/null 2>&1 && break
    sleep 1
  done
fi
export DATABASE_URL="postgresql://c360_user:c360_password@127.0.0.1:${PG_PORT}/customer360"

cleanup() {
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 1. Python env + minimal API deps
if [ ! -x "$VENV/bin/python" ]; then
  if command -v uv >/dev/null 2>&1; then
    uv venv "$VENV"
  else
    python3 -m venv "$VENV"
  fi
fi
if ! "$VENV/bin/python" -c "import fastapi, uvicorn, psycopg2" 2>/dev/null; then
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python "$VENV/bin/python" -q fastapi "uvicorn[standard]" pydantic httpx psycopg2-binary
  else
    "$VENV/bin/pip" install -q fastapi "uvicorn[standard]" pydantic httpx psycopg2-binary
  fi
fi

# 2. Start backend
"$VENV/bin/python" -m uvicorn backend.api.main:app --host 127.0.0.1 --port "$API_PORT" >"$LOG_DIR/api.log" 2>&1 &
API_PID=$!

for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -sf "http://127.0.0.1:${API_PORT}/api/health" >/dev/null || {
  echo "Backend failed to start. Log: $LOG_DIR/api.log"
  tail -20 "$LOG_DIR/api.log"
  exit 1
}

# 3. Frontend deps + start (foreground)
if [ ! -d "$ROOT/node_modules" ]; then
  npm install
fi

echo "API:      http://127.0.0.1:${API_PORT}/api/health"
echo "Frontend: http://127.0.0.1:${APP_PORT}/"
npm run dev -- --port="$APP_PORT" --host=0.0.0.0
