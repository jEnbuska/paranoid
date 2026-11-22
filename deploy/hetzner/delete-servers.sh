#!/usr/bin/env bash
# Deletes Paranoid servers (label app=paranoid) on Hetzner Cloud, then their
# firewalls, and the SSH key resources deploys leave behind if they stop
# early. Deleting a server deletes its disk and releases its IP addresses.
# hcloud reads HCLOUD_TOKEN from the environment.
#
# Usage:
#   delete-servers.sh all          every server, firewall and key
#   delete-servers.sh finished     servers that are past their expiry, or off
#                                  and created at least 15 minutes ago, then
#                                  firewalls no server uses and keys, created
#                                  at least 15 minutes ago or expired
#   delete-servers.sh run <id>     the server, firewall and key of one run
#
# A powered-off server is billed like a running one, so deleting it is what
# stops the cost.
#
# `finished` runs while a deploy may be creating or setting up its server, so
# it never touches a server that isn't off before its expiry, nor one created
# less than 15 minutes ago, which is far longer than Hetzner takes to create
# and start it, in case Hetzner reports a server that is still being created
# as off. The same goes for the firewall and key a deploy creates just before
# its server, and a firewall a server still uses is never deleted.
# A server or key without a valid label counts as created long ago and
# expired. Something else deleting one first counts as done, so cleanups, a
# stop and a deploy running together don't fail each other.
#
# Nothing hcloud returns is printed in full.
set -euo pipefail

mode=${1:-}
selector=app=paranoid
case "$mode" in
  all | finished) ;;
  run)
    [[ ${2:-} =~ ^[0-9]+$ ]] || {
      echo "Usage: $0 run <run-id>" >&2
      exit 2
    }
    selector="app=paranoid,run=$2"
    ;;
  *)
    echo "Usage: $0 all | finished | run <run-id>" >&2
    exit 2
    ;;
esac

now=$(date +%s)
label_time='((. // "") | tonumber?) // 0'

servers=$(hcloud server list --selector "$selector" --output json |
  jq -r --arg mode "$mode" --argjson now "$now" "
    .[]
    | select(\$mode != \"finished\"
        or (.labels.expires | $label_time) <= \$now
        or (.status == \"off\" and \$now - (.labels.created | $label_time) >= 900))
    | \"\(.id) \(.name) \(.status)\"")

failed=0
deleted=0
while read -r id name status; do
  [ -n "$id" ] || continue
  echo "Deleting $name ($status)"
  if hcloud server delete "$id" >/dev/null; then
    deleted=$((deleted + 1))
  # Something else may have deleted it first
  elif hcloud server describe "$id" >/dev/null 2>&1; then
    echo "::error::Couldn't delete $name"
    failed=1
  fi
done <<<"$servers"

# A deleted server's firewall is free to delete once Hetzner has detached it,
# which can take a few seconds, so each is tried for up to a minute.
firewalls=$(hcloud firewall list --selector "$selector" --output json |
  jq -r --arg mode "$mode" --argjson now "$now" "
    .[]
    | select(\$mode != \"finished\"
        or ((.applied_to // [] | length) == 0
          and (\$now - (.labels.created | $label_time) >= 900
            or (.labels.expires | $label_time) <= \$now)))
    | \"\(.id) \(.name)\"")
while read -r id name; do
  [ -n "$id" ] || continue
  echo "Deleting the firewall $name"
  attempt=1
  until hcloud firewall delete "$id" >/dev/null 2>&1; do
    if ! hcloud firewall describe "$id" >/dev/null 2>&1; then
      break # Something else deleted it first
    fi
    if ((attempt >= 12)); then
      echo "::error::Couldn't delete the firewall $name"
      failed=1
      break
    fi
    attempt=$((attempt + 1))
    sleep 5
  done
done <<<"$firewalls"

keys=$(hcloud ssh-key list --selector "$selector" --output json |
  jq -r --arg mode "$mode" --argjson now "$now" "
    .[]
    | select(\$mode != \"finished\"
        or \$now - (.labels.created | $label_time) >= 900
        or (.labels.expires | $label_time) <= \$now)
    | \"\(.id) \(.name)\"")
while read -r id name; do
  [ -n "$id" ] || continue
  echo "Deleting the SSH key $name"
  if ! hcloud ssh-key delete "$id" >/dev/null && hcloud ssh-key describe "$id" >/dev/null 2>&1; then
    echo "::error::Couldn't delete the SSH key $name"
    failed=1
  fi
done <<<"$keys"

echo "Deleted $deleted server(s)."
exit "$failed"
