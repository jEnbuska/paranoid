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

# amount <name> <value>: an amount in US dollars below 10000, with up to two
# decimals, such as 1 or 2.50
amount() {
  [[ $2 =~ ^[0-9]{1,4}(\.[0-9]{1,2})?$ ]] ||
    fail "$1 must be an amount in US dollars such as 1 or 2.50, below 10000, not '$2'."
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
  whole "MAX_INVITES (or the max_invites input)" "$MAX_INVITES" 1 10000
  whole "LIFETIME_MINUTES (or the lifetime_minutes input)" "$LIFETIME_MINUTES" 1 1440
  whole MAX_EGRESS_MBIT "$MAX_EGRESS_MBIT" 1 50
  amount MAX_DEPLOY_COST_USD "$MAX_DEPLOY_COST_USD"
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
