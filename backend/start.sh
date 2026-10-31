#!/bin/sh
# Production start (Render). Free servers lose uploaded files when they sleep and wake,
# so we rebuild the demo data on every start: the live demo is always clean and every photo works.
# Set SEED_ON_START=keep to keep existing data instead.
set -e
alembic upgrade head
if [ "${SEED_ON_START:-reset}" = "reset" ]; then
  python -m app.seed.seed --reset
else
  python -m app.seed.seed || true   # skips itself if the database already has data
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"