#!/usr/bin/env sh
set -e

# Wait briefly for Postgres (docker-compose healthcheck should already gate this)
# Run migrations
alembic upgrade head

# Start API
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
