#!/usr/bin/env bash
# Checks the deploy's settings, and passes the two inputs, which override
# the MAX_INVITES and LIFETIME_MINUTES variables, to the later steps of the
# job through GITHUB_ENV.
#
# The deploy preflight checks the variables first (deploy/aws/requirements.json).
# Every value that reaches the server, its user data or its tags, or decides
# what it is, is checked here again before the scripts use it (#141), so a
# change to one check can't let a bad value through. Only the role ARNs and
# the cost limit, which reach no server, are left to the preflight alone.
#
# Only checked values reach GITHUB_ENV and the server's user data, so an input
# can't add lines or commands to either.
set -euo pipefail

here=$(dirname "$0")

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
whole MAX_EGRESS_MBIT "$MAX_EGRESS_MBIT" 1 50

# Only the regions and instance types in prices.json, so the cost check always
# has a price. The deploy role allows only those instance types too.
regions=$(jq -r '.regions | keys | join(", ")' "$here/prices.json")
jq -e --arg r "$REGION" '.regions | has($r)' "$here/prices.json" >/dev/null ||
  fail "AWS_REGION must be one of $regions, not '$REGION'. Another region needs its prices in deploy/aws/prices.json."
types=$(jq -r --arg r "$REGION" '.regions[$r].servers | keys | join(", ")' "$here/prices.json")
jq -e --arg r "$REGION" --arg t "$INSTANCE_TYPE" '.regions[$r].servers | has($t)' "$here/prices.json" >/dev/null ||
  fail "AWS_INSTANCE_TYPE must be one of $types, not '$INSTANCE_TYPE'"

{
  echo "MAX_INVITES=$((10#$MAX_INVITES))"
  echo "LIFETIME_MINUTES=$((10#$LIFETIME_MINUTES))"
} >>"$GITHUB_ENV"
echo "Invites: $MAX_INVITES, lifetime: $LIFETIME_MINUTES min, outbound limit: $MAX_EGRESS_MBIT Mbit/s, region: $REGION, instance type: $INSTANCE_TYPE, cost limit: $MAX_DEPLOY_COST_USD USD"
