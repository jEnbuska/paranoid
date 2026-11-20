#!/usr/bin/env bash
# One-time setup of Azure for deploying Paranoid from GitHub Actions. Run it
# signed in with `az login`, or in Azure Cloud Shell, as the subscription's
# owner. Running it again changes nothing that's already right, so it's safe
# to rerun, for example after changing the repository or the region.
#
# Usage: deploy/azure/bootstrap.sh <owner>/<repo> <email for budget alerts>
#
# Optional environment variables: AZURE_REGION (default swedencentral),
# AZURE_RESOURCE_GROUP (default paranoid), BUDGET_AMOUNT (default 5, a month,
# in the subscription's billing currency).
#
# It creates, all in one resource group except the two role definitions and
# the budget, which belong to it:
# - a user-assigned managed identity, paranoid-deployer, that GitHub Actions
#   signs in as through OIDC. Its only federated credential trusts the
#   repository's `azure` environment, which only `main` may use. No client
#   secret, certificate or key exists, so there's nothing to leak.
# - the custom role "Paranoid deployer", on the resource group only.
# - a VNet whose subnet's NSG lets in only TCP 80 and 443.
# - the backstop: a Logic App that deletes VMs once they're stopped or
#   expired (backstop.json), with the custom role "Paranoid backstop".
# - a monthly budget with email alerts.
# None of them costs anything while no VM runs. teardown.sh removes them all.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)

fail() {
  echo "Error: $1" >&2
  exit 1
}
step() {
  printf '\n== %s\n' "$1"
}

usage="Usage: $0 <owner>/<repo> <email for budget alerts>"
repo=${1:-}
email=${2:-}
[[ $repo =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail "$usage"
[[ $email =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || fail "$usage"
region=${AZURE_REGION:-swedencentral}
rg=${AZURE_RESOURCE_GROUP:-paranoid}
budget=${BUDGET_AMOUNT:-5}
[[ $region =~ ^[a-z][a-z0-9]{2,30}$ ]] || fail "AZURE_REGION must be a region name such as swedencentral, not '$region'"
[[ $rg =~ ^[A-Za-z0-9_()-]{1,90}$ ]] || fail "AZURE_RESOURCE_GROUP must be letters, digits, -, _ and (), not '$rg'"
[[ $budget =~ ^[1-9][0-9]{0,5}$ ]] || fail "BUDGET_AMOUNT must be a whole number, not '$budget'"
command -v az >/dev/null || fail "The Azure CLI (az) isn't installed. Use Azure Cloud Shell, which has it."
command -v jq >/dev/null || fail "jq isn't installed. Use Azure Cloud Shell, which has it."

az account show -o none 2>/dev/null || fail "Not signed in to Azure. Run az login first."
subscription=$(az account show --query id -o tsv)
tenant=$(az account show --query tenantId -o tsv)
echo "Subscription: $(az account show --query name -o tsv) ($subscription)"
echo "Repository: $repo, region: $region, resource group: $rg"
az account list-locations --query "[?name=='$region'].name" -o tsv | grep -qx "$region" ||
  fail "$region isn't an Azure region this subscription can use. See az account list-locations -o table."

rg_id="/subscriptions/$subscription/resourceGroups/$rg"
deployer_role="Paranoid deployer ($rg, $subscription)"
backstop_role="Paranoid backstop ($rg, $subscription)"
nsg=paranoid-nsg
vnet=paranoid-vnet
subnet=paranoid-subnet
identity=paranoid-deployer
credential=github-azure-environment

# What GitHub Actions may do, and only in the resource group. The PR and
# docs/deploy/azure.md say why each one is needed. Nothing under
# Microsoft.Authorization, no NSG or VNet writes, no VM extensions or run
# command, no managed identities and no Logic App changes.
deployer_actions='[
  "Microsoft.Resources/subscriptions/resourceGroups/read",
  "Microsoft.Resources/subscriptions/resourceGroups/resources/read",
  "Microsoft.Resources/deployments/read",
  "Microsoft.Resources/deployments/write",
  "Microsoft.Resources/deployments/validate/action",
  "Microsoft.Resources/deployments/operations/read",
  "Microsoft.Resources/deployments/operationStatuses/read",
  "Microsoft.Resources/tags/read",
  "Microsoft.Resources/tags/write",
  "Microsoft.Compute/virtualMachines/read",
  "Microsoft.Compute/virtualMachines/write",
  "Microsoft.Compute/virtualMachines/delete",
  "Microsoft.Compute/virtualMachines/instanceView/read",
  "Microsoft.Compute/disks/read",
  "Microsoft.Compute/disks/write",
  "Microsoft.Compute/disks/delete",
  "Microsoft.Compute/locations/operations/read",
  "Microsoft.Network/publicIPAddresses/read",
  "Microsoft.Network/publicIPAddresses/write",
  "Microsoft.Network/publicIPAddresses/delete",
  "Microsoft.Network/publicIPAddresses/join/action",
  "Microsoft.Network/networkInterfaces/read",
  "Microsoft.Network/networkInterfaces/write",
  "Microsoft.Network/networkInterfaces/delete",
  "Microsoft.Network/networkInterfaces/join/action",
  "Microsoft.Network/virtualNetworks/read",
  "Microsoft.Network/virtualNetworks/subnets/read",
  "Microsoft.Network/virtualNetworks/subnets/join/action",
  "Microsoft.Network/networkSecurityGroups/read",
  "Microsoft.Network/networkSecurityGroups/join/action",
  "Microsoft.Network/locations/operations/read",
  "Microsoft.Logic/workflows/triggers/run/action"
]'
# What the backstop may do: find VMs and delete them with what they're
# made of. Nothing else.
backstop_actions='[
  "Microsoft.Compute/virtualMachines/read",
  "Microsoft.Compute/virtualMachines/instanceView/read",
  "Microsoft.Compute/virtualMachines/delete",
  "Microsoft.Compute/disks/delete",
  "Microsoft.Network/networkInterfaces/delete",
  "Microsoft.Network/publicIPAddresses/delete"
]'

step "Resource providers"
# A new subscription has to register a service before using it. The
# deploying identity can't, since that's a subscription-wide action.
for namespace in Microsoft.Compute Microsoft.Network Microsoft.ManagedIdentity Microsoft.Logic Microsoft.Consumption; do
  if [ "$(az provider show -n "$namespace" --query registrationState -o tsv)" != Registered ]; then
    echo "Registering $namespace, which can take a few minutes"
    az provider register -n "$namespace" --wait
  fi
  echo "$namespace is registered"
done

step "Resource group $rg"
existing=$(az group show -n "$rg" --query location -o tsv 2>/dev/null || true)
if [ -z "$existing" ]; then
  az group create -n "$rg" -l "$region" --tags app=paranoid -o none
elif [ "$existing" != "$region" ]; then
  fail "$rg already exists in $existing. Run teardown.sh first, or set AZURE_RESOURCE_GROUP to another name."
fi
echo "$rg is in $region"

step "Network watcher"
# Azure creates a network watcher, in a resource group of its own,
# NetworkWatcherRG, the first time a VNet is made in a region. Making it here
# first keeps it in $rg, so teardown.sh removes it too. It's free.
if [ -z "$(az network watcher list --query "[?location=='$region'].id" -o tsv)" ]; then
  az network watcher configure -g "$rg" -l "$region" --enabled true -o none
fi
echo "$region has a network watcher"

step "Firewall: network security group $nsg"
az network nsg show -g "$rg" -n "$nsg" -o none 2>/dev/null ||
  az network nsg create -g "$rg" -n "$nsg" -l "$region" --tags app=paranoid -o none
# rule <name> <priority> <access> <protocol> <source> <port>
rule() {
  az network nsg rule create -g "$rg" --nsg-name "$nsg" -n "$1" --priority "$2" \
    --direction Inbound --access "$3" --protocol "$4" \
    --source-address-prefixes "$5" --source-port-ranges '*' \
    --destination-address-prefixes '*' --destination-port-ranges "$6" -o none
}
rule allow-http 100 Allow Tcp Internet 80
rule allow-https 110 Allow Tcp Internet 443
rule deny-everything-else 4000 Deny '*' '*' '*'
# Only those three: any other rule, such as one someone added for SSH, goes.
for name in $(az network nsg rule list -g "$rg" --nsg-name "$nsg" --query '[].name' -o tsv); do
  case "$name" in
    allow-http | allow-https | deny-everything-else) ;;
    *)
      echo "Deleting the extra rule $name"
      az network nsg rule delete -g "$rg" --nsg-name "$nsg" -n "$name" -o none
      ;;
  esac
done
echo "Inbound: TCP 80 and 443 only. Port 22 is closed."

step "Network: $vnet"
az network vnet show -g "$rg" -n "$vnet" -o none 2>/dev/null ||
  az network vnet create -g "$rg" -n "$vnet" -l "$region" --address-prefixes 10.42.0.0/24 --tags app=paranoid -o none
if az network vnet subnet show -g "$rg" --vnet-name "$vnet" -n "$subnet" -o none 2>/dev/null; then
  az network vnet subnet update -g "$rg" --vnet-name "$vnet" -n "$subnet" --network-security-group "$nsg" -o none
else
  az network vnet subnet create -g "$rg" --vnet-name "$vnet" -n "$subnet" \
    --address-prefixes 10.42.0.0/26 --network-security-group "$nsg" -o none
fi
echo "$subnet is behind $nsg"

step "Identity for GitHub Actions: $identity"
az identity show -g "$rg" -n "$identity" -o none 2>/dev/null ||
  az identity create -g "$rg" -n "$identity" -l "$region" --tags app=paranoid -o none
client_id=$(az identity show -g "$rg" -n "$identity" --query clientId -o tsv)
principal_id=$(az identity show -g "$rg" -n "$identity" --query principalId -o tsv)
# The subject is what GitHub puts in a job's token when the job uses the
# `azure` environment. The repository's name must match GitHub's exactly,
# capitals included.
az identity federated-credential create -g "$rg" --identity-name "$identity" -n "$credential" \
  --issuer https://token.actions.githubusercontent.com \
  --subject "repo:$repo:environment:azure" \
  --audiences api://AzureADTokenExchange -o none
for name in $(az identity federated-credential list -g "$rg" --identity-name "$identity" --query '[].name' -o tsv); do
  if [ "$name" != "$credential" ]; then
    echo "Deleting the extra federated credential $name"
    az identity federated-credential delete -g "$rg" --identity-name "$identity" -n "$name" --yes -o none
  fi
done
echo "Trusts only repo:$repo:environment:azure. No secret exists."

# role <name> <description> <actions>: creates the custom role, or updates it
role() {
  local definition id
  definition=$(jq -n --arg name "$1" --arg description "$2" --argjson actions "$3" --arg scope "$rg_id" '{
    Name: $name, IsCustom: true, Description: $description,
    Actions: $actions, NotActions: [], DataActions: [], NotDataActions: [],
    AssignableScopes: [$scope]
  }')
  id=$(az role definition list --custom-role-only true --name "$1" --scope "$rg_id" --query '[0].name' -o tsv)
  if [ -z "$id" ]; then
    az role definition create --role-definition "$definition" -o none
  else
    az role definition update --role-definition "$(jq --arg id "$id" '. + {Id: $id}' <<<"$definition")" -o none
  fi
}

# assign <principal id> <role name>: gives the role on the resource group,
# retrying while Azure spreads a new role or identity to all its regions
assign() {
  local tries
  if [ -n "$(az role assignment list --scope "$rg_id" \
    --query "[?principalId=='$1' && roleDefinitionName=='$2'].id" -o tsv)" ]; then
    return
  fi
  for tries in 1 2 3 4 5 6 7 8 9 10; do
    if az role assignment create --assignee-object-id "$1" --assignee-principal-type ServicePrincipal \
      --role "$2" --scope "$rg_id" -o none 2>/dev/null; then
      return
    fi
    echo "Waiting for Azure to know the new role or identity (try $tries of 10)"
    sleep 15
  done
  az role assignment create --assignee-object-id "$1" --assignee-principal-type ServicePrincipal \
    --role "$2" --scope "$rg_id" -o none
}

step "Role: $deployer_role"
role "$deployer_role" "Lets GitHub Actions create and delete Paranoid VMs, their disks, NICs and public IPs in $rg, and start the backstop." "$deployer_actions"
assign "$principal_id" "$deployer_role"
echo "$identity has it on $rg only"

step "Backstop: the Logic App paranoid-backstop"
backstop_principal=$(az deployment group create -g "$rg" -n paranoid-backstop \
  --template-file "$here/backstop.json" --query properties.outputs.principalId.value -o tsv)
role "$backstop_role" "Lets the Paranoid backstop delete Paranoid VMs, their disks, NICs and public IPs in $rg." "$backstop_actions"
assign "$backstop_principal" "$backstop_role"
echo "It deletes a VM within minutes of it stopping or expiring, whatever GitHub does."

step "Budget"
# A late warning only: Azure checks costs a few times a day, and a budget
# never stops anything.
budget_url="https://management.azure.com$rg_id/providers/Microsoft.Consumption/budgets/paranoid?api-version=2023-11-01"
start=$(az rest --method get --url "$budget_url" --query properties.timePeriod.startDate -o tsv 2>/dev/null || true)
[ -n "$start" ] || start=$(date -u +%Y-%m-01T00:00:00Z)
body=$(jq -n --arg start "$start" --argjson amount "$budget" --arg email "$email" '
  def alert($threshold; $type): {
    enabled: true, operator: "GreaterThan", threshold: $threshold,
    thresholdType: $type, contactEmails: [$email]
  };
  {properties: {
    category: "Cost", amount: $amount, timeGrain: "Monthly",
    timePeriod: {startDate: $start},
    notifications: {
      actual50: alert(50; "Actual"),
      actual100: alert(100; "Actual"),
      forecast100: alert(100; "Forecasted")
    }
  }}')
if az rest --method put --url "$budget_url" --body "$body" -o none; then
  echo "Emails $email when $rg's costs pass 50% or 100% of $budget a month, or are forecast to pass 100%."
else
  echo "Warning: couldn't create the budget. Create one in the portal: Cost Management, Budgets. See docs/deploy/azure.md." >&2
fi

step "Done"
cat <<EOF
Nothing here costs money until you deploy. Now, with the GitHub CLI signed
in to GitHub (gh auth login), run these to set the repository variables.
None of them is a secret:

gh variable set AZURE_CLIENT_ID --repo $repo --body $client_id
gh variable set AZURE_TENANT_ID --repo $repo --body $tenant
gh variable set AZURE_SUBSCRIPTION_ID --repo $repo --body $subscription
gh variable set AZURE_RESOURCE_GROUP --repo $repo --body $rg
gh variable set AZURE_REGION --repo $repo --body $region

And these to create the azure environment, which only main may use:

gh api --method PUT repos/$repo/environments/azure --input - <<<'{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
gh api --method POST repos/$repo/environments/azure/deployment-branch-policies -f name=main -f type=branch
EOF
