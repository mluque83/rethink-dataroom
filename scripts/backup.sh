#!/usr/bin/env bash
# Backup: PostgreSQL logical dump (custom format) + all storage objects + checksums.
# Usage: ENV_FILE=.env.local scripts/backup.sh [output-dir]
# Production: run from a host with access to DB and bucket; then ENCRYPT the result
# (e.g. `age -r <recipient> ` or gpg) and store it off-site with its own access controls.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-.env.local}"
case "$ENV_FILE" in /*) ;; *) ENV_FILE="./$ENV_FILE";; esac
set -a; . "$ENV_FILE"; set +a
OUT="${1:-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
umask 077; mkdir -p "$OUT"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
"$PGBIN/pg_dump" --format=custom --no-owner --no-privileges --file "$OUT/db.dump" "$DATABASE_URL"
ENV_FILE="$ENV_FILE" node --conditions=react-server --import tsx scripts/storage-copy.ts export "$OUT"
( cd "$OUT" && sha256sum db.dump storage-manifest.json > SHA256SUMS )
echo "{\"createdAt\":\"$(date -u +%FT%TZ)\",\"source\":\"$ENV_FILE\"}" > "$OUT/backup.json"
echo "backup written to $OUT"
