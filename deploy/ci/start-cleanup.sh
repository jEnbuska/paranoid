#!/usr/bin/env bash
# The step of .github/actions/start-cleanup-on-main, which every provider's
# scheduled cleanup runs, with the inputs in its environment. Starts
# WORKFLOW on main, unless
# REPO has no <PROVIDER>-cleanup environment or WORKFLOW isn't on main yet.
# deploy-<provider>.yml and cleanup-<provider>.yml reach main together, so
# then nothing can have been deployed. Any other error reading them fails
# the run, so a cleanup that can't start shows.
#
# gh reads GH_TOKEN from the environment.
set -euo pipefail

[[ $PROVIDER =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || {
  echo "::error::The provider must be a name such as upcloud, not '$PROVIDER'."
  exit 1
}
[[ $WORKFLOW == "cleanup-$PROVIDER.yml" ]] || {
  echo "::error::The workflow must be cleanup-$PROVIDER.yml, not '$WORKFLOW'."
  exit 1
}
[[ $REPO =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || {
  echo "::error::Unexpected repository name: $REPO"
  exit 1
}

# missing <API path>: whether it's 404. Exits on any other error.
missing() {
  local error
  if error=$(gh api "$1" --silent 2>&1); then
    return 1
  fi
  if [[ $error == *"HTTP 404"* ]]; then
    return 0
  fi
  echo "::error::$error"
  exit 1
}

guide="docs/deploy/$PROVIDER.md"
if missing "repos/$REPO/environments/$PROVIDER-cleanup"; then
  echo "There's no $PROVIDER-cleanup environment, so there's nothing to clean up with. See $guide."
elif missing "repos/$REPO/contents/.github/workflows/$WORKFLOW?ref=main"; then
  echo "$WORKFLOW isn't on main yet, and neither is deploy-$PROVIDER.yml, so there's nothing to clean up."
else
  gh workflow run "$WORKFLOW" --repo "$REPO" --ref main
  echo "Started the cleanup on main."
fi
