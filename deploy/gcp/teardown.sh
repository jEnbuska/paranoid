#!/usr/bin/env bash
# Removes everything bootstrap.sh created in a Google Cloud project, and any
# Paranoid VM and disk: the VMs, the network, the ledger bucket and its
# ledgers, the service accounts and their roles, Workload Identity Federation
# and the budget alert. Running it again is safe. See docs/deploy/gcp.md.
#
# What stays: the enabled APIs, which cost nothing, and Google's own records
# of deleted roles and pools, which it purges after 30 to 37 days. The
# project itself stays too; delete it in the console to remove everything.
#
# Usage: deploy/gcp/teardown.sh <project-id>
set -euo pipefail

[ $# = 1 ] && [[ $1 =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || {
  echo "Usage: $0 <project-id>" >&2
  exit 2
}
project=$1
export CLOUDSDK_CORE_PROJECT=$project
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
deploy_sa="paranoid-deploy@$project.iam.gserviceaccount.com"
cleanup_sa="paranoid-cleanup@$project.iam.gserviceaccount.com"
bucket="$project-paranoid"

step() { printf '\n== %s\n' "$1"; }
exists() { "$@" >/dev/null 2>&1; }

step "VMs and disks"
gcloud compute instances list --filter='name ~ ^paranoid-' \
  --format='value(name,zone.basename())' |
  while read -r name zone; do
    gcloud compute instances delete "$name" --zone="$zone" --delete-disks=all
  done
gcloud compute disks list --filter='name ~ ^paranoid-' \
  --format='value(name,zone.basename())' |
  while read -r name zone; do
    gcloud compute disks delete "$name" --zone="$zone"
  done

step "Network"
if exists gcloud compute firewall-rules describe paranoid-allow-web; then
  gcloud compute firewall-rules delete paranoid-allow-web
fi
gcloud compute networks subnets list --filter='name=paranoid' \
  --format='value(name,region.basename())' |
  while read -r name region; do
    gcloud compute networks subnets delete "$name" --region="$region"
  done
if exists gcloud compute networks describe paranoid; then
  gcloud compute networks delete paranoid
fi

step "Ledger bucket"
if exists gcloud storage buckets describe "gs://$bucket"; then
  gcloud storage rm --recursive "gs://$bucket"
fi

step "Workload Identity Federation"
state=$(gcloud iam workload-identity-pools describe paranoid-github --location=global \
  --format='value(state)' 2>/dev/null || true)
if [ "$state" = ACTIVE ]; then
  # Deleting the pool deletes its provider too.
  gcloud iam workload-identity-pools delete paranoid-github --location=global
fi

step "Service accounts and roles"
for sa in "$deploy_sa" "$cleanup_sa"; do
  for role in paranoidVms paranoidVmsDelete paranoidList; do
    gcloud projects remove-iam-policy-binding "$project" --member="serviceAccount:$sa" \
      --role="projects/$project/roles/$role" --all >/dev/null 2>&1 || true
  done
  if exists gcloud iam service-accounts describe "$sa"; then
    gcloud iam service-accounts delete "$sa"
  fi
done
for role in paranoidVms paranoidVmsDelete paranoidList paranoidSubnet; do
  deleted=$(gcloud iam roles describe "$role" --project="$project" \
    --format='value(deleted)' 2>/dev/null || echo gone)
  if [ "$deleted" != True ] && [ "$deleted" != gone ]; then
    gcloud iam roles delete "$role" --project="$project" >/dev/null
    echo "Deleted the role $role"
  fi
done

step "Budget alert"
account=$(gcloud billing projects describe "$project" --format='value(billingAccountName)' 2>/dev/null || true)
account=${account#billingAccounts/}
if [ -n "$account" ]; then
  gcloud billing budgets list --billing-account="$account" \
    --filter="displayName=paranoid-$project" --format='value(name)' 2>/dev/null |
    while read -r budget; do
      gcloud billing budgets delete "$budget"
    done
fi

step "Done"
cat <<EOF
Nothing of Paranoid's is left in $project apart from the enabled APIs.
To also remove the GitHub environments and the variables:

gh api --method DELETE "repos/<owner>/<repo>/environments/gcp"
gh api --method DELETE "repos/<owner>/<repo>/environments/gcp-cleanup"
for name in GCP_PROJECT GCP_REGION GCP_ZONE GCP_BUCKET GCP_WORKLOAD_IDENTITY_PROVIDER; do gh variable delete "\$name" --repo <owner>/<repo>; done
EOF
