#!/usr/bin/env bash
# Deletes Paranoid VMs on Azure, with their disks, NICs and public IPs. The
# az CLI is signed in as paranoid-deployer or paranoid-cleaner, and
# RESOURCE_GROUP is the resource group bootstrap.sh made.
#
# Usage:
#   delete-servers.sh all          every VM, running or not
#   delete-servers.sh finished     VMs that are stopped or past their expiry
#   delete-servers.sh run <id>     the VM of one deploy run
#
# A Paranoid VM is one tagged app=paranoid, named paranoid-<run id>. Its
# parts are <name>-disk, <name>-nic and <name>-ip, tagged the same way. A VM
# powered off from inside is "stopped" but still allocated, and Azure bills it
# like a running one until it's deallocated or deleted, so deleting it is
# what stops the cost. Every mode also deletes parts left without a VM: of
# that run only for `run`, and only once they've expired for `finished`.
#
# `finished` runs in cleanup-azure.yml, which has a concurrency group of its
# own, so it can run while a deploy is creating its VM, and while Stop Azure
# deletes. So it never touches a deploy's new VM or parts: a VM counts as
# stopped only once Azure has finished creating it, and parts without a VM
# only once their expires-at has passed. A delete that fails because the
# resource is already gone, or going, counts as done.
set -euo pipefail

mode=${1:-}
run=
case "$mode" in
  all | finished) ;;
  run)
    [[ ${2:-} =~ ^[0-9]+$ ]] || {
      echo "Usage: $0 run <run-id>" >&2
      exit 2
    }
    run=$2
    ;;
  *)
    echo "Usage: $0 all | finished | run <run-id>" >&2
    exit 2
    ;;
esac
rg=$RESOURCE_GROUP
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# expired <expires-at>: whether that time has passed. ISO 8601 times in UTC
# sort as text. No expiry counts as expired.
expired() {
  [ -z "$1" ] || [[ ! $1 > $now ]]
}

# gone <command...>: deletes with the command, or waits up to 5 minutes for
# the resource to be gone if the delete fails, for example because another
# run is deleting it
gone() {
  local id=$1 _
  shift
  "$@" -o none && return 0
  for _ in $(seq 30); do
    az resource show --ids "$id" -o none 2>/dev/null || return 0
    sleep 10
  done
  echo "::error::Couldn't delete $id"
  return 1
}

# One line per Paranoid VM: ID, name, provisioning state ("Succeeded" once
# Azure has created it), power state (such as "VM running" or "VM stopped"),
# run and expiry time
vms=$(az vm list -g "$rg" --show-details \
  --query "[?tags.app=='paranoid'].[id, name, provisioningState || 'unknown', powerState || 'unknown', tags.run || '', tags.\"expires-at\" || '']" \
  -o tsv)

kept=()
while IFS=$'\t' read -r id name provisioning power vm_run expires_at; do
  [ -n "$name" ] || continue
  delete=false
  case "$mode" in
    all) delete=true ;;
    run) [ "$vm_run" = "$run" ] && delete=true ;;
    finished)
      if [ "$provisioning" = Succeeded ]; then
        case "$power" in
          "VM stopped" | "VM stopping" | "VM deallocated" | "VM deallocating") delete=true ;;
        esac
      fi
      if expired "$expires_at"; then
        delete=true
      fi
      ;;
  esac
  if [ "$delete" = true ]; then
    echo "Deleting $name ($provisioning, $power, expires ${expires_at:-never})"
    gone "$id" az vm delete --ids "$id" --yes
  else
    echo "Keeping $name ($provisioning, $power, expires $expires_at)"
    kept+=("$name")
  fi
done <<<"$vms"

# Parts whose VM is gone: those the deletion above didn't take with it, and
# those of a deploy that failed before its VM existed. For `finished`, only
# expired ones, since a deploy running now creates its IP address before its
# VM. NICs go first, since a public IP or disk still attached to one can't be
# deleted.
for type in Microsoft.Network/networkInterfaces Microsoft.Network/publicIPAddresses Microsoft.Compute/disks; do
  parts=$(az resource list -g "$rg" --resource-type "$type" \
    --query "[?tags.app=='paranoid'].[id, name, tags.run || '', tags.\"expires-at\" || '']" -o tsv)
  while IFS=$'\t' read -r id name part_run expires_at; do
    [ -n "$id" ] || continue
    [ -z "$run" ] || [ "$part_run" = "$run" ] || continue
    [ "$mode" != finished ] || expired "$expires_at" || continue
    vm=${name%-*}
    if [[ " ${kept[*]} " == *" $vm "* ]]; then
      continue
    fi
    echo "Deleting $name"
    gone "$id" az resource delete --ids "$id"
  done <<<"$parts"
done
