# shellcheck shell=bash
# shellcheck disable=SC2034 # the script that sources this reads mode and run
# Reads the mode of a provider's deploy/<provider>/delete-servers.sh, the
# same for every provider ("The same deploy on every provider" in
# docs/deploy/README.md):
#
#   delete-servers.sh all          every server, running or not (Stop, and a
#                                  deploy before it creates its server)
#   delete-servers.sh finished     what's off or past its expiry (Clean up)
#   delete-servers.sh run <id>     one deploy's server, after it failed
#
# Sourced, not run, with the run ID's pattern, then the script's arguments:
#
#   here=$(dirname "$0")
#   # shellcheck source=deploy/ci/delete-mode.sh
#   . "$here/../ci/delete-mode.sh"
#   delete_mode '[0-9]+' "$@"
#
# The pattern is the provider's own, since a run ID goes into its names and
# labels, such as Google Cloud's <run_id>-<attempt>: '[0-9]+-[0-9]+'. It is
# matched against the whole ID, so it needs no ^ or $. delete_mode sets
# `mode` to all, finished or run, and `run` to the ID, empty unless the mode
# is run. Anything else, an extra argument included, prints the usage and
# exits with code 2. Which servers each mode deletes, and what counts as
# already deleted, stay the provider's own.

# delete_mode <id pattern> [<mode> [<id>]]
delete_mode() {
  local pattern=$1
  shift
  mode=${1:-}
  run=
  case "$mode:$#" in
    all:1 | finished:1) return 0 ;;
    run:2)
      # bash's =~ never lets $ match before a line break, so an ID with
      # one never matches
      if [[ $2 =~ ^($pattern)$ ]]; then
        run=$2
        return 0
      fi
      ;;
  esac
  echo "Usage: $0 all | finished | run <run id>" >&2
  exit 2
}
