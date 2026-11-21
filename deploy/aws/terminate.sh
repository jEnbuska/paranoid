#!/usr/bin/env bash
# Terminates Paranoid instances in REGION, which deletes their disks and
# releases their public IP addresses, and deletes their backstop schedules.
# The aws CLI has the deploy role's short-lived credentials.
#
# Usage:
#   terminate.sh all          every instance that isn't terminated yet
#   terminate.sh expired      instances past their expiry time, or stopped.
#                             An instance that's pending, running or stopping
#                             with an expiry in the future is left alone, so
#                             this never removes a deploy's new instance.
#   terminate.sh run <id>     the instance of one deploy run
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
  all | expired) ;;
  run)
    [[ ${2:-} =~ ^[0-9]+$ ]] || {
      echo "Usage: $0 run <run-id>" >&2
      exit 2
    }
    filters+=("Name=tag:run,Values=$2")
    ;;
  *)
    echo "Usage: $0 all | expired | run <run-id>" >&2
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
  if [ "$mode" = expired ] && [ "$state" != stopped ] && ((expires > now)); then
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
aws ec2 terminate-instances --instance-ids "${ids[@]}" >/dev/null

# Their backstop schedules have nothing left to do.
for id in "${ids[@]}"; do
  aws scheduler delete-schedule --group-name "$SCHEDULE_GROUP" --name "paranoid-$id" 2>/dev/null || true
done

aws ec2 wait instance-terminated --instance-ids "${ids[@]}"
echo "Terminated ${#ids[@]} instance(s)."
