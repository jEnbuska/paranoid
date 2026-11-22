#!/usr/bin/env bash
# Checks the deploy settings and passes them to the later steps of the job
# through GITHUB_ENV. deploy-aws.yml sets each one from the workflow input,
# then the variable, then the default (see docs/deploy/aws.md).
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
[[ $MAX_DEPLOY_COST_USD =~ ^[0-9]{1,4}(\.[0-9]{1,2})?$ ]] ||
  fail "MAX_DEPLOY_COST_USD must be an amount in dollars such as 1 or 2.50, not '$MAX_DEPLOY_COST_USD'"

# Only the regions and instance types in prices.json, so the cost check always
# has a price. The deploy role allows only those instance types too.
regions=$(jq -r '.regions | keys | join(", ")' "$here/prices.json")
jq -e --arg r "$REGION" '.regions | has($r)' "$here/prices.json" >/dev/null ||
  fail "AWS_REGION must be one of $regions, not '$REGION'. Another region needs its prices in deploy/aws/prices.json."
types=$(jq -r --arg r "$REGION" '.regions[$r].servers | keys | join(", ")' "$here/prices.json")
jq -e --arg r "$REGION" --arg t "$INSTANCE_TYPE" '.regions[$r].servers | has($t)' "$here/prices.json" >/dev/null ||
  fail "AWS_INSTANCE_TYPE must be one of $types, not '$INSTANCE_TYPE'"

# The aws environment's variables, which bootstrap.sh printed
setup="Run deploy/aws/bootstrap.sh and set the variables it prints (docs/deploy/aws.md)."
[[ $ROLE_ARN =~ ^arn:aws:iam::[0-9]{12}:role/paranoid-deploy$ ]] ||
  fail "The aws environment's AWS_ROLE_ARN isn't set to the deploy role. $setup"
[[ $SCHEDULER_ROLE_ARN =~ ^arn:aws:iam::[0-9]{12}:role/paranoid-scheduler$ ]] ||
  fail "The aws environment's AWS_SCHEDULER_ROLE_ARN isn't set to the scheduler role. $setup"
[[ $SECURITY_GROUP_ID =~ ^sg-[0-9a-f]{8,17}$ ]] ||
  fail "The aws environment's AWS_SECURITY_GROUP_ID isn't set to a security group ID. $setup"

{
  echo "SCHEDULER_ROLE_ARN=$SCHEDULER_ROLE_ARN"
  echo "SECURITY_GROUP_ID=$SECURITY_GROUP_ID"
  echo "MAX_INVITES=$((10#$MAX_INVITES))"
  echo "LIFETIME_MINUTES=$((10#$LIFETIME_MINUTES))"
  echo "MAX_EGRESS_MBIT=$((10#$MAX_EGRESS_MBIT))"
  echo "MAX_DEPLOY_COST_USD=$MAX_DEPLOY_COST_USD"
  echo "REGION=$REGION"
  echo "INSTANCE_TYPE=$INSTANCE_TYPE"
} >>"$GITHUB_ENV"
echo "Invites: $MAX_INVITES, lifetime: $LIFETIME_MINUTES min, outbound limit: $MAX_EGRESS_MBIT Mbit/s, region: $REGION, instance type: $INSTANCE_TYPE, cost limit: $MAX_DEPLOY_COST_USD USD"
