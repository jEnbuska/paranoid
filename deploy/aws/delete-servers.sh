#!/usr/bin/env bash
# Terminates Paranoid instances in REGION, which deletes their disks and
# releases their public IP addresses, and deletes their backstop schedules.
# The aws CLI has the deploy or cleanup role's short-lived credentials.
#
# Usage:
#   delete-servers.sh all          every instance that isn't terminated yet
#   delete-servers.sh finished     instances past their expiry time, or
#                                  stopped. One that's pending, running or
#                                  stopping with an expiry in the future is
#                                  left alone, so this never removes a
#                                  deploy's new instance.
#   delete-servers.sh run <id>     the instance of one deploy run
#
# A Paranoid instance is one tagged app=paranoid. The deploy role can't
# terminate any other.
set -euo pipefail

here=$(dirname "$0")
# shellcheck source=deploy/aws/names.sh
. "$here/names.sh"

filters=("Name=tag:$TAG_KEY,Values=$TAG_VALUE" "Name=instance-state-name,Values=pending,running,stopping,stopped")
mode=${1:-}
case "$mode" in
  all | finished) ;;
  run)
    [[ ${2:-} =~ ^[0-9]+$ ]] || {
      echo "Usage: $0 run <run-id>" >&2
      exit 2
    }
    filters+=("Name=tag:run,Values=$2")
    ;;
  *)
    echo "Usage: $0 all | finished | run <run-id>" >&2
    exit 2
    ;;
esac

# ID, state and expiry time of each. An instance without a valid expiry tag
# counts as expired.
now=$(date +%s)
ids=()
while read -r id state expires; do
  [[ $id =~ ^i-[0-9a-f]+$ ]] || continue
  [[ $expires =~ ^[0-9]+$ ]] || expires=0
  if [ "$mode" = finished ] && [ "$state" != stopped ] && ((expires > now)); then
    continue
  fi
  echo "Terminating $id ($state)"
  ids+=("$id")
done < <(aws ec2 describe-instances --filters "${filters[@]}" --output json |
  jq -r '.Reservations[].Instances[]
    | "\(.InstanceId) \(.State.Name) \((.Tags // []) | map(select(.Key == "expires"))[0].Value // "")"')

if ((${#ids[@]} == 0)); then
  echo "No instance to terminate."
  exit 0
fi
# One at a time, so one that's gone doesn't stop the others. Stop, Clean up,
# a failed deploy and the backstop can all terminate the same instance at
# once. Terminating one that's shutting down or terminated already succeeds,
# and one that's gone altogether counts as done too.
gone() {
  [[ $1 == *InvalidInstanceID.NotFound* ]]
}
failed=0
terminated=()
for id in "${ids[@]}"; do
  if error=$(aws ec2 terminate-instances --instance-ids "$id" 2>&1 >/dev/null); then
    terminated+=("$id")
  elif gone "$error"; then
    echo "$id is already gone."
  else
    echo "::error::Couldn't terminate $id: $error"
    failed=1
  fi

  # Its backstop schedule has nothing left to do. One that's already gone,
  # because it ran or something else deleted it, is fine. Any other error
  # only leaves a schedule that costs nothing and deletes itself after it
  # runs.
  if ! error=$(aws scheduler delete-schedule --group-name "$SCHEDULE_GROUP" --name "paranoid-$id" 2>&1 >/dev/null) &&
    [[ $error != *ResourceNotFoundException* ]]; then
    echo "::warning::Couldn't delete the backstop schedule of $id: $error"
  fi
done

# ${a[@]+...}: an empty list, without set -u failing on older bash
for id in ${terminated[@]+"${terminated[@]}"}; do
  if ! error=$(aws ec2 wait instance-terminated --instance-ids "$id" 2>&1 >/dev/null) && ! gone "$error"; then
    echo "::error::$id didn't terminate: $error"
    failed=1
  fi
done
echo "Terminated ${#terminated[@]} instance(s)."
exit "$failed"
