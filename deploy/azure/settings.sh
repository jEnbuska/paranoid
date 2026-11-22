#!/usr/bin/env bash
# Checks the Azure deploy's inputs and every setting it passes on, and
# passes them to the later steps of the job through GITHUB_ENV.
# deploy-azure.yml sets each one from the workflow input, then the variable,
# then the default (see docs/deploy/azure.md).
#
# The deploy preflight has checked the variables already, with the rules in
# deploy/azure/requirements.json. They're checked here again, on purpose
# (#141): each value this passes on reaches the server's user data, its
# tags or the Azure commands, which hold only values the deploy's own
# scripts have checked. An input never passes through the preflight at all.
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
[[ $REGION =~ ^[a-z][a-z0-9]{2,30}$ ]] ||
  fail "AZURE_REGION must be an Azure region such as swedencentral or germanywestcentral, not '$REGION'"
[[ $RESOURCE_GROUP =~ ^[A-Za-z0-9_()-]{1,90}$ ]] ||
  fail "AZURE_RESOURCE_GROUP must be the resource group bootstrap.sh made, such as paranoid, not '$RESOURCE_GROUP'"
[[ $VM_SIZE =~ ^Standard_[A-Za-z0-9_]{1,40}$ ]] ||
  fail "AZURE_VM_SIZE must be a VM size such as Standard_B2ats_v2, not '$VM_SIZE'"
[[ $IMAGE =~ ^[A-Za-z0-9._-]+:[A-Za-z0-9._-]+:[A-Za-z0-9._-]+:[A-Za-z0-9._-]+$ ]] ||
  fail "AZURE_IMAGE must be an image URN, publisher:offer:sku:version, of Debian with cloud-init, such as Debian:debian-13:13-gen2:latest, not '$IMAGE'"

{
  echo "MAX_INVITES=$((10#$MAX_INVITES))"
  echo "LIFETIME_MINUTES=$((10#$LIFETIME_MINUTES))"
  echo "MAX_EGRESS_MBIT=$((10#$MAX_EGRESS_MBIT))"
  echo "REGION=$REGION"
  echo "RESOURCE_GROUP=$RESOURCE_GROUP"
  echo "VM_SIZE=$VM_SIZE"
  echo "IMAGE=$IMAGE"
} >>"$GITHUB_ENV"
echo "Invites: $MAX_INVITES, lifetime: $LIFETIME_MINUTES min, outbound limit: $MAX_EGRESS_MBIT Mbit/s, region: $REGION, resource group: $RESOURCE_GROUP, size: $VM_SIZE, image: $IMAGE"
