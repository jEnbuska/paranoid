#!/usr/bin/env bash
# Checks the IDs that stop-azure.yml and cleanup-azure.yml sign in with: the
# azure-cleanup environment's AZURE_CLIENT_ID, AZURE_TENANT_ID and
# AZURE_SUBSCRIPTION_ID, as CLIENT_ID, TENANT_ID and SUBSCRIPTION_ID. Writes
# configured=true or false to GITHUB_OUTPUT.
#
# Usage: check-sign-in.sh skip|fail
#   skip: if none is set, Azure was never set up, so there's nothing to clean
#         up: says so in a notice, and the job skips its other steps.
#   fail: if any is missing, fails, as Stop Azure should.
# One set and another missing, or a value that isn't an ID, always fails.
#
# Until the shared preflight (#116) replaces it.
set -euo pipefail

mode=${1:-}
[[ $mode == skip || $mode == fail ]] || {
  echo "Usage: $0 skip|fail" >&2
  exit 2
}
guide="See docs/deploy/azure.md, step 4."

if [ -z "$CLIENT_ID$TENANT_ID$SUBSCRIPTION_ID" ] && [ "$mode" = skip ]; then
  echo "::notice::The azure-cleanup environment has no AZURE_CLIENT_ID, AZURE_TENANT_ID or AZURE_SUBSCRIPTION_ID, so there's nothing to clean up. $guide"
  echo "configured=false" >>"$GITHUB_OUTPUT"
  exit 0
fi

guid='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
for pair in "AZURE_CLIENT_ID=$CLIENT_ID" "AZURE_TENANT_ID=$TENANT_ID" "AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID"; do
  name=${pair%%=*}
  value=${pair#*=}
  [[ $value =~ $guid ]] || {
    echo "::error::The azure-cleanup environment's variable $name must be the ID that deploy/azure/bootstrap.sh printed, not '$value'. $guide"
    exit 1
  }
done
echo "configured=true" >>"$GITHUB_OUTPUT"
