#!/usr/bin/env bash
# Checks the deploy workflow's two inputs, which override the MAX_INVITES and
# LIFETIME_MINUTES variables, and passes them to the later steps of the job
# through GITHUB_ENV. Everything else, the variables included, the deploy
# preflight checks first (deploy/aws/requirements.json).
#
# Only checked values reach GITHUB_ENV and the server's user data, so an input
# can't add lines or commands to either.
set -euo pipefail

fail() {
  echo "::error::$1"
  exit 1
}

# whole <name> <value> <min> <max>
whole() {
  if ! [[ $2 =~ ^[0-9]{1,6}$ ]] || ((10#$2 < $3 || 10#$2 > $4)); then
    fail "$1 must be a whole number from $3 to $4, not '$2'"
  fi
}

whole max_invites "$MAX_INVITES" 1 10000
whole lifetime_minutes "$LIFETIME_MINUTES" 1 1440

{
  echo "MAX_INVITES=$((10#$MAX_INVITES))"
  echo "LIFETIME_MINUTES=$((10#$LIFETIME_MINUTES))"
} >>"$GITHUB_ENV"
echo "Invites: $MAX_INVITES, lifetime: $LIFETIME_MINUTES min, outbound limit: $MAX_EGRESS_MBIT Mbit/s, region: $REGION, instance type: $INSTANCE_TYPE, cost limit: $MAX_DEPLOY_COST_USD USD"
