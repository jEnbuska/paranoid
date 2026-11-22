#!/usr/bin/env bash
# Checks that dev can be released, for the Release workflow (release.yml):
#   1. there's an open PR from dev into main, the release PR, and it isn't a
#      draft;
#   2. its head is the current dev commit, and the commit this run expects
#      (EXPECTED_SHA, if set);
#   3. every required check in the main ruleset has passed on that commit, in
#      the release PR's own runs;
#   4. main is an ancestor of that commit, so pushing it is a fast-forward.
# It stops at the first check that fails and says which one. On success it
# writes `sha`, `pr`, `pr_url` and `commits` (the subjects since main, one per
# line) to $GITHUB_OUTPUT when that's set. It only reads, with gh and
# GH_TOKEN.
set -euo pipefail

repo="${GITHUB_REPOSITORY:?is not set}"
expected="${EXPECTED_SHA:-}"

fail() {
  echo "::error::$1"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '## Not released\n\n%s\n' "$1" >>"$GITHUB_STEP_SUMMARY"
  fi
  exit 1
}

# 1. The release PR. GitHub allows one open PR per head and base, but a fork
# can have a branch named dev too, so only this repository's dev counts.
prs=$(gh pr list --repo "$repo" --base main --head dev --state open \
  --json number,url,headRefOid,isDraft,isCrossRepository \
  --jq '[.[] | select(.isCrossRepository | not)]')
if [ "$(jq length <<<"$prs")" = 0 ]; then
  fail "Check 1 failed: there's no open PR from dev into main. Open the release PR first: gh pr create --base main --head dev --title \"Release $(date -u +%F)\""
fi
pr=$(jq -r '.[0].number' <<<"$prs")
pr_url=$(jq -r '.[0].url' <<<"$prs")
head=$(jq -r '.[0].headRefOid' <<<"$prs")
if [ "$(jq -r '.[0].isDraft' <<<"$prs")" = true ]; then
  fail "Check 1 failed: the release PR $pr_url is a draft. Mark it ready once its checks pass."
fi
echo "Check 1 passed: the release PR is $pr_url, at $head."

# 2. Nothing landed on dev after the release PR's checks ran.
dev=$(gh api "repos/$repo/branches/dev" --jq .commit.sha)
if [ "$dev" != "$head" ]; then
  fail "Check 2 failed: dev is at $dev, but the release PR $pr_url is at $head. Wait until the PR shows dev's latest commit and its checks have passed on it, then run the release again."
fi
if [ -n "$expected" ] && [ "$expected" != "$dev" ]; then
  fail "Check 2 failed: this run checked $expected, but dev is now at $dev: something landed on dev during the run. Wait for the release PR's checks on $dev, then run the release again."
fi
echo "Check 2 passed: dev is at $dev, the release PR's head."

# 3. The main ruleset's required checks, in the release PR's own runs. The same
# commit also has runs from the push to dev, which don't audit the whole tree,
# so those don't count.
required=$(gh api "repos/$repo/rules/branches/main" \
  --jq '[.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context] | unique')
if [ "$(jq length <<<"$required")" = 0 ]; then
  fail "Check 3 failed: the main ruleset requires no checks, so there's nothing to confirm the release with."
fi
# gh pr checks exits with 1 when a check failed and 8 when one is pending, and
# still prints them.
status=0
checks=$(gh pr checks "$pr" --repo "$repo" --json name,bucket,state,event,link) || status=$?
if [ "$status" != 0 ] && [ "$status" != 1 ] && [ "$status" != 8 ]; then
  fail "Check 3 failed: couldn't read the checks of the release PR $pr_url (gh exited with $status)."
fi
while IFS= read -r name; do
  runs=$(jq --arg name "$name" \
    '[.[] | select(.name == $name and (.event == "pull_request" or .event == "pull_request_target"))]' \
    <<<"$checks")
  if [ "$(jq length <<<"$runs")" = 0 ]; then
    fail "Check 3 failed: the required check \"$name\" hasn't run on the release PR $pr_url."
  fi
  # A skipped required check counts as passing, as it does for GitHub.
  bad=$(jq -r '[.[] | select(.bucket != "pass" and .bucket != "skipping")][0] // empty | "\(.state) \(.link)"' <<<"$runs")
  if [ -n "$bad" ]; then
    fail "Check 3 failed: the required check \"$name\" isn't passing on the release PR: ${bad}"
  fi
  echo "  \"$name\" passed."
done < <(jq -r '.[]' <<<"$required")
echo "Check 3 passed: every required check in the main ruleset passed on $head."

# 4. A fast-forward: main is an ancestor of the commit, which is ahead of it.
compare=$(gh api "repos/$repo/compare/main...$head")
case "$(jq -r .status <<<"$compare")" in
  ahead) ;;
  identical) fail "Check 4 failed: main is already at $head, so there's nothing to release." ;;
  *) fail "Check 4 failed: main isn't an ancestor of $head, so pushing it wouldn't be a fast-forward. main has commits that dev doesn't: see CONTRIBUTING.md's \"Releases\"." ;;
esac
echo "Check 4 passed: main is $(jq -r .ahead_by <<<"$compare") commits behind $head, and none ahead."

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "sha=$head"
    echo "pr=$pr"
    echo "pr_url=$pr_url"
    echo "commits<<END_OF_COMMITS"
    jq -r '.commits[].commit.message | split("\n")[0]' <<<"$compare"
    echo "END_OF_COMMITS"
  } >>"$GITHUB_OUTPUT"
fi
