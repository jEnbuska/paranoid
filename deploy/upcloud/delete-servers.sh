#!/usr/bin/env bash
# Deletes Paranoid servers on UpCloud, with their storage. A server's public
# IP address goes with it. upctl reads UPCLOUD_TOKEN from the environment.
#
# Usage:
#   delete-servers.sh all          every server, running or not
#   delete-servers.sh finished     servers that are stopped or past their expiry
#                                  (stopped ones only from 15 minutes after
#                                  they were created)
#   delete-servers.sh run <id>     the server of one deploy run
#
# A Paranoid server is one whose hostname is paranoid-<run id> and that has
# the label app=paranoid. Its labels are set in the same call that creates
# it. `upctl server list` doesn't show labels, so each server with such a
# hostname is looked up. A stopped server's storage and IP address are still
# billed, so deleting it is what stops the cost.
#
# `finished` runs while a deploy may be creating or setting up its server, so
# it never touches a server that is starting, running or in maintenance
# before its expiry. A stopped server counts only 15 minutes after its
# `created` label, which is far longer than UpCloud takes to create and start
# it, in case UpCloud reports a server that is still being created as stopped.
# Something else deleting a server first counts as done, so cleanups and a
# stop running together don't fail each other.
#
# Nothing upctl returns is printed: a server's details can hold passwords.
set -euo pipefail

mode=${1:-}
hostname_pattern='^paranoid-[0-9]+$'
case "$mode" in
  all | finished) ;;
  run)
    [[ ${2:-} =~ ^[0-9]+$ ]] || {
      echo "Usage: $0 run <run-id>" >&2
      exit 2
    }
    hostname_pattern="^paranoid-$2\$"
    ;;
  *)
    echo "Usage: $0 all | finished | run <run-id>" >&2
    exit 2
    ;;
esac

candidates=$(upctl server list --output json |
  jq -r --arg pattern "$hostname_pattern" '
    (.servers.server? // .servers // [])[]
    | select(.hostname | test($pattern))
    | "\(.uuid) \(.hostname)"')

now=$(date +%s)
failed=0
deleted=0
while read -r uuid hostname; do
  [ -n "$uuid" ] || continue
  if ! details=$(upctl server show "$uuid" --output json 2>/dev/null); then
    # Something else may have deleted it first
    continue
  fi
  # state, whether it's ours, and its creation and expiry times. A server
  # without a valid label counts as created long ago and expired.
  read -r state ours created expires < <(jq -r '
    ((.labels.label? // .labels // []) | map({(.key): .value}) | add // {}) as $labels
    | "\(.state) \($labels.app == "paranoid") \(($labels.created // "") | tonumber? // 0) \(($labels.expires // "") | tonumber? // 0)"' <<<"$details")
  [ "$ours" = true ] || continue
  if [ "$mode" = finished ] && ((expires > now)); then
    if [ "$state" != stopped ] || ((now - created < 900)); then
      continue
    fi
  fi

  echo "Deleting $hostname ($state) and its storage"
  # --stop stops it first, hard, as a running server can't be deleted. A
  # server that is still starting is in maintenance and can't be stopped
  # yet, so it's tried again for up to 3 minutes.
  attempt=1
  until upctl server delete "$uuid" --stop --delete-storages >/dev/null; do
    if ! upctl server show "$uuid" >/dev/null 2>&1; then
      break # Something else deleted it first
    fi
    if ((attempt >= 18)); then
      echo "::error::Couldn't delete $hostname"
      failed=1
      continue 2
    fi
    attempt=$((attempt + 1))
    sleep 10
  done
  deleted=$((deleted + 1))
done <<<"$candidates"

echo "Deleted $deleted server(s)."
exit "$failed"
