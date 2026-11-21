#!/usr/bin/env bash
# Checks the deploy settings and passes them to the later steps of the job
# through GITHUB_ENV. deploy-upcloud.yml sets each one from the workflow input, then
# the variable, then the default (see docs/deploy/upcloud.md).
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
whole MAX_EGRESS_MBIT "$MAX_EGRESS_MBIT" 1 50
[[ $MAX_DEPLOY_COST_USD =~ ^[0-9]{1,4}(\.[0-9]{1,2})?$ ]] ||
  fail "MAX_DEPLOY_COST_USD must be an amount in US dollars such as 1 or 2.50, not '$MAX_DEPLOY_COST_USD'"
[[ $ZONE =~ ^[a-z]{2}-[a-z]{3}[0-9]{1,2}$ ]] ||
  fail "UPCLOUD_ZONE must be an UpCloud zone such as fi-hel1 or de-fra1, not '$ZONE'"
[[ $PLAN =~ ^[A-Za-z0-9-]{1,40}$ ]] ||
  fail "UPCLOUD_PLAN must be an UpCloud plan name such as $DEFAULT_PLAN, not '$PLAN'"
[[ $TEMPLATE =~ ^[A-Za-z0-9][A-Za-z0-9\ ./()_-]{0,99}$ ]] ||
  fail "UPCLOUD_TEMPLATE must be the title of an UpCloud Debian template with cloud-init, such as Debian GNU/Linux 13 (Trixie), not '$TEMPLATE'"

{
  echo "MAX_INVITES=$((10#$MAX_INVITES))"
  echo "LIFETIME_MINUTES=$((10#$LIFETIME_MINUTES))"
  echo "MAX_EGRESS_MBIT=$((10#$MAX_EGRESS_MBIT))"
  echo "MAX_DEPLOY_COST_USD=$MAX_DEPLOY_COST_USD"
  echo "ZONE=$ZONE"
  echo "PLAN=$PLAN"
  echo "TEMPLATE=$TEMPLATE"
} >>"$GITHUB_ENV"
echo "Invites: $MAX_INVITES, lifetime: $LIFETIME_MINUTES min, outbound limit: $MAX_EGRESS_MBIT Mbit/s, cost limit: \$$MAX_DEPLOY_COST_USD, zone: $ZONE, plan: $PLAN, template: $TEMPLATE"
