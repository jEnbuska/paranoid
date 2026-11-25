# shellcheck shell=bash
# The settings checks every provider's deploy/<provider>/settings.sh shares.
# Sourced, not run, after `set -euo pipefail`:
#
#   here=$(dirname "$0")
#   # shellcheck source=deploy/ci/shared-settings.sh
#   . "$here/../ci/shared-settings.sh"
#   shared_settings
#   ...the provider's own checks, with fail, whole, amount and to_env...
#   settings_line "zone: $ZONE, plan: $PLAN"
#
# It reads no `vars` or `secrets`: the provider's workflow passes every value
# in through the settings step's `env:`. shared_settings checks the shared
# ones, the same way for every provider:
#
#   MAX_INVITES          the max_invites input, the variable, or 5
#   LIFETIME_MINUTES     the lifetime_minutes input, the variable, or 60
#   MAX_EGRESS_MBIT      the variable, or 2
#   MAX_DEPLOY_COST_USD  the variable, or 1
#   RUN_ID               github.run_id
#
# and passes them on through GITHUB_ENV, so the later steps of the job read
# only checked values. The deploy preflight has checked the variables
# already, and checks only what GitHub holds, not the inputs: the scripts
# check again every value they use (#141). Only whether a value is set at all
# is left to the preflight.
#
# The four shared variables' rules, each one's pattern and its minimum and
# maximum, are read from deploy/requirements.json, the preflight's list,
# which check-deploy-docs compares with the index's shared table. So there's
# one copy of each limit. If the file or a rule can't be read, it fails
# before it writes anything.
#
# to_env is the one way into GITHUB_ENV, and refuses a line break, so
# nothing can add a line, and so another variable, to it.

# fail <message>: the message as an error annotation, and exit 1. The
# message is escaped as GitHub's workflow commands need, so a value in it
# can't end the annotation and start another command.
fail() {
  local message=$1
  message=${message//%/%25}
  message=${message//$'\r'/%0D}
  message=${message//$'\n'/%0A}
  echo "::error::$message"
  exit 1
}

# whole <name> <value> <min> <max>: a whole number from min to max, in
# decimal even with leading zeros
whole() {
  if ! [[ $2 =~ ^[0-9]{1,6}$ ]] || ((10#$2 < $3 || 10#$2 > $4)); then
    fail "$1 must be a whole number from $3 to $4, not '$2'."
  fi
}

# The shared rules, next to this folder. Found from this file, not from
# anything a step can set.
shared_requirements="$(dirname "${BASH_SOURCE[0]}")/../requirements.json"

# rule_field <variable> <field>: one field of a shared variable's rule in
# shared_requirements, empty if the rule hasn't got it. Exits non-zero if
# the file can't be read, so the caller fails: a fail in $( ) would only end
# the subshell.
rule_field() {
  jq -r --arg name "$1" --arg field "$2" \
    '.variables[$name][$field] // "" | tostring' "$shared_requirements" 2>/dev/null
}

# shared_rule <variable> <label> <value>: checks the value against the
# variable's rule in deploy/requirements.json: its pattern, and its minimum
# and maximum if it has them. A rule without a pattern, or with limits that
# aren't whole numbers, fails, as does a pattern bash can't read.
shared_rule() {
  local pattern minimum maximum example
  local unreadable="Can't read the shared variables' rules, deploy/requirements.json, so $1 can't be checked."
  pattern=$(rule_field "$1" pattern) || fail "$unreadable"
  minimum=$(rule_field "$1" minimum) || fail "$unreadable"
  maximum=$(rule_field "$1" maximum) || fail "$unreadable"
  example=$(rule_field "$1" example) || fail "$unreadable"
  [[ $pattern == ^*\$ ]] ||
    fail "deploy/requirements.json has no pattern for $1, so it can't be checked."
  # $ matches only at the very end, so a value with a line break never matches
  if ! [[ $3 =~ $pattern ]]; then
    fail "$2 must match $pattern, such as ${example:-?}, not '$3'."
  fi
  if [ -n "$minimum$maximum" ]; then
    [[ $minimum =~ ^[0-9]{1,9}$ && $maximum =~ ^[0-9]{1,9}$ ]] ||
      fail "deploy/requirements.json's minimum and maximum for $1 aren't whole numbers."
    # Limits compare whole numbers, so a rule with them takes only digits
    if ! [[ $3 =~ ^[0-9]{1,9}$ ]] || ((10#$3 < minimum || 10#$3 > maximum)); then
      fail "$2 must be a whole number from $minimum to $maximum, not '$3'."
    fi
  fi
}

# amount <name> <value>: an amount in US dollars, in the format
# MAX_DEPLOY_COST_USD has in deploy/requirements.json, such as a provider's
# own limit
amount() {
  shared_rule MAX_DEPLOY_COST_USD "$1, an amount in US dollars," "$2"
}

# to_env <name> <value>: passes a checked value to the later steps of the
# job. A name is upper case, and neither can hold a line break, which would
# start another line of GITHUB_ENV.
to_env() {
  [[ $1 =~ ^[A-Z][A-Z0-9_]*$ ]] || fail "'$1' isn't a name for GITHUB_ENV."
  [[ $2 != *[$'\n\r']* ]] || fail "$1 holds a line break, so it can't be passed on."
  echo "$1=$2" >>"$GITHUB_ENV"
}

# shared_settings: checks the shared values above and passes them on, whole
# numbers without leading zeros
shared_settings() {
  shared_rule MAX_INVITES "MAX_INVITES (or the max_invites input)" "$MAX_INVITES"
  shared_rule LIFETIME_MINUTES "LIFETIME_MINUTES (or the lifetime_minutes input)" "$LIFETIME_MINUTES"
  shared_rule MAX_EGRESS_MBIT MAX_EGRESS_MBIT "$MAX_EGRESS_MBIT"
  shared_rule MAX_DEPLOY_COST_USD "MAX_DEPLOY_COST_USD, an amount in US dollars," "$MAX_DEPLOY_COST_USD"
  # Into every name and `run` label
  [[ $RUN_ID =~ ^[0-9]{1,20}$ ]] || fail "The run ID isn't a number: '$RUN_ID'."

  MAX_INVITES=$((10#$MAX_INVITES))
  LIFETIME_MINUTES=$((10#$LIFETIME_MINUTES))
  MAX_EGRESS_MBIT=$((10#$MAX_EGRESS_MBIT))
  to_env MAX_INVITES "$MAX_INVITES"
  to_env LIFETIME_MINUTES "$LIFETIME_MINUTES"
  to_env MAX_EGRESS_MBIT "$MAX_EGRESS_MBIT"
  to_env MAX_DEPLOY_COST_USD "$MAX_DEPLOY_COST_USD"
  to_env RUN_ID "$RUN_ID"
}

# settings_line [<the provider's own settings>]: the settings in the log
settings_line() {
  echo "Invites: $MAX_INVITES, lifetime: $LIFETIME_MINUTES min, outbound limit: $MAX_EGRESS_MBIT Mbit/s, cost limit: \$$MAX_DEPLOY_COST_USD${1:+, $1}"
}
