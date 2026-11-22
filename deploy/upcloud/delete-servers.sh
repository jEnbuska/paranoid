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
# Deleting a server deletes its storage too (--delete-storages), and UpCloud
# releases its IP addresses. In case a failed create or delete leaves a disk
# behind, every mode then also deletes the disks named paranoid-<run id>-OS,
# upctl's title for a server's disk, that are attached to no server, online
# (not still being cloned) and whose server doesn't exist. UpCloud doesn't
# say whether a disk can exist before its server during `server create`, and
# a disk has no creation time to wait on, so `finished`, which runs beside
# deploys, also skips the disks of the deploy runs in ACTIVE_RUNS, the ids of
# the deploy runs that haven't finished, separated by spaces. Without that
# list (unset or "unknown"), `finished` deletes no such disks. `all` (Stop,
# which cancels a deploy first) and `run` (a failed deploy, after its create
# returned) don't need it. Disks have no labels, because upctl's
# `server create` labels only the server.
#
# Nothing upctl returns is printed: a server's details can hold passwords.
set -euo pipefail

mode=${1:-}
hostname_pattern='^paranoid-[0-9]+$'
disk_pattern='^paranoid-[0-9]+-OS$'
case "$mode" in
  all | finished) ;;
  run)
    [[ ${2:-} =~ ^[0-9]+$ ]] || {
      echo "Usage: $0 run <run-id>" >&2
      exit 2
    }
    hostname_pattern="^paranoid-$2\$"
    disk_pattern="^paranoid-$2-OS\$"
    ;;
  *)
    echo "Usage: $0 all | finished | run <run-id>" >&2
    exit 2
    ;;
esac

servers=$(upctl server list --output json)
candidates=$(jq -r --arg pattern "$hostname_pattern" '
  (.servers.server? // .servers // [])[]
  | select(.hostname | test($pattern))
  | "\(.uuid) \(.hostname)"' <<<"$servers")

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

# Disks left without their server. The server list is read again, after the
# deletes above.
hostnames=$(upctl server list --output json |
  jq -r '(.servers.server? // .servers // [])[] | .hostname')
disks=$(upctl storage list --private --normal --output json |
  jq -r --arg pattern "$disk_pattern" '
    (.storages.storage? // .storages // [])[]
    | select(.title | test($pattern))
    | "\(.uuid) \(.title)"')
active_runs=${ACTIVE_RUNS-unknown}
if [ "$mode" = finished ] && [ "$active_runs" = unknown ]; then
  disks='' # Without the list of running deploys, keep every disk
  echo "Not deleting disks without a server: the running deploys are unknown."
fi
orphans=0
while read -r uuid title; do
  [ -n "$uuid" ] || continue
  run_id=${title#paranoid-}
  run_id=${run_id%-OS}
  if [ "$mode" = finished ] && [[ " $active_runs " == *" $run_id "* ]]; then
    continue # Its deploy hasn't finished, and may be creating its server
  fi
  if grep -qxF "${title%-OS}" <<<"$hostnames"; then
    continue # Its server exists, and is handled above or still running
  fi
  if ! details=$(upctl storage show "$uuid" --output json 2>/dev/null); then
    continue # Something else may have deleted it first
  fi
  read -r state attached < <(jq -r '
    "\(.state) \((.servers.server? // .servers // []) | length)"' <<<"$details")
  if [ "$state" != online ] || [ "$attached" != 0 ]; then
    continue
  fi
  echo "Deleting $title, a disk left without its server"
  if upctl storage delete "$uuid" --backups delete >/dev/null; then
    orphans=$((orphans + 1))
  elif upctl storage show "$uuid" >/dev/null 2>&1; then
    echo "::error::Couldn't delete $title"
    failed=1
  fi
done <<<"$disks"
echo "Deleted $orphans disk(s) left without a server."
exit "$failed"
