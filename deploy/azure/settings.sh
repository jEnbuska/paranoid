#!/usr/bin/env bash
# Checks the Azure deploy's two workflow inputs, max_invites and
# lifetime_minutes, and passes them and the settings to the later steps of
# the job through GITHUB_ENV. deploy-azure.yml sets each one from the
# workflow input, then the variable, then the default (see
# docs/deploy/azure.md).
#
# The variables are the deploy preflight's to check, with the rules in
# deploy/azure/requirements.json and deploy/requirements.json, before this
# runs. An input never passes through the preflight, so it's checked here.
# Only checked values reach GITHUB_ENV, the server's custom data and its
# tags, so neither can add lines or commands to any of them.
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
# The preflight has checked the variables. This only makes sure none can add
# a line to GITHUB_ENV, whatever runs before it.
for value in "$MAX_EGRESS_MBIT" "$REGION" "$RESOURCE_GROUP" "$VM_SIZE" "$IMAGE"; do
  [[ $value != *$'\n'* && $value != *$'\r'* ]] || fail "A setting has a line break in it. Run the deploy preflight first."
done

{
  echo "MAX_INVITES=$((10#$MAX_INVITES))"
  echo "LIFETIME_MINUTES=$((10#$LIFETIME_MINUTES))"
  echo "MAX_EGRESS_MBIT=$MAX_EGRESS_MBIT"
  echo "REGION=$REGION"
  echo "RESOURCE_GROUP=$RESOURCE_GROUP"
  echo "VM_SIZE=$VM_SIZE"
  echo "IMAGE=$IMAGE"
} >>"$GITHUB_ENV"
echo "Invites: $MAX_INVITES, lifetime: $LIFETIME_MINUTES min, outbound limit: $MAX_EGRESS_MBIT Mbit/s, region: $REGION, resource group: $RESOURCE_GROUP, size: $VM_SIZE, image: $IMAGE"
