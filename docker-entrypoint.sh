#!/bin/sh
set -eu

if [ ! -f /pb_data/data.db ]; then
  : "${PB_SUPERUSER_EMAIL:?首次初始化需要 PB_SUPERUSER_EMAIL}"
  : "${PB_SUPERUSER_PASSWORD:?首次初始化需要 PB_SUPERUSER_PASSWORD}"
  /app/pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" --dir=/pb_data
fi

exec /app/pocketbase serve --http=0.0.0.0:8090 --dir=/pb_data --hooksDir=/app/pb_hooks --migrationsDir=/app/pb_migrations
