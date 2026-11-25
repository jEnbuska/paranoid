#!/usr/bin/env bash
# Creates the Paranoid server on UpCloud, running
# deploy/server/cloud-init.yaml, sets its firewall rules, and writes its UUID,
# host, URL and expiry time to GITHUB_OUTPUT.
#
# Reads REPOSITORY and COMMIT (what the server fetches), RUN_ID, and the
# settings settings.sh checked. upctl reads UPCLOUD_TOKEN from the
# environment. The token never reaches the server: it isn't in the user data,
# the labels or any file.
#
# Nothing upctl returns is printed: a server's details can hold passwords.
set -euo pipefail

here=$(dirname "$0")
name="paranoid-$RUN_ID"
created=$(date +%s)
expires=$((created + LIFETIME_MINUTES * 60))
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

[[ $REPOSITORY =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || {
  echo "::error::Unexpected repository name: $REPOSITORY"
  exit 1
}
[[ $COMMIT =~ ^[0-9a-f]{40}$ ]] || {
  echo "::error::Unexpected commit: $COMMIT"
  exit 1
}

# UpCloud puts the public address on the server itself, so setup.sh finds
# the hostname, and PARANOID_HOST stays empty.
PARANOID_HOST=
export REPOSITORY COMMIT MAX_INVITES LIFETIME_MINUTES MAX_EGRESS_MBIT PARANOID_HOST
# shellcheck disable=SC2016 # envsubst gets the names, not their values
envsubst '$REPOSITORY $COMMIT $MAX_INVITES $LIFETIME_MINUTES $MAX_EGRESS_MBIT $PARANOID_HOST' \
  <"$here/../server/cloud-init.yaml" >"$work/user-data.yaml"

# UpCloud's cloud-init templates take only SSH keys for login. The private
# half of this key is deleted at once, so nobody can use it, and the server
# has no SSH anyway. upctl sends create_password=no and password delivery
# `none`, so UpCloud sets and sends no root password, and remote access (the
# web console) stays off, as it is unless --enable-remote-access is given.
ssh-keygen -q -t ed25519 -N '' -C "$name" -f "$work/key"
rm -f "$work/key"

# Only a public IPv4 interface: no IPv6 and no utility network. The metadata
# service, which gives cloud-init the user data, answers on the public
# network too, and with one interface, the outbound limit on it covers all
# the server's traffic.
echo "Creating $name, a $PLAN server in $ZONE, from $TEMPLATE"
upctl server create \
  --hostname "$name" --title "$name" \
  --zone "$ZONE" --plan "$PLAN" --os "$TEMPLATE" \
  --network family=IPv4,type=public \
  --ssh-keys "$work/key.pub" --password-delivery none \
  --enable-metadata --enable-firewall \
  --user-data "$(cat "$work/user-data.yaml")" \
  --label app=paranoid --label "run=$RUN_ID" \
  --label "created=$created" --label "expires=$expires" \
  --output json >"$work/created.json"

uuid=$(jq -r .uuid "$work/created.json")
[[ $uuid =~ ^[0-9a-f-]{36}$ ]] || {
  echo "::error::UpCloud didn't return the new server's UUID."
  exit 1
}
echo "uuid=$uuid" >>"$GITHUB_OUTPUT"

# Never printed: a password would be in it.
if ! jq -e '[.password, .remote_access_password] | all(. == null or . == "")' "$work/created.json" >/dev/null; then
  echo "::error::UpCloud set a password for $name. Deleting it."
  exit 1
fi

# UpCloud takes rules only once the server exists, and applies them within a
# minute or two. Until then the firewall is on with no rules, which UpCloud
# doesn't document. Either way, SSH is off (cloud-init masks it first thing),
# there's no password and nobody has the key.
bash "$here/firewall-rules.sh" "$uuid"

ip=$(jq -r 'first(.. | objects | select(.access? == "public" and .family? == "IPv4") | .address) // empty' "$work/created.json")
[[ $ip =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || {
  echo "::error::$name has no public IPv4 address."
  exit 1
}
host="${ip//./-}.sslip.io"
echo "Created $name, a $PLAN server in $ZONE: https://$host"
{
  echo "host=$host"
  echo "url=https://$host"
  echo "expires=$expires"
} >>"$GITHUB_OUTPUT"
