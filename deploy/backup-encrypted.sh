#!/usr/bin/env bash
# Nightly backup encrypted with age to a public key (the private key is kept OFF the server).
# Requires BACKUP_AGE_RECIPIENT and BACKUP_DIR in /etc/dataroom/env.
set -euo pipefail
cd /opt/dataroom/app
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT}" "${BACKUP_DIR:?set BACKUP_DIR}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ); WORK=$(mktemp -d); trap 'rm -rf "${WORK:?}"' EXIT
ENV_FILE=/etc/dataroom/env bash scripts/backup.sh "$WORK/b"
tar -C "$WORK" -cf - b | age -r "$BACKUP_AGE_RECIPIENT" > "$BACKUP_DIR/dataroom-$STAMP.tar.age"
find "$BACKUP_DIR" -name 'dataroom-*.tar.age' -mtime +30 -delete
echo "backup written: $BACKUP_DIR/dataroom-$STAMP.tar.age"
