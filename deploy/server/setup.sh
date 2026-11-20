#!/usr/bin/env bash
# Sets up a Paranoid server on Debian: Node.js, the signaling server, Caddy
# with HTTPS, and a limit on outbound traffic. cloud-init (cloud-init.yaml)
# runs it once, as root, from the deployed commit in /opt/paranoid/app.
#
# Nothing here depends on the cloud provider. It reads /etc/paranoid/deploy.env:
# - MAX_INVITES: invites the signaling server creates before it exits, after
#   which the server powers off.
# - MAX_EGRESS_MBIT: outbound limit for the whole server, in Mbit/s.
# - PARANOID_HOST, optional: the server's hostname. Unset means
#   <ip-with-dashes>.sslip.io, from the IPv4 address of the default route,
#   which works where the public address is on the server itself, as on
#   UpCloud and Hetzner. Set it where the server is behind NAT and only sees
#   a private address, as on Azure, AWS and GCP. Empty means unset.
set -euo pipefail

app=/opt/paranoid/app
node_dir=/opt/paranoid/node
node_version=24.22.3
caddy_version=2.11.9

# From https://nodejs.org/dist/v<version>/SHASUMS256.txt and the Caddy
# release's caddy_<version>_checksums.txt
case "$(dpkg --print-architecture)" in
  amd64)
    node_arch=x64
    node_sha256=061ec3e3062115705b56b51fa9cc330ab50d34b6969387d4e4b1a50c6809acc2
    caddy_arch=amd64
    caddy_sha512=0e85544340290a16ce4bfb76fe7d65e9de1bf3a6e67f5ccfff30b30d27ea4c73e078077b7bf3e58ae60b6b12e44327705287059c775bca5782e8ee85ea7edd75
    ;;
  arm64)
    node_arch=arm64
    node_sha256=261af2af250dfd7e9f25cf151d1b2713a0adf8f10a9ad116c4947f68627affe8
    caddy_arch=arm64
    caddy_sha512=9e5e76d7888542924de2c25353ae87c5f77e2a22c5b1198633cae13688922282e05383d142599205c88d8d80eee5e967d291214d7abce4835329a191b20dd6e0
    ;;
  *)
    echo "Unsupported architecture: $(dpkg --print-architecture)" >&2
    exit 1
    ;;
esac

# Read as data, not run as a script, so no value in it can run a command.
# Only the names below count.
MAX_INVITES='' MAX_EGRESS_MBIT='' PARANOID_HOST=''
while IFS='=' read -r key value; do
  case "$key" in
    MAX_INVITES) MAX_INVITES=$value ;;
    MAX_EGRESS_MBIT) MAX_EGRESS_MBIT=$value ;;
    PARANOID_HOST) PARANOID_HOST=$value ;;
  esac
done </etc/paranoid/deploy.env
[[ $MAX_INVITES =~ ^[1-9][0-9]*$ ]] || {
  echo "MAX_INVITES isn't a whole number of at least 1: '$MAX_INVITES'" >&2
  exit 1
}
[[ $MAX_EGRESS_MBIT =~ ^[1-9][0-9]*$ ]] || {
  echo "MAX_EGRESS_MBIT isn't a whole number of at least 1: '$MAX_EGRESS_MBIT'" >&2
  exit 1
}

# A hostname: it goes into the Caddyfile and CORS_ORIGINS.
if [ -n "$PARANOID_HOST" ] && ! [[ $PARANOID_HOST =~ ^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$ ]]; then
  echo "PARANOID_HOST isn't a hostname: '$PARANOID_HOST'" >&2
  exit 1
fi
if [ -z "$PARANOID_HOST" ]; then
  # A route lookup only: nothing is sent to that address.
  ip=$(ip -4 route get 1.1.1.1 | sed -n 's/.* src \([0-9.]*\).*/\1/p')
  case "$ip" in
    "" | 10.* | 192.168.* | 172.1[6-9].* | 172.2[0-9].* | 172.3[01].* | 100.6[4-9].* | 100.[7-9][0-9].* | 100.1[01][0-9].* | 100.12[0-7].*)
      echo "No public IPv4 address on the server (got '$ip'). Set PARANOID_HOST." >&2
      exit 1
      ;;
  esac
  PARANOID_HOST="${ip//./-}.sslip.io"
fi
echo "Setting up https://$PARANOID_HOST"

# Logs stay in memory, and go with the server.
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nStorage=volatile\n' >/etc/systemd/journald.conf.d/paranoid.conf
systemctl restart systemd-journald

# Downloads a file and checks it against its checksum.
download() {
  local url=$1 file=$2 algorithm=$3 sum=$4
  curl -fsSL --retry 3 -o "$file" "$url"
  echo "$sum  $file" | "${algorithm}sum" --check --strict -
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

download "https://nodejs.org/dist/v$node_version/node-v$node_version-linux-$node_arch.tar.gz" \
  "$tmp/node.tar.gz" sha256 "$node_sha256"
mkdir -p "$node_dir"
tar -xzf "$tmp/node.tar.gz" -C "$node_dir" --strip-components=1 --no-same-owner

download "https://github.com/caddyserver/caddy/releases/download/v$caddy_version/caddy_${caddy_version}_linux_$caddy_arch.tar.gz" \
  "$tmp/caddy.tar.gz" sha512 "$caddy_sha512"
tar -xzf "$tmp/caddy.tar.gz" -C /usr/local/bin --no-same-owner caddy

# Installs and builds as a user of its own, so dependency code doesn't run as
# root, then hands the code back to root, so the services can't change it.
# pnpm is the version in package.json's packageManager, through corepack,
# which checks the npm registry's signature on it. The client talks to the
# signaling server on its own origin, through Caddy.
useradd --system --create-home --home-dir /var/lib/paranoid-build --shell /usr/sbin/nologin paranoid-build
chown -R paranoid-build: "$app"

# The smallest plans have 1 GB of memory, which installing and building may
# run out of. A swap file gives them room for the build only, and goes before
# the services start, so nothing they hold in memory is written to disk.
swap=
if [ "$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)" -lt 2000000 ] && [ -z "$(swapon --show --noheadings)" ]; then
  swap=/var/lib/paranoid-build.swap
  fallocate -l 2G "$swap"
  chmod 0600 "$swap"
  mkswap -q "$swap"
  swapon "$swap"
fi

runuser -u paranoid-build -- env \
  HOME=/var/lib/paranoid-build \
  PATH="$node_dir/bin:/usr/bin:/bin" \
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  CI=true \
  sh -ec "
    cd '$app'
    corepack pnpm install --frozen-lockfile --filter 'signaling-server...' --filter 'client-app...'
    VITE_SIGNALING_SERVER=/ corepack pnpm --filter client-app exec vite build
  "
chown -R root:root "$app"
chmod -R go-w "$app"
if [ -n "$swap" ]; then
  swapoff "$swap"
  rm -f "$swap"
fi

install -d -m 0755 /etc/paranoid
cat >/etc/paranoid/signaling.env <<EOF
PORT=8181
HOST=127.0.0.1
CORS_ORIGINS=https://$PARANOID_HOST
MAX_INVITES=$MAX_INVITES
EOF
printf 'PARANOID_HOST=%s\n' "$PARANOID_HOST" >/etc/paranoid/caddy.env

install -m 0644 "$app"/deploy/server/systemd/*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now paranoid-egress.service paranoid-signaling.service paranoid-caddy.service
echo "Paranoid is set up at https://$PARANOID_HOST"
