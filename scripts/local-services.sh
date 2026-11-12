#!/usr/bin/env bash
# Local development services: a private PostgreSQL cluster inside ./.local
# (never exposed beyond 127.0.0.1) and the private storage directory.
# Usage: scripts/local-services.sh start|stop|status|init
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGDATA="$ROOT/.local/pgdata"
PGPORT="${PGPORT:-54329}"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
LOG="$ROOT/.local/postgres.log"
mkdir -p "$ROOT/.local" "$ROOT/.local/storage"
chmod 711 "$ROOT/.local"; chmod 700 "$ROOT/.local/storage"

as_pg() {
  if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi
}

case "${1:-status}" in
  init)
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
      mkdir -p "$PGDATA" "$ROOT/.local/pgsock"
      if [ "$(id -u)" = "0" ]; then chown -R postgres:postgres "$PGDATA" "$ROOT/.local/pgsock"; chmod 700 "$ROOT/.local/pgsock"; touch "$LOG"; chown postgres "$LOG"; fi
      as_pg "$PGBIN/initdb -D '$PGDATA' --auth-local=peer --auth-host=scram-sha-256 -U postgres --encoding=UTF8 --locale=C.UTF-8 >/dev/null"
      echo "listen_addresses = '127.0.0.1'" >> "$PGDATA/postgresql.conf"
      echo "port = $PGPORT" >> "$PGDATA/postgresql.conf"
      echo "unix_socket_directories = '$ROOT/.local/pgsock'" >> "$PGDATA/postgresql.conf"
      echo "log_statement = 'none'" >> "$PGDATA/postgresql.conf"
      echo "initialised $PGDATA"
    fi
    ;;
  start)
    "$0" init
    if ! as_pg "$PGBIN/pg_ctl -D '$PGDATA' status" >/dev/null 2>&1; then
      as_pg "$PGBIN/pg_ctl -D '$PGDATA' -l '$LOG' -w start" >/dev/null
    fi
    echo "postgres running on 127.0.0.1:$PGPORT"
    ;;
  stop)
    as_pg "$PGBIN/pg_ctl -D '$PGDATA' -m fast stop" || true
    ;;
  psql)
    shift; as_pg "$PGBIN/psql -h '$ROOT/.local/pgsock' -p $PGPORT -U postgres $*"
    ;;
  status)
    as_pg "$PGBIN/pg_ctl -D '$PGDATA' status" || true
    ;;
esac
