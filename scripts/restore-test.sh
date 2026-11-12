#!/usr/bin/env bash
# Restores a backup into an ISOLATED test database + storage directory and verifies it.
# Never touches the source environment. Usage: scripts/restore-test.sh <backup-dir>
set -euo pipefail
cd "$(dirname "$0")/.."
B="$1"
( cd "$B" && sha256sum -c SHA256SUMS )
set -a; . ./.env.test.local; set +a
DB=dataroom_restore_check
TARGET_URL="${DATABASE_URL%/*}/$DB"
scripts/local-services.sh psql -q -c "\"DROP DATABASE IF EXISTS $DB\"" >/dev/null
scripts/local-services.sh psql -q -c "\"CREATE DATABASE $DB OWNER dataroom\"" >/dev/null
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
"$PGBIN/pg_restore" --no-owner --no-privileges --exit-on-error --dbname "$TARGET_URL" "$B/db.dump"
RESTORE_DIR=".local/restore-check-storage"; rm -rf "$RESTORE_DIR"
DATABASE_URL="$TARGET_URL" node --conditions=react-server --import tsx scripts/storage-copy.ts import "$B" --target-dir "$RESTORE_DIR"
DATABASE_URL="$TARGET_URL" STORAGE_DRIVER=local STORAGE_LOCAL_DIR="$RESTORE_DIR" SOURCE_URL="$DATABASE_URL" \
  node --conditions=react-server --import tsx scripts/verify-restore.ts
