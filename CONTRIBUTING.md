# Contributing

Paranoid has two long-lived branches:

- **`dev`** is the default branch. All work lands here.
- **`main`** holds what has been released. It only ever receives `dev`.

## The rules

|                                | Into `dev`                                                                                                     | Into `main`                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Allowed source                 | A PR that links an open issue, or a `hotfix/*` branch in this repository                                       | `dev` of this repository                                        |
| Direct pushes                  | Refused, for everyone                                                                                          | Refused, unless they fast-forward to the commit of a passing PR |
| Force-pushes and deletion      | Refused, for everyone                                                                                          | Refused, for everyone                                           |
| Must be up to date with target | Yes                                                                                                            | Yes                                                             |
| Checks that must pass          | `Lint, format, typecheck, test & build`, `End-to-end tests (chromium)`, `(firefox)` and `(webkit)`, `PR rules` | The same                                                        |
| How it lands                   | Rebase and merge                                                                                               | Fast-forward                                                    |
| Who merges                     | The maintainer                                                                                                 | The maintainer                                                  |

CI skips the work a PR's changes can't affect, and a skipped check counts as passing. This is intended:

- A docs-only PR (`**/*.md`, `LICENSE`) runs only the format check, for Markdown, and the `End-to-end tests` checks pass with their steps skipped.
- A PR that changes no package and nothing that installs them, for example only a root config file, runs the checks, and the end-to-end steps skip the same way.
- A PR with no changed files skips both CI jobs. It fails `PR rules` unless it's a draft, and the `End-to-end tests` checks are never reported, so an empty PR can't get through by skipping CI. GitHub won't merge a draft.

## When a PR can merge

A PR merges only when both are true:

- It's up to date with its base branch: the base's latest commit is in the PR's history.
- Every required check has passed on the PR's current head commit.

A PR that falls behind its base can't merge, even if its checks passed before. This holds for the maintainer too, since the rulesets have no bypass. Once you bring it up to date, its head is a new commit, CI runs again, and the PR stays blocked until the required checks pass on that commit.

When a PR is behind, rebase it onto its base and push:

```bash
git fetch origin
```

```bash
git rebase origin/dev
```

```bash
git push --force-with-lease
```

Or press "Update branch" on the PR and pick "Update with rebase", not "Update with merge commit": PR branches stay linear, like `dev` and `main`. After GitHub rebases the branch, fetch and reset or rebase your local branch onto it before pushing again.

GitHub's rebase drops empty commits, but `git rebase` keeps them. So "Update branch" on a draft PR that holds only its empty "Start" commit moves the branch to the base's tip, and GitHub then closes the PR because it has no commits. Rebase such a PR with `git rebase` instead, or don't update it until it has a real commit. If it was already closed, push a new commit to its branch and reopen it.

## Opening a pull request

1. Find or open an issue, and start your branch from `dev`. Name it `<TICKET_NUMBER>-<name>`, for example `2-peers-stuck-connecting`.
2. Open the PR against `dev`, with `Closes #N`, `Fixes #N` or `Resolves #N` in its description. The issue has to be open. It closes when the PR merges.
3. Keep the branch up to date by rebasing, with `git rebase origin/dev` or the "Update with rebase" option on the PR (see [When a PR can merge](#when-a-pr-can-merge), including why not to use that option on a PR whose only commit is empty).

When an issue is too big for one PR, split it. Pieces that can't really be built on their own, because they depend on each other or only make sense together, become [sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues) of the original issue (`gh issue create --parent <N>`, or `gh issue edit <N> --add-sub-issue <CHILD>` for an existing issue). Work that can be built on its own becomes a separate issue. The same goes for whatever a PR leaves undone: move it to a sub-issue or a separate issue before the PR merges.

Run the checks listed in the [README](README.md#scripts) before pushing. CI runs the end-to-end tests in Chromium, Firefox and WebKit on every PR. If a browser fails on a ready PR, move the PR to draft and add a comment saying which browser and test failed.

## Commit messages

Start each commit message with its ticket number, for example `#6 Add the GCP workflows`. Whenever git opens a message in your editor (`git commit` without `-m`, `git commit --amend`, `git rebase --continue` after a conflict, `git rebase -i`), it deletes the lines that start with `#` as comments, and the subject is gone. `git commit -m` is safe. Fix it for good in your own clone by making `;` the comment character:

```bash
git config core.commentChar ';'
```

It's a local setting, so it can't be committed, and each clone needs it once. Without it, pass `-c core.commentChar=';'` to both the `git rebase` that starts a rebase and each `--continue`. If a message has already lost its first line, put it back with `git commit --amend --cleanup=verbatim -m '<message>'`, which keeps the message exactly as you give it.

## Answering review comments

The maintainer reviews PRs on GitHub. Answer every comment on your PR, whether it's a comment on a line, a review or a plain PR comment, on GitHub in that comment's thread, so the PR records what was asked and what came of it. Reviews and plain PR comments have no threads, so answer them with a PR comment that quotes them.

- When the answer is about code, link the commit (`https://github.com/<owner>/<repo>/commit/<sha>`) or a permalink to the line (`https://github.com/<owner>/<repo>/blob/<sha>/<path>#L<n>`), not a branch, which moves.
- Answer questions right away.
- For a requested change, reply once a solution is found. If it changed code, push it and reply with what changed and the commit link. If it didn't, reply with the resolution.

Claude Code sessions follow the same rule, with the `gh` commands in [CLAUDE.md](CLAUDE.md). A session turns on PR monitoring for its PR if its environment has it (in the Claude desktop app, the PR's Auto-fix switch), so it's woken by new comments, CI failures and merge conflicts. Otherwise it checks its PR's comments whenever it's resumed and before marking the PR ready. It fixes a CI failure its own change caused, but reports one in something the PR didn't touch, such as a flaky test or the CI setup, on the PR and to you first.

## Rebasing PRs after a merge

A PR has to be up to date with its base to merge, so each merge leaves every other open PR behind. After merging, the maintainer catches them up with the `rebase-prs` Claude Code skill ([`.claude/skills/rebase-prs`](.claude/skills/rebase-prs/SKILL.md)), which sessions run after each merge. Without Claude Code, run its script from the repository root:

```bash
node .claude/skills/rebase-prs/rebase-prs.mts
```

It goes through the open PRs into `dev` and rebases each one that has fallen behind, the same as "Update with rebase" on the PR. Add `main` for PRs into `main`, or `--dry-run` to only print what it would do.

- **Drafts are skipped.** Their author is still pushing to them, and a draft can't merge anyway. Rebase it yourself before marking it ready.
- **PRs from forks and the release PR from `dev` are skipped.** Rebasing the release PR would rewrite `dev`.
- **A PR that conflicts is left unchanged** and gets one comment saying it needs a manual rebase. The comment is edited once the conflict is gone, and a later conflict gets a new one.
- **A PR that's up to date is left alone**, whatever state its checks are in.

It acts as whoever `gh` is signed in as, so the rebased commits and the comments come from that account. A push made with a user's login starts CI, so each rebased PR gets its checks again. A GitHub Actions workflow couldn't do the same without a GitHub App or a token in a secret, because pushes made with a workflow's own `GITHUB_TOKEN` don't start workflows.

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

## Your email address

Everything you push stays public, and a commit on a pull request can't be removed afterwards, even if the pull request closes. That includes the commit's author and committer addresses.

- Commit with your [GitHub noreply address](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/setting-your-commit-email-address).
- Turn on "Keep my email addresses private" and "Block command line pushes that expose my email" in your [email settings](https://github.com/settings/emails) before opening a pull request. GitHub creates some commits for you, such as "Update branch", "Rebase and merge" and the test merge for every open pull request. Without that setting they carry your account's address, whatever your local git settings say.

## Hotfixes

A hotfix is a `hotfix/*` branch into `dev` that doesn't need an issue. It's released like everything else, through `dev`. Only branches in this repository count, because a fork can name a branch anything, so a fix from a fork links an issue.

## Releases

1. Open a PR from `dev` into `main`.
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
