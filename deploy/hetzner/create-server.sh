#!/usr/bin/env bash
# Creates the Paranoid server on Hetzner Cloud, running
# deploy/server/cloud-init.yaml, behind a firewall of its own, and writes its
# host, URL and expiry time to GITHUB_OUTPUT. The SSH key, the firewall and
# the server all get the labels app=paranoid, run, created and expires, so
# delete-servers.sh can find and delete each of them.
#
# Reads REPOSITORY and COMMIT (what the server fetches), RUN_ID, and the
# settings settings.sh checked. hcloud reads HCLOUD_TOKEN from the
# environment. The token never reaches the server: it isn't in the user data,
# the labels or any file.
set -euo pipefail

here=$(dirname "$0")
name="paranoid-$RUN_ID"
created=$(date +%s)
expires=$((created + LIFETIME_MINUTES * 60))
work=$(mktemp -d)

labels=(--label app=paranoid --label "run=$RUN_ID" --label "created=$created" --label "expires=$expires")

cleanup() {
  # The server keeps the key it was created with, and needs no key resource
  hcloud ssh-key delete "$name" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

[[ $REPOSITORY =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || {
  echo "::error::Unexpected repository name: $REPOSITORY"
  exit 1
}
[[ $COMMIT =~ ^[0-9a-f]{40}$ ]] || {
  echo "::error::Unexpected commit: $COMMIT"
  exit 1
}

# A Hetzner server has its public IPv4 address on its own interface, so
# setup.sh works out its hostname itself, and PARANOID_HOST stays empty.
PARANOID_HOST=
export REPOSITORY COMMIT MAX_INVITES LIFETIME_MINUTES MAX_EGRESS_MBIT PARANOID_HOST
# shellcheck disable=SC2016 # envsubst gets the names, not their values
envsubst '$REPOSITORY $COMMIT $MAX_INVITES $LIFETIME_MINUTES $MAX_EGRESS_MBIT $PARANOID_HOST' \
  <"$here/../server/cloud-init.yaml" >"$work/user-data.yaml"

# Without an SSH key, Hetzner sets a root password and emails it, and hcloud
# would print it into the public log. With a key it sets none. The private
# key is deleted at once, so nobody can use the key, and the server has no
# SSH anyway. The key's labels let cleanup-hetzner.yml delete it if this run
# stops before its own cleanup.
ssh-keygen -q -t ed25519 -N '' -C "$name" -f "$work/key"
rm -f "$work/key"
hcloud ssh-key create --name "$name" --public-key-from-file "$work/key.pub" \
  "${labels[@]}" >/dev/null

# Only TCP 80 and 443 get in. Inbound traffic no rule allows is dropped, so
# port 22 is closed. The firewall is applied when the server is created, so
# the server is never reachable without it. Firewalls cost nothing.
hcloud firewall create --name "$name" --rules-file "$here/firewall-rules.json" \
  "${labels[@]}" >/dev/null

# Tries each type in turn, as Hetzner sometimes has a type unavailable in a
# location. The name is unique in the project, so there's never more than one.
IFS=, read -ra types <<<"$SERVER_TYPES"
type_created=
for type in "${types[@]}"; do
  echo "Creating $name, a $type in $LOCATION"
  if hcloud server create --name "$name" --type "$type" --image debian-13 \
    --location "$LOCATION" --ssh-key "$name" --firewall "$name" \
    --user-data-from-file "$work/user-data.yaml" "${labels[@]}" \
    --output json >"$work/created.json"; then
    type_created=$type
    break
  fi
  if hcloud server describe "$name" >/dev/null 2>&1; then
    echo "::error::Creating $name failed, but it exists."
    exit 1
  fi
  echo "::warning::Couldn't create a $type server in $LOCATION."
done
if [ -z "$type_created" ]; then
  echo "::error::None of the server types $SERVER_TYPES could be created in $LOCATION. Set the HCLOUD_SERVER_TYPES or HCLOUD_LOCATION variable to ones Hetzner has available."
  exit 1
fi

# Never printed: a root password would be in it.
if ! jq -e '[.. | objects | .root_password? // empty] | length == 0' "$work/created.json" >/dev/null; then
  echo "::error::Hetzner set a root password for $name. Deleting it."
  hcloud server delete "$name" >/dev/null
  exit 1
fi

ip=$(hcloud server describe "$name" --output json | jq -r .public_net.ipv4.ip)
[[ $ip =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || {
  echo "::error::$name has no IPv4 address."
  exit 1
}
host="${ip//./-}.sslip.io"
echo "Created $name, a $type_created in $LOCATION: https://$host"
{
  echo "host=$host"
  echo "url=https://$host"
  echo "expires=$expires"
  echo "type=$type_created"
} >>"$GITHUB_OUTPUT"
