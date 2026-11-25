#!/usr/bin/env bash
# Writes a deploy's summary to GITHUB_STEP_SUMMARY, the same for every
# provider (point 10 of "The same deploy on every provider" in
# docs/deploy/README.md):
#
#   bash deploy/ci/write-summary.sh --url <url> --expires <unix time> \
#     --invites <n> --size <size> --region <region> --cost <usd> \
#     --deleted-by <sentences> [--extra <line>]...
#
# - --expires: when the server shuts down at the latest, in Unix seconds
# - --size and --region: the provider's own words for them, as the deploy
#   used them, such as cx23 and nbg1
# - --cost: WORST_CASE_USD, from the cost check
# - --deleted-by: what deletes the server, and when, in the provider's words,
#   such as "The Clean up Hetzner workflow deletes it within about an hour
#   of shutting down, and Stop Hetzner deletes it right away."
# - --extra: a line of the provider's own after the cost, such as Google
#   Cloud's budget left for the month. Repeat it for more.
#
# It reads no `vars` or `secrets`, and the provider's workflow passes every
# value in. Each is checked before it's written: the summary is Markdown
# that anyone who can read the fork's runs sees, so nothing in it can add a
# line, a link or HTML.
set -euo pipefail

fail() {
  echo "::error::$1"
  exit 1
}

usage() {
  echo "Usage: $0 --url <url> --expires <unix time> --invites <n> --size <size> --region <region> --cost <usd> --deleted-by <sentences> [--extra <line>]..." >&2
  exit 2
}

url='' expires='' invites='' size='' region='' cost='' deleted_by=''
extras=()
while (($# > 0)); do
  (($# >= 2)) || usage
  case $1 in
    --url) url=$2 ;;
    --expires) expires=$2 ;;
    --invites) invites=$2 ;;
    --size) size=$2 ;;
    --region) region=$2 ;;
    --cost) cost=$2 ;;
    --deleted-by) deleted_by=$2 ;;
    --extra) extras+=("$2") ;;
    *) usage ;;
  esac
  shift 2
done

[[ $url =~ ^https://[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?/?$ ]] ||
  fail "The URL isn't an https:// address of a host: '$url'"
[[ $expires =~ ^[0-9]{1,12}$ ]] ||
  fail "The shutdown time isn't a Unix time: '$expires'"
[[ $invites =~ ^[1-9][0-9]{0,4}$ ]] ||
  fail "The invites aren't a whole number: '$invites'"
[[ $size =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]] ||
  fail "The size isn't a server size: '$size'"
[[ $region =~ ^[a-z0-9][a-z0-9-]{0,63}$ ]] ||
  fail "The region isn't a region: '$region'"
[[ $cost =~ ^[0-9]{1,6}(\.[0-9]{1,4})?$ ]] ||
  fail "The cost isn't an amount in US dollars: '$cost'"

# A sentence the provider wrote: one line of plain text, with no Markdown
# link, image or HTML. In a variable, so bash reads it the same in every
# version.
plain="^[A-Za-z0-9 .,'\$:()-]+\$"
text() {
  if ! [[ $2 =~ $plain ]] || ((${#2} > 400)); then
    fail "$1 must be one line of plain text, up to 400 characters: letters, digits, spaces and . , ' \$ : ( ) -"
  fi
}
text "The --deleted-by sentence" "$deleted_by"
for extra in ${extras[@]+"${extras[@]}"}; do
  text "Each --extra line" "$extra"
done

# GNU date on the runner, BSD date on a Mac
shutdown=$(date -u -d "@$expires" '+%Y-%m-%d %H:%M UTC' 2>/dev/null ||
  date -u -r "$expires" '+%Y-%m-%d %H:%M UTC')
{
  echo "## Paranoid is running"
  echo
  echo "**<$url>**"
  echo
  echo "- It shuts down once $invites invites are finished, or at $shutdown at the latest. Chats that have started keep working after that."
  echo "- Size: $size, in $region. $deleted_by"
  echo "- The most it can cost is \$$cost, before tax."
  for extra in ${extras[@]+"${extras[@]}"}; do
    echo "- $extra"
  done
} >>"$GITHUB_STEP_SUMMARY"
