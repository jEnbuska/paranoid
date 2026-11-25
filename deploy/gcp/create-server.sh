#!/usr/bin/env bash
# Creates the deployment's VM, paranoid-<deployment>, and passes its
# hostname, URL and shutdown time to the later steps through GITHUB_OUTPUT.
#
# - Google Cloud deletes it, with its disk, once its lifetime is over
#   (--max-run-duration with --instance-termination-action=DELETE), even if
#   its setup fails or GitHub is down.
# - It has no service account, so nothing on it has Google Cloud
#   credentials. It never calls Google Cloud's API: it only powers itself off.
# - It's on the paranoid network, whose only firewall rule lets in TCP 80
#   and 443 to VMs tagged paranoid. Nothing opens SSH, and startup.sh masks
#   it anyway.
# - Its metadata holds only checked values: the preflight and settings.sh
#   checked the numbers,
#   and the repository and commit come from GitHub.
#
# Environment: DEPLOYMENT, MONTH, GCP_ZONE, DISK_GIB, LIFETIME_MINUTES,
# MAX_INVITES, MAX_EGRESS_MBIT, REPOSITORY, COMMIT, CLOUDSDK_CORE_PROJECT
set -euo pipefail

[[ $REPOSITORY =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]] || {
  echo "::error::Unexpected repository name: '$REPOSITORY'"
  exit 1
}
[[ $COMMIT =~ ^[0-9a-f]{40}$ ]] || {
  echo "::error::Unexpected commit: '$COMMIT'"
  exit 1
}

name="paranoid-$DEPLOYMENT"
# Labels, like every provider's: app, run (the run's ID and attempt, which
# the ledger is keyed on), created and expires, in Unix seconds, and
# paranoid-month for the ledger. Label values must be lowercase letters,
# digits, - and _, which these are.
created=$(date +%s)
expires=$((created + LIFETIME_MINUTES * 60))
labels="app=paranoid,run=$DEPLOYMENT,created=$created,expires=$expires,paranoid-month=$MONTH"
details=$(mktemp)
trap 'rm -f "$details"' EXIT

metadata=(
  # No SSH keys from the project, no interactive serial console and no copy
  # of the serial console in Cloud Logging
  block-project-ssh-keys=TRUE
  serial-port-enable=FALSE
  serial-port-logging-enable=FALSE
  # Read by startup.sh
  "paranoid-repository=$REPOSITORY"
  "paranoid-commit=$COMMIT"
  "paranoid-max-invites=$MAX_INVITES"
  "paranoid-max-egress-mbit=$MAX_EGRESS_MBIT"
)

gcloud compute instances create "$name" \
  --zone="$GCP_ZONE" \
  --machine-type=e2-micro \
  --image-family=debian-13 \
  --image-project=debian-cloud \
  --boot-disk-size="${DISK_GIB}GB" \
  --boot-disk-type=pd-standard \
  --boot-disk-auto-delete \
  --subnet=paranoid \
  --network-tier=STANDARD \
  --stack-type=IPV4_ONLY \
  --tags=paranoid \
  --labels="$labels" \
  --no-service-account \
  --no-scopes \
  --shielded-secure-boot \
  --shielded-vtpm \
  --shielded-integrity-monitoring \
  --provisioning-model=STANDARD \
  --max-run-duration="${LIFETIME_MINUTES}m" \
  --instance-termination-action=DELETE \
  --metadata-from-file=startup-script="$(dirname "$0")/startup.sh" \
  --metadata="$(
    IFS=,
    echo "${metadata[*]}"
  )" \
  --format=json >"$details"

# The boot disk, named like the VM, gets the same labels. gcloud can't set
# a boot disk's labels when it creates the VM, so this sets them after.
gcloud compute disks add-labels "$name" --zone="$GCP_ZONE" --labels="$labels" >/dev/null

ip=$(jq -r '.[0].networkInterfaces[0].accessConfigs[0].natIP // empty' "$details")
[[ $ip =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || {
  echo "::error::$name has no external IPv4 address."
  exit 1
}
host="${ip//./-}.sslip.io"

{
  echo "host=$host"
  echo "url=https://$host"
  echo "expires=$expires"
} >>"$GITHUB_OUTPUT"
echo "Created $name in $GCP_ZONE: https://$host"
