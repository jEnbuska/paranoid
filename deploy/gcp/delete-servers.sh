#!/usr/bin/env bash
# Deletes Paranoid VMs on Google Cloud, with their boot disks, and settles
# each one's cost in the ledger from the times Google Cloud reports for it.
# Only VMs named paranoid-* and labeled app=paranoid are touched, and the
# deploy identity can't delete any other VM anyway.
#
# Usage: delete-servers.sh all|finished|run <deployment>
#   all: every Paranoid VM, running or not (deploy-gcp.yml, stop-gcp.yml)
#   finished: those that powered off, or are past their expires
#     label, the Unix time their lifetime ends, never a VM before it
#     (cleanup-gcp.yml). Google Cloud deletes a VM at the end of its
#     lifetime itself; this is in case that ever fails.
#   run <deployment>: that deployment's VM, after a failed deploy. If it was
#     never created, its whole reservation is released.
# Environment: GCP_BUCKET, CLOUDSDK_CORE_PROJECT
set -euo pipefail

here=$(dirname "$0")
error=$(mktemp)
trap 'rm -f "$error"' EXIT
filter='name ~ ^paranoid- AND labels.app=paranoid'
case "$1" in
  all) ;;
  finished) ;;
  run)
    [[ ${2:-} =~ ^[0-9]+-[0-9]+$ ]] || {
      echo "Usage: delete-servers.sh run <deployment>" >&2
      exit 2
    }
    filter="$filter AND name=paranoid-$2"
    ;;
  *)
    echo "Usage: delete-servers.sh all|finished|run <deployment>" >&2
    exit 2
    ;;
esac

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# finished keeps only what's off or expired, checked here rather than in
# gcloud's filter, which compares labels as text.
vms=$(gcloud compute instances list --filter="$filter" --format=json |
  jq -r --arg mode "$1" --argjson now "$(date +%s)" '.[]
    | select($mode != "finished" or .status == "TERMINATED"
      or ((.labels["expires"] // "") | test("^[0-9]+$") and tonumber <= $now))
    | [.name, (.zone | split("/") | last), .status, .creationTimestamp,
    (.lastStopTimestamp // "-"), (.labels["run"] // "-"),
    (.labels["paranoid-month"] // "-")] | @tsv')

found=0
while IFS=$'\t' read -r name zone status created stopped deployment month; do
  [ -n "$name" ] || continue
  found=1
  echo "Deleting $name in $zone ($status)"
  # Stop, cleanup and a deploy can delete the same VM at once. The one whose
  # delete finds it gone leaves the settlement to the other. One that Google
  # Cloud deletes at the end of its lifetime keeps its full reservation.
  if ! gcloud compute instances delete "$name" --zone="$zone" --delete-disks=all \
    --quiet 2>"$error"; then
    # Gone, or being deleted by another run or by Google Cloud at the end
    # of its lifetime
    if grep -qiE 'not ?found|was not found|not ready|resourceNotReady|being deleted' "$error"; then
      echo "$name is already gone or being deleted elsewhere."
      continue
    fi
    cat "$error" >&2
    exit 1
  fi
  # A VM that's running now, or was until it was deleted, has no stop time:
  # it counts as running until now.
  if [ "$status" != TERMINATED ] || [ "$stopped" = - ]; then
    stopped=
  fi
  if [[ $deployment =~ ^[0-9]+-[0-9]+$ && $month =~ ^[0-9]{4}-[0-9]{2}$ ]]; then
    MONTH=$month DEPLOYMENT=$deployment CREATED=$created STOPPED=$stopped DELETED=$(now) \
      bash "$here/ledger.sh" settle
  else
    echo "::warning::$name has no deployment or month label, so its cost stays counted in full."
  fi
done <<<"$vms"

if [ "$1" = run ] && [ "$found" = 0 ]; then
  echo "No VM was created for $2, so its reservation is released."
  at=$(now)
  DEPLOYMENT=$2 CREATED=$at STOPPED='' DELETED=$at bash "$here/ledger.sh" settle
fi

# A boot disk is deleted with its VM. One that was left behind anyway, with
# no VM using it, is deleted too, but only once it's older than the longest
# lifetime (24 hours) and an hour more. A disk that a deploy is creating
# right now, before its VM uses it, is never touched.
# -P1DT1H: created more than 25 hours ago, in gcloud's filter syntax
gcloud compute disks list \
  --filter='name ~ ^paranoid- AND -users:* AND creationTimestamp < -P1DT1H' \
  --format='value(name,zone.basename())' |
  while read -r name zone; do
    echo "Deleting the disk $name in $zone, which no VM uses"
    gcloud compute disks delete "$name" --zone="$zone" --quiet ||
      echo "::warning::Couldn't delete the disk $name. Another run may have deleted it."
  done

if [ "$found" = 0 ]; then
  echo "No Paranoid VM to delete."
fi
