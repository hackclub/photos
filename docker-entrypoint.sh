#!/bin/sh
set -eu

if [ -n "${DATABASE_URL:-}" ]; then
  echo "Running database migrations..."
  bunx drizzle-kit migrate
  printf '\n'
fi

exec bun server.js
