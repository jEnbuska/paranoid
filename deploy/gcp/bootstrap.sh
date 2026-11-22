#!/usr/bin/env bash
# One-time setup of a Google Cloud project for Paranoid deployments from a
# GitHub repository, with gcloud. Running it again is safe: it creates what's
# missing and resets what's there to the settings below. teardown.sh removes
# it all again. See docs/deploy/gcp.md.
#
# Usage: deploy/gcp/bootstrap.sh <project-id> <owner/repo> [region] [monthly-limit-usd]
#   region: default europe-north1 (Finland). It must have prices in
#     deploy/gcp/prices.json.
#   monthly-limit-usd: default 5, for the Cloud Billing budget's alerts. The
#     deploy workflow's own limit is the GCP_MONTHLY_BUDGET_USD variable.
#
# Needs gcloud, signed in (`gcloud auth login`) as an owner of the project,
# which must have billing enabled, and gh, signed in, to look up the
# repository's IDs. Nothing it creates costs money while no VM runs, apart
# from a fraction of a cent for the ledger in the bucket.
#
# It creates no key or secret of any kind. GitHub Actions signs in with
# Workload Identity Federation: GitHub's short-lived OIDC token for a run of
# the repository's main branch is exchanged for a short-lived Google Cloud
# token: of the deploy service account in the gcp environment, or of the
# delete-only cleanup service account in the gcp-cleanup environment.
set -euo pipefail

usage() {
  echo "Usage: $0 <project-id> <owner/repo> [region] [monthly-limit-usd]" >&2
  exit 2
}
[ $# -ge 2 ] && [ $# -le 4 ] || usage
project=$1
repo=$2
region=${3:-europe-north1}
limit=${4:-5}

[[ $project =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || usage
[[ $repo =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]] || usage
[[ $region =~ ^[a-z]+-[a-z]+[0-9]{1,2}$ ]] || usage
[[ $limit =~ ^[0-9]{1,4}(\.[0-9]{1,2})?$ ]] || usage
if ! grep -q "\"$region\":" "$(dirname "$0")/prices.json"; then
  echo "deploy/gcp/prices.json has no prices for $region, so deploys there would be refused. Add them first." >&2
  exit 1
fi

export CLOUDSDK_CORE_PROJECT=$project
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

step() { printf '\n== %s\n' "$1"; }
# exists <command...>: whether a describe command finds the resource
exists() { "$@" >/dev/null 2>&1; }
# retry <command...>: IAM changes to something just created can take a few
# seconds to be accepted.
retry() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    if "$@" >/dev/null; then
      return 0
    fi
    echo "Trying again in $((attempt * 5)) seconds"
    sleep $((attempt * 5))
  done
  "$@" >/dev/null
}

step "Checking the project"
number=$(gcloud projects describe "$project" --format='value(projectNumber)')
if [ "$(gcloud billing projects describe "$project" --format='value(billingEnabled)')" != True ]; then
  echo "Billing isn't enabled for $project. Link it to a billing account first (docs/deploy/gcp.md)." >&2
  exit 1
fi
read -r repo_id owner_id < <(gh api "repos/$repo" --jq '"\(.id) \(.owner.id)"')
[[ $repo_id =~ ^[0-9]+$ && $owner_id =~ ^[0-9]+$ ]] || {
  echo "Couldn't look up $repo on GitHub." >&2
  exit 1
}
echo "Project $project ($number), repository $repo ($repo_id, owner $owner_id)"

step "Enabling the APIs"
# Compute Engine, IAM, IAM Credentials and Security Token Service (for
# Workload Identity Federation), Cloud Storage (the ledger) and Cloud
# Billing Budgets (the budget alert). Enabling an API costs nothing.
gcloud services enable compute.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com storage.googleapis.com \
  billingbudgets.googleapis.com
zone=$(gcloud compute zones list --filter="region:$region AND status=UP" \
  --format='value(name)' | sort | head -n 1)
[ -n "$zone" ] || {
  echo "No zone found in $region." >&2
  exit 1
}

step "Network"
# Its own network, not `default`, whose ready-made rules let in SSH and RDP
# from anywhere. IPv4 only, no flow logs, no firewall logging and no
# Private Google Access: the VM never calls Google's APIs.
exists gcloud compute networks describe paranoid ||
  gcloud compute networks create paranoid --subnet-mode=custom \
    --description="Paranoid VMs only"
if ! exists gcloud compute networks subnets describe paranoid --region="$region"; then
  gcloud compute networks subnets create paranoid --network=paranoid \
    --region="$region" --range=10.8.0.0/24 --stack-type=IPV4_ONLY
fi
gcloud compute networks subnets update paranoid --region="$region" \
  --no-enable-flow-logs --no-enable-private-ip-google-access >/dev/null
# The only way in: HTTP, for Let's Encrypt and the redirect, and HTTPS.
firewall=("--rules=tcp:80,tcp:443" --source-ranges=0.0.0.0/0
  --target-tags=paranoid --no-enable-logging)
if exists gcloud compute firewall-rules describe paranoid-allow-web; then
  gcloud compute firewall-rules update paranoid-allow-web "${firewall[@]}"
else
  gcloud compute firewall-rules create paranoid-allow-web "${firewall[@]}" \
    --network=paranoid --direction=INGRESS --action=ALLOW \
    --description="HTTP and HTTPS to Paranoid VMs"
fi

step "Ledger bucket"
bucket="$project-paranoid"
if ! exists gcloud storage buckets describe "gs://$bucket"; then
  gcloud storage buckets create "gs://$bucket" --location="$region" \
    --uniform-bucket-level-access --public-access-prevention \
    --soft-delete-duration=0
fi
lifecycle=$(mktemp)
trap 'rm -f "$lifecycle"' EXIT
# A month's ledger is kept for a little over a year.
echo '{"rule": [{"action": {"type": "Delete"}, "condition": {"age": 400}}]}' >"$lifecycle"
gcloud storage buckets update "gs://$bucket" --uniform-bucket-level-access \
  --public-access-prevention --clear-soft-delete --lifecycle-file="$lifecycle" >/dev/null

step "Service accounts and their roles"
# Two accounts, one for each GitHub environment. paranoid-deploy, for
# deploy-gcp.yml in the gcp environment, whose runs wait for the owner's
# approval, creates VMs. paranoid-cleanup, for stop-gcp.yml and
# cleanup-gcp.yml in the gcp-cleanup environment, which runs without
# approval so the hourly cleanup works, can only delete them.
deploy_sa="paranoid-deploy@$project.iam.gserviceaccount.com"
cleanup_sa="paranoid-cleanup@$project.iam.gserviceaccount.com"
exists gcloud iam service-accounts describe "$deploy_sa" ||
  gcloud iam service-accounts create paranoid-deploy \
    --display-name="Paranoid deploys from GitHub Actions" \
    --description="Used only by $repo's deploy workflow, through Workload Identity Federation"
exists gcloud iam service-accounts describe "$cleanup_sa" ||
  gcloud iam service-accounts create paranoid-cleanup \
    --display-name="Paranoid stops and cleanups from GitHub Actions" \
    --description="Used only by $repo's stop and cleanup workflows, through Workload Identity Federation. Can only delete."

# role <id> <title> <permissions>: creates or updates a custom role with
# exactly these permissions. A role deleted by teardown.sh is undeleted:
# its ID can't be reused for 37 days.
role() {
  local deleted
  if deleted=$(gcloud iam roles describe "$1" --project="$project" --format='value(deleted)' 2>/dev/null); then
    if [ "$deleted" = True ]; then
      gcloud iam roles undelete "$1" --project="$project" >/dev/null
    fi
    gcloud iam roles update "$1" --project="$project" --title="$2" \
      --permissions="$3" --stage=GA >/dev/null
  else
    gcloud iam roles create "$1" --project="$project" --title="$2" \
      --permissions="$3" --stage=GA >/dev/null
  fi
  echo "Role $1: $3"
}
# Create, look at and delete VMs and their boot disks. The binding below
# limits it to paranoid-* VMs and disks in the zone.
role paranoidVms "Paranoid: manage paranoid-* VMs" \
  compute.instances.create,compute.instances.delete,compute.instances.get,compute.instances.getSerialPortOutput,compute.instances.setLabels,compute.instances.setMetadata,compute.instances.setTags,compute.disks.create,compute.disks.delete,compute.disks.setLabels
# Only look at and delete them, for stopping and cleaning up
role paranoidVmsDelete "Paranoid: delete paranoid-* VMs" \
  compute.instances.delete,compute.instances.get,compute.disks.delete
# Listing works on the project, so it can't be limited by name. It shows
# names and settings, nothing else.
role paranoidList "Paranoid: list VMs and disks" \
  compute.instances.list,compute.disks.list,compute.zoneOperations.get
# Granted on the paranoid subnet only, below
role paranoidSubnet "Paranoid: put VMs on the paranoid subnet" \
  compute.subnetworks.use,compute.subnetworks.useExternalIp

condition=$(mktemp)
trap 'rm -f "$lifecycle" "$condition"' EXIT
cat >"$condition" <<EOF
{
  "title": "paranoid VMs only",
  "description": "Only VMs and disks named paranoid-* in $zone",
  "expression": "(resource.type == 'compute.googleapis.com/Instance' && resource.name.startsWith('projects/$project/zones/$zone/instances/paranoid-')) || (resource.type == 'compute.googleapis.com/Disk' && resource.name.startsWith('projects/$project/zones/$zone/disks/paranoid-'))"
}
EOF
# grant <service account> <VM role>: the VM role for paranoid-* only, a
# binding with an older condition (for example from another zone)
# replaced, plus listing and the ledger
grant() {
  gcloud projects remove-iam-policy-binding "$project" --member="serviceAccount:$1" \
    --role="projects/$project/roles/$2" --all >/dev/null 2>&1 || true
  retry gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:$1" \
    --role="projects/$project/roles/$2" --condition-from-file="$condition"
  retry gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:$1" \
    --role="projects/$project/roles/paranoidList" --condition=None
  # Read and write the ledger, in this bucket only
  retry gcloud storage buckets add-iam-policy-binding "gs://$bucket" \
    --member="serviceAccount:$1" --role=roles/storage.objectUser
  echo "Granted $2, paranoidList and the ledger to $1"
}
grant "$deploy_sa" paranoidVms
grant "$cleanup_sa" paranoidVmsDelete
# Only the deploy account puts VMs on the network.
retry gcloud compute networks subnets add-iam-policy-binding paranoid --region="$region" \
  --member="serviceAccount:$deploy_sa" --role="projects/$project/roles/paranoidSubnet"

step "Workload Identity Federation for GitHub Actions"
pool=paranoid-github
provider=github
# Pools and providers that teardown.sh deleted stay for 30 days, and their
# IDs can't be reused until then, so they're undeleted.
state=$(gcloud iam workload-identity-pools describe "$pool" --location=global \
  --format='value(state)' 2>/dev/null || true)
case "$state" in
  "") gcloud iam workload-identity-pools create "$pool" --location=global \
    --display-name="GitHub Actions for Paranoid" ;;
  DELETED) gcloud iam workload-identity-pools undelete "$pool" --location=global ;;
esac
# Only tokens for runs of this repository's main branch in its gcp or
# gcp-cleanup environment are accepted. The numeric IDs can't be taken over
# by someone who creates a repository or account with the same name later.
# attribute.repository_environment ties each environment to its own service
# account below.
mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.environment=assertion.environment,attribute.repository_environment=assertion.repository_id + ':' + assertion.environment"
accept="assertion.repository_id == '$repo_id' && assertion.repository_owner_id == '$owner_id' && assertion.ref == 'refs/heads/main' && assertion.environment in ['gcp', 'gcp-cleanup']"
state=$(gcloud iam workload-identity-pools providers describe "$provider" --location=global \
  --workload-identity-pool="$pool" --format='value(state)' 2>/dev/null || true)
case "$state" in
  "")
    gcloud iam workload-identity-pools providers create-oidc "$provider" \
      --location=global --workload-identity-pool="$pool" \
      --display-name="GitHub Actions" \
      --issuer-uri=https://token.actions.githubusercontent.com \
      --attribute-mapping="$mapping" --attribute-condition="$accept"
    ;;
  *)
    if [ "$state" = DELETED ]; then
      gcloud iam workload-identity-pools providers undelete "$provider" \
        --location=global --workload-identity-pool="$pool"
    fi
    gcloud iam workload-identity-pools providers update-oidc "$provider" \
      --location=global --workload-identity-pool="$pool" \
      --issuer-uri=https://token.actions.githubusercontent.com \
      --attribute-mapping="$mapping" --attribute-condition="$accept" >/dev/null
    ;;
esac
pool_name="projects/$number/locations/global/workloadIdentityPools/$pool"
members="principalSet://iam.googleapis.com/$pool_name/attribute.repository_environment"
# An older setup let any of the repository's runs act as the deploy account.
gcloud iam service-accounts remove-iam-policy-binding "$deploy_sa" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/$pool_name/attribute.repository_id/$repo_id" \
  >/dev/null 2>&1 || true
retry gcloud iam service-accounts add-iam-policy-binding "$deploy_sa" \
  --role=roles/iam.workloadIdentityUser --member="$members/$repo_id:gcp"
retry gcloud iam service-accounts add-iam-policy-binding "$cleanup_sa" \
  --role=roles/iam.workloadIdentityUser --member="$members/$repo_id:gcp-cleanup"
echo "Runs of $repo's main branch can act as $deploy_sa in its gcp environment,"
echo "and as $cleanup_sa in its gcp-cleanup environment."

step "Budget alert"
# Only a late warning: billing data lags by hours, and a budget doesn't stop
# anything. The deploy workflow's ledger is the limit. The amount is in the
# billing account's currency, and the alerts go to its administrators.
account=$(gcloud billing projects describe "$project" --format='value(billingAccountName)')
account=${account#billingAccounts/}
budget_args=(--billing-account="$account" --display-name="paranoid-$project"
  --budget-amount="$limit" --calendar-period=month
  --filter-projects="projects/$project"
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9
  --threshold-rule=percent=1.0)
if budget=$(gcloud billing budgets list --billing-account="$account" \
  --filter="displayName=paranoid-$project" --format='value(name)' 2>/dev/null) &&
  { [ -n "$budget" ] || gcloud billing budgets create "${budget_args[@]}" >/dev/null; }; then
  echo "A budget of $limit a month alerts at 50%, 90% and 100%."
else
  echo "WARNING: Couldn't create the budget alert. Creating one needs the Billing Account" >&2
  echo "Administrator or Costs Manager role. Create it in the console instead (docs/deploy/gcp.md)." >&2
fi

me=$(gh api user --jq .id)
[[ $me =~ ^[0-9]+$ ]] || {
  echo "Couldn't look up your GitHub account." >&2
  exit 1
}
branches='"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}'

step "Done. Now give GitHub these settings, none of which is a secret:"
cat <<EOF

# gcp, for deploys: only the main branch, and every deploy waits for your
# approval. "Prevent self-review" is off, so you can approve your own.
gh api --method PUT "repos/$repo/environments/gcp" --input - <<<'{"reviewers": [{"type": "User", "id": $me}], "prevent_self_review": false, $branches}'
gh api --method POST "repos/$repo/environments/gcp/deployment-branch-policies" -f name=main -f type=branch

# gcp-cleanup, for Stop and the hourly cleanup: only the main branch, no
# approval, and it can only delete
gh api --method PUT "repos/$repo/environments/gcp-cleanup" --input - <<<'{$branches}'
gh api --method POST "repos/$repo/environments/gcp-cleanup/deployment-branch-policies" -f name=main -f type=branch

# Keep the Actions logs, which anyone can read in a public repository, for
# 1 day
gh api --method PUT "repos/$repo/actions/permissions/artifact-and-log-retention" -F days=1

# Who signs in, and to what: identity values live only in the environments,
# never in repository variables, and each environment has its own
# service account under the same name
for env in gcp gcp-cleanup; do
  gh variable set GCP_PROJECT --repo "$repo" --env "\$env" --body "$project"
  gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --repo "$repo" --env "\$env" --body "$pool_name/providers/$provider"
  gh variable set GCP_BUCKET --repo "$repo" --env "\$env" --body "$bucket"
done
gh variable set GCP_SERVICE_ACCOUNT --repo "$repo" --env gcp --body "$deploy_sa"
gh variable set GCP_SERVICE_ACCOUNT --repo "$repo" --env gcp-cleanup --body "$cleanup_sa"

# Where the server runs, and the monthly limit: repository variables, like
# every provider's tuning and limits
gh variable set GCP_REGION --repo "$repo" --body "$region"
gh variable set GCP_ZONE --repo "$repo" --body "$zone"
gh variable set GCP_MONTHLY_BUDGET_USD --repo "$repo" --body "$limit"
EOF
