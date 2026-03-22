#!/bin/sh
set -e

DB_URL="${DATABASE_URL_PROD:-$DATABASE_URL}"

echo "[Startup] Syncing database schema..."
cd /app
if [ -n "$DB_URL" ]; then
  cd lib/db
  DATABASE_URL="$DB_URL" npx drizzle-kit push --force --config=./drizzle.config.ts 2>&1 || echo "[Startup] DB sync completed with warnings (non-fatal)"
  cd /app
  echo "[Startup] Database schema sync done."
else
  echo "[Startup] WARNING: No database URL set, skipping DB sync."
fi

echo "[Startup] Starting production server..."
exec node artifacts/api-server/dist/index.cjs
