#!/usr/bin/env bash
# Checks the deploy settings and passes them to the later steps of the job
# through GITHUB_ENV. deploy-hetzner.yml sets each one from the workflow input,
# then the variable, then the default (see docs/deploy/hetzner.md).
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
# At 50 Mbit/s, a month of nonstop outbound traffic is about 16 TB, still
# under the 20 TB Hetzner includes in the EU.
whole MAX_EGRESS_MBIT "$MAX_EGRESS_MBIT" 1 50
[[ $MAX_DEPLOY_COST_USD =~ ^[0-9]{1,4}(\.[0-9]{1,2})?$ ]] ||
  fail "MAX_DEPLOY_COST_USD must be an amount in US dollars such as 1 or 2.50, not '$MAX_DEPLOY_COST_USD'"
[[ $LOCATION =~ ^[a-z0-9-]{1,20}$ ]] ||
  fail "HCLOUD_LOCATION must be a Hetzner location name such as nbg1, not '$LOCATION'"
[[ $SERVER_TYPES =~ ^[a-z0-9]{1,20}(,[a-z0-9]{1,20}){0,9}$ ]] ||
  fail "HCLOUD_SERVER_TYPES must be server type names separated by commas, such as cx23,cax11, not '$SERVER_TYPES'"

{
  echo "MAX_INVITES=$((10#$MAX_INVITES))"
  echo "LIFETIME_MINUTES=$((10#$LIFETIME_MINUTES))"
  echo "MAX_EGRESS_MBIT=$((10#$MAX_EGRESS_MBIT))"
  echo "MAX_DEPLOY_COST_USD=$MAX_DEPLOY_COST_USD"
  echo "LOCATION=$LOCATION"
  echo "SERVER_TYPES=$SERVER_TYPES"
} >>"$GITHUB_ENV"
echo "Invites: $MAX_INVITES, lifetime: $LIFETIME_MINUTES min, outbound limit: $MAX_EGRESS_MBIT Mbit/s, cost limit: \$$MAX_DEPLOY_COST_USD, location: $LOCATION, server types: $SERVER_TYPES"
