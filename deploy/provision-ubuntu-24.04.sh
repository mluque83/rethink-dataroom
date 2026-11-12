#!/usr/bin/env bash
# Provision a fresh Ubuntu 24.04 server for the data room (idempotent). Run as root:
#   sudo DOMAIN=dataroom.rethinkmedical.es REPO=https://github.com/mluque83/rethink-dataroom.git bash provision-ubuntu-24.04.sh
# Before running: /etc/dataroom/env must exist (copy deploy/env.production.example and fill it; mode 600).
# The repository is private: use a read-only deploy key or a fine-grained token with read access.
set -euo pipefail
DOMAIN="${DOMAIN:-dataroom.rethinkmedical.es}"
REPO="${REPO:?set REPO}"
BRANCH="${BRANCH:-main}"
APP=/opt/dataroom/app

[ -f /etc/dataroom/env ] || { echo "missing /etc/dataroom/env (see deploy/env.production.example)"; exit 1; }
chmod 600 /etc/dataroom/env

echo "== packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg git ufw unattended-upgrades age \
  libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress fonts-dejavu fonts-liberation \
  poppler-utils qpdf libimage-exiftool-perl tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng bubblewrap \
  clamav clamav-daemon postgresql-client-16 debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi

echo "== antivirus (official signatures)"
systemctl stop clamav-freshclam || true
freshclam || true
systemctl enable --now clamav-freshclam clamav-daemon
sed -i 's/^#\?TCPSocket .*/TCPSocket 3310/; s/^#\?TCPAddr .*/TCPAddr 127.0.0.1/' /etc/clamav/clamd.conf
grep -q '^TCPSocket' /etc/clamav/clamd.conf || printf 'TCPSocket 3310\nTCPAddr 127.0.0.1\n' >> /etc/clamav/clamd.conf
systemctl restart clamav-daemon

echo "== service user and code"
id dataroom >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/dataroom --shell /usr/sbin/nologin dataroom
install -d -o dataroom -g dataroom -m 700 /opt/dataroom /var/backups/dataroom
chgrp dataroom /etc/dataroom/env && chmod 640 /etc/dataroom/env
if [ ! -d "$APP/.git" ]; then sudo -u dataroom git clone --branch "$BRANCH" "$REPO" "$APP"; else sudo -u dataroom git -C "$APP" pull --ff-only; fi
cd "$APP"
sudo -u dataroom npm ci --no-audit --no-fund
sudo -u dataroom bash -c 'set -a; . /etc/dataroom/env; set +a; npx next build'
sudo -u dataroom ENV_FILE=/etc/dataroom/env npx tsx scripts/migrate.ts
sudo -u dataroom ENV_FILE=/etc/dataroom/env node --conditions=react-server --import tsx scripts/seed.ts

echo "== sandbox self-test (must pass: conversions refuse to run otherwise)"
if ! sudo -u dataroom bwrap --unshare-all --ro-bind / / --dev /dev --proc /proc true; then
  echo "bubblewrap cannot create namespaces for user 'dataroom'."
  echo "On Ubuntu 24.04 check AppArmor: sysctl kernel.apparmor_restrict_unprivileged_userns" ; exit 1
fi

echo "== services"
install -m 644 deploy/systemd/*.service deploy/systemd/*.timer /etc/systemd/system/
sed "s/dataroom.rethinkmedical.es/$DOMAIN/" deploy/Caddyfile > /etc/caddy/Caddyfile
install -d -o caddy -g caddy /var/log/caddy
systemctl daemon-reload
systemctl enable --now dataroom-web dataroom-worker dataroom-retention.timer dataroom-backup.timer
systemctl reload caddy || systemctl restart caddy

echo "== firewall"
ufw default deny incoming; ufw default allow outgoing
ufw allow OpenSSH; ufw allow 80/tcp; ufw allow 443/tcp
ufw --force enable
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== done. Next: create the first administrator:"
echo "   sudo -u dataroom bash -c 'cd $APP && read -rs PW && echo -n \"\$PW\" | ENV_FILE=/etc/dataroom/env node --conditions=react-server --import tsx scripts/create-admin.ts --email <you> --name <name> --password-stdin'"
