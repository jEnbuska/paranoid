#!/usr/bin/env bash
# Checks the Google Cloud deploy's settings and passes them to the later
# steps of the job through GITHUB_ENV. Only deploy-gcp.yml runs it: stop and
# cleanup create nothing, and take the two values they need straight from
# the variables. See docs/deploy/gcp.md.
#
# The deploy preflight (.github/actions/deploy-preflight, with
# deploy/gcp/requirements.json) checked the variables in the step before.
# Every value that reaches the VM, in its metadata, its labels or the flags
# that create it, is checked here again anyway, before it's written (#141):
# the invites, lifetime and outbound limit, the region and zone, and the
# run's ID. So are the inputs, which win over the variables the preflight
# saw, and what no pattern can say: that the zone is in the region and that
# deploy/gcp/prices.json has prices for it. Values that never reach the VM,
# the project, the bucket and the cost limits, are left to the preflight,
# and the cost check and ledger read them as numbers.
#
# Only checked values reach GITHUB_ENV and the VM, so an input can't add
# lines or commands to either.
set -euo pipefail

fail() {
  echo "::error::$1 See docs/deploy/gcp.md."
  exit 1
}

# whole <name> <value> <min> <max>
whole() {
  if ! [[ $2 =~ ^[0-9]{1,6}$ ]] || ((10#$2 < $3 || 10#$2 > $4)); then
    fail "$1 must be a whole number from $3 to $4, not '$2'."
  fi
}

[[ $GCP_REGION =~ ^[a-z]+-[a-z]+[0-9]{1,2}$ ]] ||
  fail "GCP_REGION must be a Google Cloud region such as europe-north1, not '$GCP_REGION'."
[[ $GCP_ZONE =~ ^$GCP_REGION-[a-z]$ ]] ||
  fail "GCP_ZONE must be a zone in GCP_REGION ($GCP_REGION), such as $GCP_REGION-a, not '$GCP_ZONE'."

{
  echo "GCP_PROJECT=$GCP_PROJECT"
  echo "GCP_REGION=$GCP_REGION"
  echo "GCP_ZONE=$GCP_ZONE"
  echo "GCP_BUCKET=$GCP_BUCKET"
  # gcloud's project, so no command needs --project
  echo "CLOUDSDK_CORE_PROJECT=$GCP_PROJECT"
  echo "CLOUDSDK_CORE_DISABLE_PROMPTS=1"
} >>"$GITHUB_ENV"

# Into the VM's metadata, labels and --max-run-duration. The first two can
# also be inputs, which the preflight doesn't see.
whole max_invites "$MAX_INVITES" 1 10000
whole lifetime_minutes "$LIFETIME_MINUTES" 1 1440
whole MAX_EGRESS_MBIT "$MAX_EGRESS_MBIT" 1 50
[[ $RUN_ID =~ ^[0-9]+$ && $RUN_ATTEMPT =~ ^[0-9]+$ ]] ||
  fail "The run ID and attempt aren't numbers."

{
  echo "MAX_INVITES=$((10#$MAX_INVITES))"
  echo "LIFETIME_MINUTES=$((10#$LIFETIME_MINUTES))"
  echo "MAX_EGRESS_MBIT=$((10#$MAX_EGRESS_MBIT))"
  echo "MAX_DEPLOY_COST_USD=$MAX_DEPLOY_COST_USD"
  echo "GCP_MONTHLY_BUDGET_USD=$GCP_MONTHLY_BUDGET_USD"
  # The deployment's ID in the ledger, its VM's name and labels. A re-run
  # gets a new attempt number, so a new VM and reservation.
  echo "DEPLOYMENT=$RUN_ID-$RUN_ATTEMPT"
  # The month its cost counts in, in UTC
  echo "MONTH=$(date -u +%Y-%m)"
} >>"$GITHUB_ENV"

# The boot disk's size in GiB, from the prices, so the VM gets exactly the
# disk the spending limit counts. It also checks the region has prices.
disk_gib=$(jq -er --arg region "$GCP_REGION" \
  '.regions[$region].items[] | select(.name == "disk") | .gib' \
  "$(dirname "$0")/prices.json" 2>/dev/null) ||
  fail "deploy/gcp/prices.json has no prices for $GCP_REGION, so its cost can't be limited."
[[ $disk_gib =~ ^[1-9][0-9]{0,3}$ ]] || fail "The disk size in deploy/gcp/prices.json isn't a whole number of GiB."
echo "DISK_GIB=$disk_gib" >>"$GITHUB_ENV"
echo "Invites: $MAX_INVITES, lifetime: $LIFETIME_MINUTES min, outbound limit: $MAX_EGRESS_MBIT Mbit/s, limit per deploy: \$$MAX_DEPLOY_COST_USD, per month: \$$GCP_MONTHLY_BUDGET_USD, zone: $GCP_ZONE"
