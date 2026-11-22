#!/usr/bin/env bash
# Creates the Paranoid server on Azure, running deploy/server/cloud-init.yaml,
# starts the backstop for it, and writes its name, host, URL and expiry time
# to GITHUB_OUTPUT.
#
# Reads REPOSITORY and COMMIT (what the server fetches), RUN_ID, and the
# settings settings.sh checked. The az CLI is signed in as the deploying
# identity, through OIDC. No credential reaches the server: there's none in
# its custom data, its tags or any file, and it never calls Azure's API.
set -euo pipefail

here=$(dirname "$0")
name="paranoid-$RUN_ID"
created=$(date +%s)
expires=$((created + LIFETIME_MINUTES * 60))
expires_at=$(date -u -d "@$expires" +%Y-%m-%dT%H:%M:%SZ)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

fail() {
  echo "::error::$1"
  exit 1
}

[[ $REPOSITORY =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail "Unexpected repository name: $REPOSITORY"
[[ $COMMIT =~ ^[0-9a-f]{40}$ ]] || fail "Unexpected commit: $COMMIT"
[[ $RUN_ID =~ ^[0-9]+$ ]] || fail "Unexpected run ID: $RUN_ID"

# Every part of the server carries these, so the cleanup and the backstop
# find it, and know when it expires. The times are Unix seconds.
tags=(app=paranoid "run=$RUN_ID" "created=$created" "expires=$expires" "commit=$COMMIT")

# The public address comes first: Azure puts it on its own network edge, and
# the VM only sees a private one, so setup.sh can't find its hostname. It's
# static, so it doesn't change while the VM lives.
echo "Creating the public IP address $name-ip in $REGION"
ip=$(az network public-ip create -g "$RESOURCE_GROUP" -n "$name-ip" -l "$REGION" \
  --sku Standard --allocation-method Static --version IPv4 --tags "${tags[@]}" \
  --query publicIp.ipAddress -o tsv)
[[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] || fail "Azure gave an unexpected IP address: '$ip'"
PARANOID_HOST="${ip//./-}.sslip.io"

export REPOSITORY COMMIT MAX_INVITES LIFETIME_MINUTES MAX_EGRESS_MBIT PARANOID_HOST
# shellcheck disable=SC2016 # envsubst gets the names, not their values
envsubst '$REPOSITORY $COMMIT $MAX_INVITES $LIFETIME_MINUTES $MAX_EGRESS_MBIT $PARANOID_HOST' \
  <"$here/../server/cloud-init.yaml" >"$work/custom-data.yaml"
grep -q "^ *PARANOID_HOST=$PARANOID_HOST\$" "$work/custom-data.yaml" ||
  fail "deploy/server/cloud-init.yaml doesn't pass PARANOID_HOST to the server, which Azure needs."

# Azure requires an SSH key or a password for a Linux VM. The private half of
# this key is deleted at once, so nobody can use it, and the server has no
# SSH anyway: cloud-init masks it, and the NSG closes port 22.
ssh-keygen -q -t ed25519 -N '' -C "$name" -f "$work/key"
rm -f "$work/key"

subnet_id=$(az network vnet subnet show -g "$RESOURCE_GROUP" --vnet-name paranoid-vnet -n paranoid-subnet --query id -o tsv)
ip_id=$(az network public-ip show -g "$RESOURCE_GROUP" -n "$name-ip" --query id -o tsv)
IFS=: read -r publisher offer sku version <<<"$IMAGE"
jq -n \
  --arg name "$name" --arg vmSize "$VM_SIZE" \
  --arg imagePublisher "$publisher" --arg imageOffer "$offer" \
  --arg imageSku "$sku" --arg imageVersion "$version" \
  --arg subnetId "$subnet_id" --arg publicIpId "$ip_id" \
  --rawfile customData "$work/custom-data.yaml" \
  --rawfile sshPublicKey "$work/key.pub" \
  --arg run "$RUN_ID" --arg created "$created" --arg expires "$expires" --arg commit "$COMMIT" \
  '{
    "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    contentVersion: "1.0.0.0",
    parameters: {
      name: {value: $name}, vmSize: {value: $vmSize},
      imagePublisher: {value: $imagePublisher}, imageOffer: {value: $imageOffer},
      imageSku: {value: $imageSku}, imageVersion: {value: $imageVersion},
      subnetId: {value: $subnetId}, publicIpId: {value: $publicIpId},
      customData: {value: $customData},
      sshPublicKey: {value: ($sshPublicKey | rtrimstr("\n"))},
      tags: {value: {app: "paranoid", run: $run, created: $created, expires: $expires, commit: $commit}}
    }
  }' >"$work/parameters.json"

echo "Creating $name, a $VM_SIZE VM from $IMAGE, with its NIC and disk"
az deployment group create -g "$RESOURCE_GROUP" -n "$name" \
  --template-file "$here/server.json" --parameters "@$work/parameters.json" -o none

# The backstop's run checks this VM every 2 minutes, and deletes it once it's
# stopped or expired, even if GitHub's cleanup never runs.
subscription=$(az account show --query id -o tsv)
az rest --method post -o none \
  --url "https://management.azure.com/subscriptions/$subscription/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Logic/workflows/paranoid-backstop/triggers/daily/run?api-version=2019-05-01"
echo "Started the backstop, which deletes $name once it's stopped, or at $expires_at."

{
  echo "name=$name"
  echo "host=$PARANOID_HOST"
  echo "url=https://$PARANOID_HOST"
  echo "expires=$expires"
} >>"$GITHUB_OUTPUT"
