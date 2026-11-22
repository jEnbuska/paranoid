# CLAUDE.md

Paranoid is a peer-to-peer, end-to-end encrypted chat. See [README.md](README.md) for how it works.

The signaling server forgets an invite once the peers have connected. It never keeps peers paired, stores reconnect state or relays anything after the chat starts, so there is no ICE restart through the server. A connection that fails for good ends the chat, and recovery is a new invite. This is for privacy: a running chat shouldn't tell the server who is talking to whom.

## Where the rules are

This file holds the rules that apply whatever the task. Each area's own rules are in a `CLAUDE.md` in its folder, which Claude Code loads once it reads, writes or edits a file there:

- [`packages/client-app/CLAUDE.md`](packages/client-app/CLAUDE.md): the client UI.
- [`packages/signaling-server/CLAUDE.md`](packages/signaling-server/CLAUDE.md): the signaling server.
- [`packages/shared-lib/CLAUDE.md`](packages/shared-lib/CLAUDE.md): shared code.
- [`packages/e2e/CLAUDE.md`](packages/e2e/CLAUDE.md): end-to-end tests.
- [`.github/CLAUDE.md`](.github/CLAUDE.md): CI, workflows and actions.
- [`deploy/CLAUDE.md`](deploy/CLAUDE.md): deployment. Its rules also cover the deploy workflows, `.github/actions/deploy-preflight`, `docs/deploy/` and `packages/deploy`, so read it before changing any of them.

Before opening, updating, rebasing or marking ready a PR, or answering its comments or CI failures, use the `pull-requests` skill (`.claude/skills/pull-requests`). It has the steps and commands; the rules it follows are all in this file.

## Secrets

The repository is public. No secret or token is ever committed, in any file, branch or commit, including tests, fixtures, examples and docs.

- Secrets live only in GitHub environment secrets: a deploy provider's credentials, where it needs any, in that provider's environment, which only `main` may use (see `deploy/CLAUDE.md`). Never put a secret in a file, an `.env` file, a workflow input or variable, user data, a label, a job summary or a log.
- Committed `.env` files hold only non-secret defaults. A secret for local use goes in `.env.local`, which git ignores.
- Write placeholders such as `<your-token>` in docs and examples, never a real or realistic-looking value.
- CI's secret scan (gitleaks, with the providers' token rules in `.gitleaks.toml`) runs on every PR and push, docs-only PRs included. GitHub's own secret scanning doesn't know every provider's tokens, such as UpCloud's, so this scan is the backstop. A provider whose token format neither gitleaks' default rules nor GitHub's know gets a rule in `.gitleaks.toml`. Test it only with a fake token in a file git doesn't track, and delete the file afterwards. Never commit or push one.
- Sessions never ask for, read or handle a real token. The user adds it as an environment secret.

## Security vulnerabilities

Vulnerabilities are reported privately, through the repository's "Report a vulnerability" form on the Security tab (private vulnerability reporting). A report becomes a draft security advisory that only the maintainer and the people they add can see. CONTRIBUTING.md's "Reporting a security vulnerability" section is the reporter's side.

- Never discuss a private report, its details or its fix in public before the advisory is published: no issue, ticket, PR, commit message, PR or issue comment, branch name, label or workflow log. That includes the Planning session's tickets. The advisory is the ticket.
- A session that finds a vulnerability itself treats it the same way: it tells the user in its chat, writes nothing about it on GitHub, and the user decides whether to open a draft advisory.
- The fix is made in the advisory's temporary private fork, which GitHub creates for it ("Start a temporary private fork" on the advisory), or only once the user says how. Never in a branch or PR of this repository.
- GitHub Actions don't run in a temporary private fork, so run the checks from "Commands" locally there, end-to-end tests included.
- Commits merged from the fork become public in `dev`, so their messages say what changed in code, not what it exposed. The advisory carries the details.
- The user merges the fix, publishes the advisory and decides when. Sessions never publish, close or change an advisory's severity, and never request a CVE.

## Monorepo

pnpm workspace (`pnpm-workspace.yaml`) with five packages: `packages/client-app` (React + Vite), `packages/signaling-server` (socket.io, run by Node.js directly from TypeScript), `packages/shared-lib` (shared utils and socket event types, imported as source as `shared-lib/...`), `packages/deploy` (the deploy workflows' worst-case cost check and preflight, and their CLIs, run by Node.js directly from TypeScript, with each provider's price file and requirements in `deploy/<provider>/prices.json` and `requirements.json`) and `packages/e2e` (Playwright tests).

## Installing dependencies

- The package manager is pnpm (version pinned in the root `package.json` `packageManager`). Never use npm or yarn, and don't create `package-lock.json` or `yarn.lock`.
- Always run pnpm from the repository root, never inside a package directory.
- Always install with `pnpm install --frozen-lockfile`. It installs all packages at once, exactly as the lockfile says, and fails if the lockfile and `package.json` files disagree. Plain `pnpm install` would quietly rewrite the lockfile instead. The root `pnpm-lock.yaml` is the only lockfile; it records every package's own dependencies.
- One package only: `pnpm install --frozen-lockfile --filter <package>` (root tooling is included).
- The lockfile changes only through commands that change dependencies: `pnpm add`, `pnpm remove` and `pnpm update`, or plain `pnpm install` right after editing a `package.json` by hand.
- Add or remove a package's dependency from the root: `pnpm add <dep> --filter <package>`, `pnpm remove <dep> --filter <package>`. Commit the updated `package.json` and `pnpm-lock.yaml` together.
- Shared tooling (TypeScript 7, oxlint, oxfmt, knip) is a root dev dependency: `pnpm add -D -w <tool>` (`-w` is the workspace root, not a package). Don't add these to a package.
- Workspace packages depend on each other with `"workspace:*"` (for example `"shared-lib": "workspace:*"`).
- pnpm is strict: a package can only import what its own `package.json` declares. If an import fails to resolve, add the dependency to that package instead of relying on another package's.
- Dependency install scripts only run when allowed under `allowBuilds` in `pnpm-workspace.yaml`. On `ERR_PNPM_IGNORED_BUILDS`, ask before running `pnpm approve-builds <package>`.
- Updating `@playwright/test` means updating CI's Playwright image in the same PR (see `.github/CLAUDE.md`).
- Don't install anything else yourself, such as Playwright browsers, system packages or command-line tools. Ask the user to install it, and say what is needed and why. `pnpm install --frozen-lockfile` is the exception.

## Commands (from the root)

- `pnpm dev`: signaling server (port 8181) and Vite (port 5173) in parallel (`pnpm -r --parallel`; Ctrl+C stops both).
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`: all workspaces. `pnpm test` is unit tests only, including the root scripts' `scripts/*.test.mts`, run with Node's test runner.
- `pnpm test:e2e`: Playwright tests, on their own ports. Install browsers first: `pnpm --filter e2e exec playwright install chromium firefox webkit`.
- `pnpm format` / `pnpm format:check`: oxfmt over the whole repo.
- `pnpm knip`: unused files, exports and dependencies in every workspace. After knip's own table, `scripts/knip-explain.mts` explains each finding and how to fix it.
- `pnpm check:deploy-docs`: checks that `docs/deploy/` lists what the deploy workflows use (see `deploy/CLAUDE.md`).
- One package: `pnpm --filter <package> <script>`.

Before finishing a change, run `pnpm typecheck`, `pnpm lint`, `pnpm knip`, `pnpm format:check` (or `pnpm format` to fix it) and `pnpm test`, `pnpm build` and `pnpm test:e2e` for client or signaling changes, and `pnpm check:deploy-docs` for deploy workflow or `docs/deploy/` changes. CI runs these too (see `.github/CLAUDE.md`).

## Tooling

- Node.js 24 (`.nvmrc`, `engines` in `package.json`). The signaling server runs with `node src/server.ts` / `node --watch`, and the deploy workflows run `node packages/deploy/src/cli.ts` and `preflight-cli.ts`, using Node's built-in type stripping. There is no tsx, ts-node or build step; don't add one. Type errors only show up in `pnpm typecheck`.
- Code Node runs (the server, `shared-lib` and `packages/deploy`) must be plain type-strippable TypeScript, which `tsc` enforces with `erasableSyntaxOnly` and `verbatimModuleSyntax`:
  - Relative imports need the `.ts` extension: `import { x } from "./invites.ts"`.
  - Type-only imports use `import type`.
  - No enums, namespaces or constructor parameter properties.
  - `shared-lib` files are imported as `shared-lib/types` and `shared-lib/utils/<name>` (no extension). How they're mapped is in `packages/shared-lib/CLAUDE.md`.
- TypeScript 7 is the native `tsgo` compiler, run as `tsc`, used only for type checking. Tools that need the JavaScript TypeScript API (typescript-eslint and similar) don't work with it.
- Linting is oxlint: base rules in `.oxlintrc.json`, React rules in `packages/client-app/.oxlintrc.json`, which extends it. Unused names starting with `_` are allowed.
- Formatting is oxfmt (`.oxfmtrc.json`, 80 columns). There is no Prettier or ESLint.
- Dead code is found by knip (`knip.json`), which parses with oxc and works with TypeScript 7. Its Vite, Vitest and Playwright plugins find the entry points. Delete what it reports rather than ignoring it, and give any ignore in `knip.json` a comment saying why. It doesn't parse CSS, so a package imported only from CSS is ignored there.

## Tickets and sessions

- Every open issue has a status label: `todo` when it isn't started (add it when creating the issue) and `in progress` from the moment work starts, including work delegated to a session or subagent. Swap them with `gh issue edit <N> --add-label "in progress" --remove-label todo`. `remove-status-labels.yml` removes both automatically when an issue closes.
- Split a ticket as CONTRIBUTING.md's "Opening a pull request" says: pieces that can't really be built on their own become sub-issues, and work that can becomes a separate ticket. A `gh` without `--parent` and `--add-sub-issue` uses the REST endpoint, which takes the child's issue id, not its number: `gh api repos/{owner}/{repo}/issues/<N>/sub_issues -F sub_issue_id="$(gh api repos/{owner}/{repo}/issues/<CHILD> --jq .id)"` (`-F` sends the id as a number).
- The Planning session (the one that writes tickets) starts ticket sessions. A ticket session may start a session only for a sub-issue of its own ticket, which nests under it and gets its own worktree on its own branch. For any other work, even work it finds along the way, it writes a ticket or tells the Planning session, and never starts a session for it.
- Session titles start with the ticket number, for example `#85 Deploy to Hetzner Cloud in the EU`, because that's what the sidebar shows. A session working on a ticket with a different title renames itself when it starts.

## Branches, commits and PRs

[CONTRIBUTING.md](CONTRIBUTING.md) has the rules for branches, PRs and releases, and the reasons for those below. PRs go into `dev`, except a release PR from `dev` into `main`.

- Branch names are `<TICKET_NUMBER>-<name>`, for example `2-peers-stuck-connecting`. `hotfix/*` branches have no ticket and keep that name.
- Commit subjects are `<N> <subject>`, with no `#`, for example `99 Start commit messages with the ticket number`. `hotfix/*` commits have no ticket number, and Dependabot's start with `Dependabot:` (`commit-message.prefix` in `.github/dependabot.yml`). Older commits keep their `#N` subjects and aren't rewritten.
- Sessions commit and push without asking first.
- A PR's title is its branch name, with a colon and a few words when the name doesn't explain the PR: `85-deploy-hetzner: Hetzner Cloud in the EU`. Hotfix PRs use their `hotfix/<name>` branch the same way. Dependabot titles its own PRs. The release PR from `dev` into `main` is titled `Release <date>`.
- Every PR into `dev` links an open issue with `Closes #N`, `Fixes #N` or `Resolves #N`, unless it's a hotfix or Dependabot PR as CONTRIBUTING.md defines them; the `PR rules` check fails otherwise. Linked issues get a `PR Opened` label and close when the PR merges into `dev`, the default branch.
- Open a draft PR as soon as work on a ticket starts, with an empty commit if there's nothing to commit yet, linking the ticket and saying what's planned and what's done. Push often, at least at every meaningful step, and keep the body current.
- Right after opening its PR, a session turns on PR monitoring if its environment has it (in the Claude desktop app, the PR's Auto-fix switch), without waiting to be asked. Without it, the session checks its PR's comments and reviews whenever it's resumed and before marking the PR ready.
- A session answers every comment a developer leaves on its PR (a review comment on a line, a review, or a plain PR comment) on GitHub, in that comment's own thread, without asking first: questions right away, a requested change once it's solved. Answers about code link a pushed commit or a permalink with its SHA, never a branch. Then it lists its replies in its chat, with links.
- A session fixes a CI failure its PR's change caused. One in something the PR didn't touch, such as a flaky test or the CI setup, it reports first, in a PR comment and to the developer, saying which check failed and why it isn't the PR's change, and works on it only once they say so.
- If CI's end-to-end tests fail in any browser on a ready PR, the session moves it back to draft (`gh pr ready --undo`) with a comment saying which browser and test failed and that this is why it's a draft.
- A PR into `dev` that adds a known vulnerability of high severity or worse fixes it itself, by updating to the fixed version. A finding from the full audit before `main`, or `audit.yml`'s issue, is fixed in `dev` first, in its own PR (closing that issue), never in an unrelated one, and then the release PR is updated.
- A new CodeQL alert on a PR is fixed in that PR. One the PR didn't cause is reported first, like other CI failures. Dismiss an alert only with the user's OK, as "false positive" or "won't fix", with the reason in the PR.
- Keep PR branches up to date by rebasing onto `origin/dev` and pushing with `--force-with-lease`, never forcing a push that was rejected. PRs land with "Rebase and merge", and merge commits are refused.
- Run `gh pr ready` only when the ticket's definition of done is met and CI passes. Checks that can only run after merging don't block it: list them in the PR and do them after the merge. A session's work ends when its PR is ready. Work a PR leaves undone moves to a sub-issue or a separate ticket before it merges.
- After the user merges a PR, the session that made it runs the `rebase-prs` skill and checks that the ticket closed (`gh issue close` if not). A session rebases its own PR when `rebase-prs` reports a conflict on it. Nobody else rebases a Dependabot PR: comment `@dependabot rebase`.

## Merging and releasing

- Only the user merges. A session never merges a PR or turns on auto-merge unless the user tells it to for that specific PR, and approval for one PR doesn't carry over to another. Sessions use the user's GitHub login, so GitHub can't enforce this for them.
- Sessions never release unless the user tells them to for that specific PR. They never run the Release workflow (`release.yml`), the same as never merging: releasing is the user's, from Actions → Release. A session may start a `dry_run` run, which pushes nothing, only when the user asks for one.
