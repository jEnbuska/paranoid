#!/usr/bin/env bash
# Reserves or settles a deployment's cost in the month's ledger, the object
# ledger/<MONTH>.json in the bucket (see ledger.ts). It downloads one
# generation of the ledger, applies the change with cli.ts and uploads it
# only if the ledger is still that generation, so two runs can't both spend
# the same budget. The workflows' concurrency group already keeps them apart;
# this holds even if it doesn't.
#
# Usage: ledger.sh reserve|settle
#   Environment: GCP_BUCKET and MONTH, plus what cli.ts needs.
set -euo pipefail

command=$1
# Both go into the gcloud command lines below. Checked here, although the
# preflight checked the bucket too, because stop and cleanup call this
# without settings.sh (#141).
[[ ${GCP_BUCKET:-} =~ ^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$ ]] || {
  echo "::error::GCP_BUCKET must be the bucket that bootstrap.sh created, not '${GCP_BUCKET:-}'." >&2
  exit 1
}
[[ ${MONTH:-} =~ ^[0-9]{4}-[0-9]{2}$ ]] || {
  echo "::error::The ledger's month isn't YYYY-MM: '${MONTH:-}'." >&2
  exit 1
}
url="gs://$GCP_BUCKET/ledger/$MONTH.json"
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT

for attempt in 1 2 3 4 5; do
  rm -f "$dir"/*
  # The generation to update, or 0 if there's no ledger for the month yet,
  # which makes the upload fail if one has appeared since.
  if generation=$(gcloud storage objects describe "$url" --format='value(generation)' 2>"$dir/error"); then
    gcloud storage cp --quiet "$url#$generation" "$dir/ledger.json"
  elif grep -qiE 'not ?found|404|matched no objects' "$dir/error"; then
    generation=0
  else
    cat "$dir/error" >&2
    exit 1
  fi

  [ -e "$dir/ledger.json" ] && cp "$dir/ledger.json" "$dir/before.json"
  node "$(dirname "$0")/cli.ts" "$command" "$dir/ledger.json"
  if [ ! -e "$dir/ledger.json" ] || cmp -s "$dir/ledger.json" "$dir/before.json"; then
    exit 0
  fi

  if gcloud storage cp --quiet --if-generation-match="$generation" \
    --content-type=application/json "$dir/ledger.json" "$url" 2>"$dir/error"; then
    exit 0
  fi
  if ! grep -qiE 'precondition|412' "$dir/error"; then
    cat "$dir/error" >&2
    exit 1
  fi
  echo "The ledger changed while it was being updated, trying again ($attempt)."
  sleep $((attempt * 2))
done
echo "::error::Couldn't update $url: it kept changing."
exit 1
