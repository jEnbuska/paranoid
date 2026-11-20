#!/usr/bin/env bash
# Deletes Paranoid VMs on Azure, with their disks, NICs and public IPs. The
# az CLI is signed in as the deploying identity, and RESOURCE_GROUP is the
# resource group bootstrap.sh made.
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
# what stops the cost. Every mode also deletes parts left without a VM, of
# that run only for `run`.
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

# One line per Paranoid VM: name, power state (such as "VM running" or "VM
# stopped"), run and expiry time
vms=$(az vm list -g "$rg" --show-details \
  --query "[?tags.app=='paranoid'].[name, powerState || 'unknown', tags.run || '', tags.\"expires-at\" || '']" \
  -o tsv)

kept=()
while IFS=$'\t' read -r name power vm_run expires_at; do
  [ -n "$name" ] || continue
  delete=false
  case "$mode" in
    all) delete=true ;;
    run) [ "$vm_run" = "$run" ] && delete=true ;;
    finished)
      case "$power" in
        "VM stopped" | "VM stopping" | "VM deallocated" | "VM deallocating") delete=true ;;
      esac
      # ISO 8601 times in UTC sort as text. No expiry counts as expired.
      if [ -z "$expires_at" ] || [[ ! $expires_at > $now ]]; then
        delete=true
      fi
      ;;
  esac
  if [ "$delete" = true ]; then
    echo "Deleting $name ($power, expires ${expires_at:-never})"
    az vm delete -g "$rg" -n "$name" --yes -o none
  else
    echo "Keeping $name ($power, expires $expires_at)"
    kept+=("$name")
  fi
done <<<"$vms"

# Parts whose VM is gone: those the deletion above didn't take with it, and
# those of a deploy that failed before its VM existed. The deploy, stop and
# cleanup workflows share a concurrency group, so no deploy is creating them
# right now. NICs go first, since a public IP or disk still attached to one
# can't be deleted.
for type in Microsoft.Network/networkInterfaces Microsoft.Network/publicIPAddresses Microsoft.Compute/disks; do
  parts=$(az resource list -g "$rg" --resource-type "$type" \
    --query "[?tags.app=='paranoid'].[id, name, tags.run || '']" -o tsv)
  while IFS=$'\t' read -r id name part_run; do
    [ -n "$id" ] || continue
    [ -z "$run" ] || [ "$part_run" = "$run" ] || continue
    vm=${name%-*}
    if [[ " ${kept[*]} " == *" $vm "* ]]; then
      continue
    fi
    echo "Deleting $name"
    az resource delete --ids "$id" -o none
  done <<<"$parts"
done
