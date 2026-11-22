#!/usr/bin/env bash
# Checks that dev can be released, for the Release workflow (release.yml):
#   1. there's an open PR from dev into main, the release PR, and it isn't a
#      draft;
#   2. its head is the current dev commit, and the commit this run expects
#      (EXPECTED_SHA, if set);
#   3. every required check in the main ruleset has passed on that commit, in
#      the release PR's own runs;
#   4. CodeQL passed on that commit, in the release PR, with no open alert at
#      High or above, or error;
#   5. main is an ancestor of that commit, so pushing it is a fast-forward.
# It stops at the first check that fails and says which one. On success it
# writes `sha`, `pr`, `pr_url` and `commits` (the subjects since main, one per
# line) to $GITHUB_OUTPUT when that's set. It only reads, with gh and
# GH_TOKEN, which needs security-events: read for check 4.
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

# 4. CodeQL, with the thresholds of the rulesets' "Require code scanning
# results" rule. GitHub's docs say that rule blocks merging a PR, not a push,
# and the release pushes, so it's checked here. The CodeQL check is GitHub
# Advanced Security's, not a workflow's, so check 3 doesn't see it. It runs
# only on PRs, and briefly shows as skipped while the analyses run, so only a
# completed success counts.
codeql=$(gh api "repos/$repo/commits/$head/check-runs?check_name=CodeQL&filter=latest" \
  --jq '[.check_runs[] | select(.app.slug == "github-advanced-security")]')
if [ "$(jq length <<<"$codeql")" = 0 ]; then
  fail "Check 4 failed: the CodeQL check hasn't run on the release PR $pr_url at $head. Wait for it, then run the release again."
fi
bad=$(jq -r '[.[] | select(.status != "completed" or .conclusion != "success")][0] // empty | "\(.conclusion // .status) \(.html_url)"' <<<"$codeql")
if [ -n "$bad" ]; then
  fail "Check 4 failed: the CodeQL check isn't passing on the release PR: ${bad}"
fi
# The alerts list is empty for a ref that was never analysed, so first confirm
# that CodeQL analysed this exact commit in the release PR.
ref="refs/pull/$pr/head"
analyses=$(gh api "repos/$repo/code-scanning/analyses?ref=$ref&sha=$head&tool_name=CodeQL&per_page=100") ||
  fail "Check 4 failed: couldn't read the code scanning analyses of $ref. The job's token needs security-events: read."
if [ "$(jq length <<<"$analyses")" = 0 ]; then
  fail "Check 4 failed: CodeQL has no analysis of $head in the release PR $pr_url. Wait for it, then run the release again."
fi
errored=$(jq -r '[.[] | select(.error != "")][0] // empty | "\(.category): \(.error)"' <<<"$analyses")
if [ -n "$errored" ]; then
  fail "Check 4 failed: a CodeQL analysis of $head failed: $errored"
fi
alerts=$(gh api --paginate "repos/$repo/code-scanning/alerts?ref=$ref&state=open&tool_name=CodeQL&per_page=100" \
  --jq '.[] | select(.rule.security_severity_level == "critical" or .rule.security_severity_level == "high" or .rule.severity == "error") | "\(.html_url) (\(.rule.security_severity_level // .rule.severity))"') ||
  fail "Check 4 failed: couldn't read the code scanning alerts of $ref. The job's token needs security-events: read."
if [ -n "$alerts" ]; then
  fail "Check 4 failed: the release PR $pr_url has open CodeQL alerts at High or above, or error. Fix them in dev first: $(tr '\n' ' ' <<<"$alerts")"
fi
echo "Check 4 passed: CodeQL passed on $head, with no open alert at High or above, or error."

# 5. A fast-forward: main is an ancestor of the commit, which is ahead of it.
compare=$(gh api "repos/$repo/compare/main...$head")
case "$(jq -r .status <<<"$compare")" in
  ahead) ;;
  identical) fail "Check 5 failed: main is already at $head, so there's nothing to release." ;;
  *) fail "Check 5 failed: main isn't an ancestor of $head, so pushing it wouldn't be a fast-forward. main has commits that dev doesn't: see CONTRIBUTING.md's \"Releases\"." ;;
esac
echo "Check 5 passed: main is $(jq -r .ahead_by <<<"$compare") commits behind $head, and none ahead."

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
