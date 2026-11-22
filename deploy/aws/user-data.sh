#!/usr/bin/env bash
# Writes an EC2 instance's user data to stdout: deploy/server/cloud-init.yaml
# with its ${...} values filled in, then public-host.yaml, as the two parts of
# a MIME multipart message, which cloud-init reads part by part.
#
# Reads REPOSITORY, COMMIT, MAX_INVITES, LIFETIME_MINUTES and MAX_EGRESS_MBIT.
# settings.sh, the deploy preflight and create-server.sh check them first;
# they're checked again here, so nothing unchecked can reach the user data. PARANOID_HOST is left empty:
# the instance's public address isn't known yet, and public-host.yaml fills
# it in on the instance.
set -euo pipefail

here=$(dirname "$0")
boundary="==paranoid-user-data=="

check() {
  [[ $2 =~ $3 ]] || {
    echo "Unexpected $1: '$2'" >&2
    exit 1
  }
}
check REPOSITORY "$REPOSITORY" '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
check COMMIT "$COMMIT" '^[0-9a-f]{40}$'
check MAX_INVITES "$MAX_INVITES" '^[1-9][0-9]{0,4}$'
check LIFETIME_MINUTES "$LIFETIME_MINUTES" '^[1-9][0-9]{0,3}$'
check MAX_EGRESS_MBIT "$MAX_EGRESS_MBIT" '^[1-9][0-9]?$'

PARANOID_HOST=
export REPOSITORY COMMIT MAX_INVITES LIFETIME_MINUTES MAX_EGRESS_MBIT PARANOID_HOST
# shellcheck disable=SC2016 # envsubst gets the names, not their values
main=$(envsubst '$REPOSITORY $COMMIT $MAX_INVITES $LIFETIME_MINUTES $MAX_EGRESS_MBIT $PARANOID_HOST' \
  <"$here/../server/cloud-init.yaml")
unfilled='\$\{[A-Z_][A-Z0-9_]*\}'
if [[ $main =~ $unfilled ]]; then
  echo "deploy/server/cloud-init.yaml has a \${...} value that user-data.sh doesn't fill in" >&2
  exit 1
fi
host=$(cat "$here/public-host.yaml")

if [[ $main$host == *"$boundary"* ]]; then
  echo "The user data contains its own MIME boundary" >&2
  exit 1
fi

# part <file name> <content>
part() {
  printf -- '--%s\n' "$boundary"
  printf 'Content-Type: text/cloud-config; charset="us-ascii"\n'
  printf 'MIME-Version: 1.0\n'
  printf 'Content-Transfer-Encoding: 7bit\n'
  printf 'Content-Disposition: attachment; filename="%s"\n\n' "$1"
  printf '%s\n' "$2"
}

printf 'Content-Type: multipart/mixed; boundary="%s"\nMIME-Version: 1.0\n\n' "$boundary"
part cloud-init.yaml "$main"
part public-host.yaml "$host"
printf -- '--%s--\n' "$boundary"
