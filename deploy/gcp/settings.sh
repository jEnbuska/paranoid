#!/usr/bin/env bash
# Passes the Google Cloud deploy's settings to the later steps of the job
# through GITHUB_ENV, after the checks only this script can do. Only
# deploy-gcp.yml runs it: stop and cleanup take the two values they need
# straight from the variables, which the preflight checked. The deploy preflight
# (.github/actions/deploy-preflight, with deploy/gcp/requirements.json)
# already checked every variable's name, pattern and range in the step before,
# so they aren't checked again here. See docs/deploy/gcp.md.
#
# What's left for this script:
# - the deploy workflow's inputs, max_invites and lifetime_minutes, which win
#   over the variables the preflight checked;
# - that the zone is in the region, and that deploy/gcp/prices.json has
#   prices for the region, which the preflight's patterns can't say.
#
# Only checked values reach GITHUB_ENV and the VM's metadata, so an input
# can't add lines or commands to either.
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

[[ $GCP_ZONE == "$GCP_REGION"-? ]] ||
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

# The inputs, which the preflight doesn't see
whole max_invites "$MAX_INVITES" 1 10000
whole lifetime_minutes "$LIFETIME_MINUTES" 1 1440
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
