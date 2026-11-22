---
name: pull-requests
description: Steps and gh commands for working a ticket's PR in this repository, from the draft to ready. Use when opening a PR, pushing to or updating one, turning on Auto-fix, answering a review comment, review or PR comment, handling a CI failure or merge conflict on it, rebasing it onto dev, marking it ready, or after the user merges it.
---

# Working a PR

The rules are in the root `CLAUDE.md`, under "Tickets and sessions", "Branches, commits and PRs" and "Merging and releasing". This skill has the steps and commands for following them. Where the two seem to differ, `CLAUDE.md` wins.

## 1. Start

1. Rename the session so its title starts with the ticket number, for example `#85 Deploy to Hetzner Cloud in the EU`.
2. Set the ticket's status label: `gh issue edit <N> --add-label "in progress" --remove-label todo`.
3. Open a draft PR into `dev` as soon as work starts, so the PR list shows what's being worked on. If there's nothing to commit yet, start with an empty commit:

   ```bash
   git commit --allow-empty -m "<N> Start"
   git push -u origin <branch>
   gh pr create --draft --base dev --title "<branch>" --body-file <file>
   ```

   - The title is the branch name, with a colon and a few words when the branch name doesn't explain the PR.
   - The body links the ticket with `Closes #N` from the start, and says what's planned and what's done so far.

## 2. Turn on PR monitoring

Right after opening the PR, turn on PR monitoring if the environment has it. Only the session itself can, so don't wait to be asked.

- In the Claude desktop app it's the PR's Auto-fix switch: the `set_monitor` tool with `auto_fix: true` and `address_comments: true`. It wakes the session on review comments, CI failures and merge conflicts. If the tool is refused, say so.
- Without PR monitoring, check the PR's comments and reviews whenever the session is resumed and before marking the PR ready (section 4 has the commands).
- `gh event listen` is a GitHub preview, so don't rely on it.

## 3. While working

- Push often, at least at every meaningful step, and keep the PR body current.
- Commit subjects are `<N> <subject>`, with no `#`.

## 4. Answering comments

Answer every comment a developer leaves on the PR (a review comment on a line, a review, or a plain PR comment) on GitHub, in that comment's own thread, not only in the session's chat, so the PR shows what was asked and what came of it.

- Questions are answered right away.
- For a requested change, reply once a solution is found. If it changed code, push it and reply with what changed and the commit link. If it didn't, reply with the resolution.
- Answers about code link what they're about: the commit (`https://github.com/<owner>/<repo>/commit/<sha>`) or a permalink with the commit SHA and line (`https://github.com/<owner>/<repo>/blob/<sha>/<path>#L<n>`, or `#L<n>-L<m>` for a range). Never link a branch, which moves. Push the commit before linking it.
- Reply without asking first, then say in the session's chat which comments were answered, linking each reply.

Commands:

- List review comments and their ids: `gh api repos/{owner}/{repo}/pulls/<PR>/comments`.
- Reply to a review comment in its thread: `gh api repos/{owner}/{repo}/pulls/<PR>/comments/<ID>/replies -f body='...'`. `<ID>` is the thread's first comment, because GitHub doesn't take replies to replies, so for a reply use its `in_reply_to_id`.
- Reviews and plain PR comments have no threads: `gh pr view <PR> --comments` shows them, and `gh pr comment <PR> --body '...'` answers them, quoting the comment being answered.

## 5. CI failures

When the session is woken by a CI failure on its PR:

- **The PR's own change caused it:** fix it, as usual.
- **Something the PR didn't touch, such as a flaky test or the CI setup:** report it first, in a PR comment and to the developer, saying which check failed and why it isn't the PR's change. Work on it only once they say so.
- **End-to-end tests fail in any browser on a ready PR:** run `gh pr ready --undo` and add a PR comment saying which browser and test failed and that this is why the PR is now a draft.
- **Dependency check:** a PR into `dev` that changes a `package.json` or `pnpm-lock.yaml` fails if it adds a known vulnerability of high severity or worse. The log and job summary name the package, the advisory and the fixed version. Fix it in the same PR, by updating to the fixed version.
- **Full audit:** a finding on a PR into `main`, or in the issue `audit.yml` opens, is fixed in `dev` first, in its own PR (which closes that issue), never in an unrelated PR. Then the release PR is updated.
- **CodeQL:** a new alert on the PR is fixed in the PR. An alert the PR didn't cause, such as one from a query CodeQL added, is reported first, like other CI failures. Dismiss an alert only with the user's OK, as "false positive" or "won't fix", with the reason in the PR.

`.github/CLAUDE.md` says what CI runs for which changes.

## 6. Rebasing

Keep the branch up to date by rebasing onto `origin/dev`:

```bash
git fetch origin
git rebase origin/dev
git push --force-with-lease
```

PRs land with "Rebase and merge", and merge commits are refused, so never merge `dev` into the branch.

The `rebase-prs` skill rewrites a ready PR's branch on GitHub under its session. When a `git push --force-with-lease` is rejected after that, don't force it: run `git fetch origin`, then `git rebase origin/<branch>` to put the local commits on top of the rebased branch (or `git reset --hard origin/<branch>` if there are none), and push again.

A PR that conflicts gets one comment from `rebase-prs`. Its session then rebases it itself.

## 7. Marking it ready

1. Rebase onto `origin/dev` (section 6).
2. Check that the ticket's definition of done is met, that CI passes, and, without PR monitoring, that every comment is answered.
3. Run `gh pr ready`. Checks that can only run after merging, such as a workflow that only runs from `main`, don't block it: list them in the PR and do them after the merge.

The session's work ends when its PR is ready. If the PR only resolves part of the ticket, move the remaining work to a new ticket before merging: a sub-issue of the ticket if it can't be built on its own, a separate ticket otherwise.

## 8. After the user merges

Only the user merges. Never merge the PR or turn on auto-merge unless the user tells you to for that specific PR.

1. Run the `rebase-prs` skill, so the other ready PRs catch up.
2. Check that the ticket is closed, and close it with `gh issue close <N>` if it isn't, for example when a different PR resolved it or no PR was needed.
