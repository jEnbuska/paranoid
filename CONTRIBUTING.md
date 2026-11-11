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

A PR with no changes fails `PR rules` unless it's a draft, so skipping CI can't count as passing.

## Opening a pull request

1. Find or open an issue, and start your branch from `dev`. Name it `#<TICKET_NUMBER>-<name>`, for example `#2-peers-stuck-connecting`, and quote the name in a shell, because an unquoted `#` starts a comment.
2. Open the PR against `dev`, with `Closes #N`, `Fixes #N` or `Resolves #N` in its description. The issue has to be open. It closes when the PR merges.
3. Keep the branch up to date by rebasing, with `git rebase origin/dev` or the "Update with rebase" option on the PR.

Run the checks listed in the [README](README.md#scripts) before pushing. CI only runs Chromium on PRs into `dev`, so run `pnpm test:e2e` locally to cover Firefox and WebKit as well. If a browser fails, move the PR to draft and add a comment saying which browser and test failed.

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
