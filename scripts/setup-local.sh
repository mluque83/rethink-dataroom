#!/usr/bin/env bash
# Creates the local databases and a .env.local with random development secrets.
# Secrets are written only to .env.local (git-ignored, mode 600).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
scripts/local-services.sh start
if [ -f .env.local ]; then echo ".env.local already exists — leaving it untouched"; exit 0; fi
rand() { node -e "process.stdout.write(require('crypto').randomBytes(${1:-32}).toString('base64url'))"; }
DBPASS="$(rand 24)"
scripts/local-services.sh psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dataroom') THEN
    CREATE ROLE dataroom LOGIN PASSWORD '${DBPASS}';
  ELSE
    ALTER ROLE dataroom PASSWORD '${DBPASS}';
  END IF;
END \$\$;
SQL
for db in dataroom_dev dataroom_test; do
  scripts/local-services.sh psql -q -tc "\"SELECT 1 FROM pg_database WHERE datname='$db'\"" | grep -q 1 || \
    scripts/local-services.sh psql -q -c "\"CREATE DATABASE $db OWNER dataroom\""
done
umask 077
sed -e "s|^DATABASE_URL=.*|DATABASE_URL=postgres://dataroom:${DBPASS}@127.0.0.1:54329/dataroom_dev|" \
    -e "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(rand 48)|" \
    -e "s|^LOG_HMAC_KEY=.*|LOG_HMAC_KEY=$(rand 32)|" .env.example > .env.local
sed -e "s|dataroom_dev|dataroom_test|" -e "s|^STORAGE_LOCAL_DIR=.*|STORAGE_LOCAL_DIR=./.local/storage-test|" .env.local > .env.test.local
echo "Wrote .env.local and .env.test.local (mode 600). Databases: dataroom_dev, dataroom_test"
