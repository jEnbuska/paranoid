# Contributing

Paranoid has two long-lived branches:

- **`dev`** is the default branch. All work lands here.
- **`main`** holds what has been released. It only ever receives `dev`.

## The rules

|                                | Into `dev`                                                                         | Into `main`                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Allowed source                 | A PR that links an open issue, or a `hotfix/*` branch in this repository           | `dev` of this repository                                        |
| Direct pushes                  | Refused, for everyone                                                              | Refused, unless they fast-forward to the commit of a passing PR |
| Force-pushes and deletion      | Refused, for everyone                                                              | Refused, for everyone                                           |
| Must be up to date with target | Yes                                                                                | Yes                                                             |
| Checks that must pass          | `Lint, format, typecheck, test & build`, `End-to-end tests (chromium)`, `PR rules` | The same, plus `End-to-end tests (firefox)` and `(webkit)`      |
| How it lands                   | Rebase and merge                                                                   | Fast-forward                                                    |
| Who merges                     | The maintainer                                                                     | The maintainer                                                  |

CI skips the work a PR's changes can't affect, for example the end-to-end tests on a docs-only PR, and a skipped check counts as passing. A PR with no changes at all fails `PR rules` unless it's a draft, so an empty PR can't get through by skipping CI.

## Opening a pull request

1. Find or open an issue, and start your branch from `dev`. Name it `<TICKET_NUMBER>-<name>`, for example `2-peers-stuck-connecting`.
2. Open the PR against `dev`, with `Closes #N`, `Fixes #N` or `Resolves #N` in its description. The issue has to be open. It closes when the PR merges.
3. Keep the branch up to date by rebasing, with `git rebase origin/dev` or the "Update with rebase" option on the PR.

Run the checks listed in the [README](README.md#scripts) before pushing. CI only runs Chromium on PRs into `dev`, so run `pnpm test:e2e` locally to cover Firefox and WebKit as well. If a browser fails, move the PR to draft and add a comment saying which browser and test failed.

## Automatic rebases

A PR has to be up to date with its base to merge, so each merge leaves every other open PR behind. [`auto-rebase.yml`](.github/workflows/auto-rebase.yml) catches them up: whenever `dev` or `main` gets a new commit, it rebases each open PR into that branch that has fallen behind, the same as "Update with rebase" on the PR. The rebased branch is a new head, so CI runs on it again.

- **Drafts are skipped.** Their author is still pushing to them, and a draft can't merge anyway. Rebase it yourself before marking it ready.
- **PRs from forks are skipped**, because the workflow can't push to them.
- **A PR that conflicts is left unchanged** and gets one comment saying it needs a manual rebase. The comment is edited once the conflict is gone, and a later conflict gets a new one.
- **A PR that's up to date is left alone**, whatever state its checks are in.

The rebase rewrites the PR branch on GitHub, so your next `git push --force-with-lease` is rejected: your local branch no longer matches. Don't force it. Fetch, put your local commits on top of the rebased branch, and push again:

```bash
git fetch origin
```

```bash
git rebase origin/<your-branch>
```

```bash
git push --force-with-lease
```

If you have no local commits that aren't pushed, `git reset --hard origin/<your-branch>` does the same.

To run it without a push, for example after changing the app, use "Run workflow" on the workflow's page under Actions and pick the base branch.

### The app it runs as

The rebase has to start CI, and a push made with the workflow's own `GITHUB_TOKEN` doesn't start workflows, so the workflow acts as a GitHub App instead. The maintainer sets it up once:

1. [Create a GitHub App](https://github.com/settings/apps/new) on the maintainer's account. Its homepage is this repository, "Webhook: Active" is off, and it can only be installed on this account.
2. Give it these repository permissions, and nothing else:
   - **Contents: Read and write**, to push the rebased PR branch.
   - **Pull requests: Read and write**, to rebase the PR and comment on PRs that conflict.
   - **Workflows: Read and write**, because GitHub refuses an app's push that changes a file under `.github/workflows`, and a rebase does that whenever the PR or the new base changes a workflow.
   - **Metadata: Read-only**, which every app has.
3. Generate a private key, and install the app on this repository only ("Only select repositories").
4. In the repository's Actions settings, add the app's Client ID as the variable `AUTO_REBASE_APP_CLIENT_ID` and the private key as the secret `AUTO_REBASE_APP_PRIVATE_KEY`, then delete the downloaded key.

Each run gets a token that covers only this repository and those permissions, and revokes it when it ends. PR branches aren't protected, so the app needs no bypass in the rulesets. The workflow isn't a PR check, so it isn't a required check either.

## Your email address

Everything you push stays public, and a commit on a pull request can't be removed afterwards, even if the pull request closes. That includes the commit's author and committer addresses.

- Commit with your [GitHub noreply address](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/setting-your-commit-email-address).
- Turn on "Keep my email addresses private" and "Block command line pushes that expose my email" in your [email settings](https://github.com/settings/emails) before opening a pull request. GitHub creates some commits for you, such as "Update branch", "Rebase and merge" and the test merge for every open pull request. Without that setting they carry your account's address, whatever your local git settings say.

## Hotfixes

A hotfix is a `hotfix/*` branch into `dev` that doesn't need an issue. It's released like everything else, through `dev`. Only branches in this repository count, because a fork can name a branch anything, so a fix from a fork links an issue.

## Releases

1. Open a PR from `dev` into `main`. This is the only PR that runs Firefox and WebKit in CI.
2. When every check has passed, fast-forward `main`:

   ```bash
   git fetch origin
   ```

   ```bash
   git push origin origin/dev:refs/heads/main
   ```

   GitHub accepts this push only because a PR with passing checks has that exact commit, and it marks the PR as merged.

**Don't press the merge button on a release PR.** GitHub's "Rebase and merge" always creates new commit hashes, so `main` would have commits that `dev` doesn't, and the next release PR would be behind `main`. It couldn't be updated either, because that would mean pushing to `dev`. With a fast-forward, `main` and `dev` are the same commit.

If it does get pressed, the maintainer turns off the `main` ruleset, force-pushes `dev` to `main` and turns the ruleset back on.

## Where the rules are enforced

| Rule                                     | Defined in                                                     | Enforced by                                |
| ---------------------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| PRs only, no force-push or deletion      | The `main` and `dev` rulesets, under repository settings       | GitHub, with no bypass for admins          |
| Checks pass, branch up to date           | The same rulesets, as required checks                          | GitHub, with no bypass for admins          |
| Rebase only, no merge commits            | Repository merge settings and the same rulesets                | GitHub                                     |
| Allowed source, open issue, no empty PRs | [`pr-rules.yml`](.github/workflows/pr-rules.yml)               | GitHub, as the required `PR rules` check   |
| Only the maintainer merges               | The repository's collaborators: the maintainer is the only one | GitHub, as anyone else has no write access |

`PR rules` uses `pull_request_target`, so its code comes from the default branch and a PR can't change the check that judges it. It reads the PR's details and never runs the PR's code.

GitHub can't require "every check", so each required job is listed by name in the rulesets. A new CI job has to be added there too.
