#!/usr/bin/env bash
# Checks the Google Cloud deploy settings and passes them to the later steps
# of the job through GITHUB_ENV. The workflows set each one from the workflow
# input, then the `gcp` environment's variable, then the default (see
# docs/deploy/gcp.md). bootstrap.sh prints the commands that set the
# variables.
#
# Only checked values reach GITHUB_ENV and the VM's metadata, so an input
# can't add lines or commands to either.
#
# Usage: settings.sh deploy|manage
#   deploy checks everything; manage (stop and cleanup) only what they need.
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

[[ $GCP_PROJECT =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] ||
  fail "GCP_PROJECT must be a Google Cloud project ID, not '$GCP_PROJECT'."
[[ $GCP_REGION =~ ^[a-z]+-[a-z]+[0-9]{1,2}$ ]] ||
  fail "GCP_REGION must be a Google Cloud region such as europe-north1, not '$GCP_REGION'."
[[ $GCP_ZONE =~ ^$GCP_REGION-[a-z]$ ]] ||
  fail "GCP_ZONE must be a zone in $GCP_REGION, such as $GCP_REGION-a, not '$GCP_ZONE'."
[[ $GCP_BUCKET =~ ^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$ ]] ||
  fail "GCP_BUCKET must be the bucket that bootstrap.sh created, not '$GCP_BUCKET'."

{
  echo "GCP_PROJECT=$GCP_PROJECT"
  echo "GCP_REGION=$GCP_REGION"
  echo "GCP_ZONE=$GCP_ZONE"
  echo "GCP_BUCKET=$GCP_BUCKET"
  # gcloud's project, so no command needs --project
  echo "CLOUDSDK_CORE_PROJECT=$GCP_PROJECT"
  echo "CLOUDSDK_CORE_DISABLE_PROMPTS=1"
} >>"$GITHUB_ENV"

if [ "$1" = manage ]; then
  exit 0
fi

whole max_invites "$MAX_INVITES" 1 10000
whole lifetime_minutes "$LIFETIME_MINUTES" 1 1440
whole MAX_EGRESS_MBIT "$MAX_EGRESS_MBIT" 1 50
[[ $MONTHLY_BUDGET_USD =~ ^[0-9]{1,4}(\.[0-9]{1,2})?$ ]] ||
  fail "MONTHLY_BUDGET_USD must be an amount in dollars such as 5 or 2.50, not '$MONTHLY_BUDGET_USD'."
[[ $RUN_ID =~ ^[0-9]+$ && $RUN_ATTEMPT =~ ^[0-9]+$ ]] ||
  fail "The run ID and attempt aren't numbers."

{
  echo "MAX_INVITES=$((10#$MAX_INVITES))"
  echo "LIFETIME_MINUTES=$((10#$LIFETIME_MINUTES))"
  echo "MAX_EGRESS_MBIT=$((10#$MAX_EGRESS_MBIT))"
  echo "MONTHLY_BUDGET_USD=$MONTHLY_BUDGET_USD"
  # The deployment's ID in the ledger, its VM's name and labels. A re-run
  # gets a new attempt number, so a new VM and reservation.
  echo "DEPLOYMENT=$RUN_ID-$RUN_ATTEMPT"
  # The month its cost counts in, in UTC
  echo "MONTH=$(date -u +%Y-%m)"
  # The boot disk's size in GiB, Debian's image size and the smallest
  # allowed. The ledger counts it too.
  echo "DISK_GIB=10"
} >>"$GITHUB_ENV"
echo "Invites: $MAX_INVITES, lifetime: $LIFETIME_MINUTES min, outbound limit: $MAX_EGRESS_MBIT Mbit/s, monthly limit: \$$MONTHLY_BUDGET_USD, zone: $GCP_ZONE"
