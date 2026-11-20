#!/usr/bin/env bash
# Removes everything bootstrap.sh created, and any Paranoid VM still there:
# the budget, the role assignments, the resource group with everything in it
# (identity, backstop, network, VMs), and the two custom roles. Run it signed
# in with `az login`, or in Azure Cloud Shell. It asks before deleting.
#
# Usage: deploy/azure/teardown.sh [--yes]
#
# Optional environment variable: AZURE_RESOURCE_GROUP (default paranoid).
#
# Azure's Activity Log keeps a record of these API calls for 90 days, and it
# can't be deleted.
set -euo pipefail

fail() {
  echo "Error: $1" >&2
  exit 1
}

rg=${AZURE_RESOURCE_GROUP:-paranoid}
[[ $rg =~ ^[A-Za-z0-9_()-]{1,90}$ ]] || fail "AZURE_RESOURCE_GROUP must be letters, digits, -, _ and (), not '$rg'"
az account show -o none 2>/dev/null || fail "Not signed in to Azure. Run az login first."
subscription=$(az account show --query id -o tsv)
rg_id="/subscriptions/$subscription/resourceGroups/$rg"
roles=("Paranoid deployer ($rg, $subscription)" "Paranoid backstop ($rg, $subscription)")

echo "This deletes the resource group $rg, with everything in it, in"
echo "$(az account show --query name -o tsv) ($subscription), and Paranoid's roles and budget."
if [ "${1:-}" != --yes ]; then
  read -r -p "Type $rg to go ahead: " answer
  [ "$answer" = "$rg" ] || fail "Nothing was deleted."
fi

# delete_roles <scope>: the custom roles, once nothing is assigned them
delete_roles() {
  local role
  for role in "${roles[@]}"; do
    if [ -n "$(az role definition list --custom-role-only true --name "$role" --scope "$1" --query '[0].name' -o tsv 2>/dev/null)" ]; then
      echo "Deleting the role $role"
      az role definition delete --name "$role" --custom-role-only true --scope "$1" -o none
    fi
  done
}

if az group show -n "$rg" -o none 2>/dev/null; then
  echo "Deleting the budget"
  az rest --method delete -o none \
    --url "https://management.azure.com$rg_id/providers/Microsoft.Consumption/budgets/paranoid?api-version=2023-11-01" ||
    echo "Warning: couldn't delete the budget, or there was none." >&2

  echo "Deleting the role assignments"
  for role in "${roles[@]}"; do
    for id in $(az role assignment list --scope "$rg_id" --query "[?roleDefinitionName=='$role'].id" -o tsv); do
      az role assignment delete --ids "$id" -o none
    done
  done

  delete_roles "$rg_id"

  echo "Deleting $rg and everything in it, which takes a few minutes"
  az group delete -n "$rg" --yes
else
  echo "$rg doesn't exist."
fi
# In case an earlier run deleted the resource group but not the roles
delete_roles "/subscriptions/$subscription"

echo "Checking for anything left"
left=$(az resource list --query "[?tags.app=='paranoid'].id" -o tsv)
if [ -n "$left" ]; then
  echo "These resources are tagged app=paranoid and still exist:" >&2
  echo "$left" >&2
  exit 1
fi
echo "Nothing tagged app=paranoid is left in this subscription."
