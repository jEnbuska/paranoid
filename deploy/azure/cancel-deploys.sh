#!/usr/bin/env bash
# Cancels every run of deploy-azure.yml that hasn't finished, whether it's
# waiting for approval, queued or running, and waits up to 10 minutes for
# them to finish. A cancelled deploy deletes the VM it made, in its last
# step. stop-azure.yml runs this before deleting everything, so no deploy
# can create a VM after the stop has looked.
#
# Reads REPO, and GH_TOKEN, the job's own token with `actions: write`.
set -euo pipefail

# unfinished: the IDs of deploy-azure.yml's runs that haven't completed
unfinished() {
  gh run list --repo "$REPO" --workflow deploy-azure.yml --limit 50 \
    --json databaseId,status --jq '.[] | select(.status != "completed") | .databaseId'
}

runs=$(unfinished)
if [ -z "$runs" ]; then
  echo "No deploy is waiting or running."
  exit 0
fi
for run in $runs; do
  echo "Cancelling deploy run $run"
  gh run cancel "$run" --repo "$REPO" || echo "Run $run may have just finished."
done

for _ in $(seq 60); do
  if [ -z "$(unfinished)" ]; then
    echo "The deploys have finished."
    exit 0
  fi
  sleep 10
done
echo "::warning::A deploy run is still finishing after 10 minutes. Deleting everything anyway."
