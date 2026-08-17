#!/bin/sh
set -eu

if [ -n "${DATABASE_URL:-}" ]; then
  echo "Running database migrations..."
  bun scripts/run-migrations.mjs
  printf '\n'
fi

exec bun server.js
