#!/usr/bin/env bash
# Checks the settings of stop-aws.yml and cleanup-aws.yml: the cleanup role
# they sign in as, the aws-cleanup environment's AWS_ROLE_ARN, and the region
# they look in. The deploy preflight checks both first; each script that uses
# a value checks its format again itself (#141).
set -euo pipefail

here=$(dirname "$0")

fail() {
  echo "::error::$1"
  exit 1
}

setup="Run deploy/aws/bootstrap.sh and set the variables it prints (docs/deploy/aws.md)."
[[ $ROLE_ARN =~ ^arn:aws:iam::[0-9]{12}:role/paranoid-cleanup$ ]] ||
  fail "The aws-cleanup environment's AWS_ROLE_ARN isn't the cleanup role. $setup"
jq -e --arg r "$REGION" '.regions | has($r)' "$here/prices.json" >/dev/null ||
  fail "AWS_REGION must be one of $(jq -r '.regions | keys | join(", ")' "$here/prices.json"), not '$REGION'."
echo "Region: $REGION"
