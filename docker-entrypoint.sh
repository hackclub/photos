#!/bin/sh
set -eu

if [ -n "${DATABASE_URL:-}" ]; then
  echo "Running database migrations..."
  bun scripts/run-migrations.js
  printf '\n'
fi

exec bun --require ./otel-bootstrap.cjs server.js
