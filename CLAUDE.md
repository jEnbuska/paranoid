# CLAUDE.md

Paranoid is a peer-to-peer, end-to-end encrypted chat. See [README.md](README.md) for how it works.

## Secrets

The repository is public. No secret or token is ever committed, in any file, branch or commit, including tests, fixtures, examples and docs.

- Secrets live only in GitHub environment secrets: a deploy provider's credentials, where it needs any, in that provider's environment, which only `main` may use (see "Deployment" below). Never put a secret in a file, an `.env` file, a workflow input or variable, user data, a label, a job summary or a log.
- Committed `.env` files hold only non-secret defaults. A secret for local use goes in `.env.local`, which git ignores.
- Write placeholders such as `<your-token>` in docs and examples, never a real or realistic-looking value.
- CI's secret scan (gitleaks, with the providers' token rules in `.gitleaks.toml`) runs on every PR and push, docs-only PRs included. GitHub's own secret scanning doesn't know every provider's tokens, such as UpCloud's, so this scan is the backstop. A provider whose token format neither gitleaks' default rules nor GitHub's know gets a rule in `.gitleaks.toml`. Test it only with a fake token in a file git doesn't track, and delete the file afterwards. Never commit or push one.
- Sessions never ask for, read or handle a real token. The user adds it as an environment secret.

## Monorepo

pnpm workspace (`pnpm-workspace.yaml`) with five packages: `packages/client-app` (React + Vite), `packages/signaling-server` (socket.io, run by Node.js directly from TypeScript), `packages/shared-lib` (shared utils and socket event types, imported as source as `shared-lib/...`), `packages/deploy` (the deploy workflows' worst-case cost check and its CLI, run by Node.js directly from TypeScript, with each provider's price file in `deploy/<provider>/prices.json`) and `packages/e2e` (Playwright tests).

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
- Don't install anything else yourself, such as Playwright browsers, system packages or command-line tools. Ask the user to install it, and say what is needed and why. `pnpm install --frozen-lockfile` is the exception.

## Commands (from the root)

- `pnpm dev`: signaling server (port 8181) and Vite (port 5173) in parallel (`pnpm -r --parallel`; Ctrl+C stops both).
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`: all workspaces. `pnpm test` is unit tests only.
- `pnpm test:e2e`: Playwright tests, on their own ports. Install browsers first: `pnpm --filter e2e exec playwright install chromium firefox webkit`.
- `pnpm format` / `pnpm format:check`: oxfmt over the whole repo.
- `pnpm knip`: unused files, exports and dependencies in every workspace. After knip's own table, `scripts/knip-explain.mts` explains each finding and how to fix it.
- One package: `pnpm --filter <package> <script>`.

Before finishing a change, run `pnpm typecheck`, `pnpm lint`, `pnpm knip`, `pnpm format:check` and `pnpm test`, and `pnpm build` and `pnpm test:e2e` for client or signaling changes.

## CI and pull requests

- CI (`.github/workflows/ci.yml`) runs `pnpm lint`, `pnpm knip`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` and `pnpm build`, and `pnpm test:e2e` as a separate job, one per browser (Chromium, Firefox and WebKit). Pushes to `main` and `dev` run everything, and so does a manual run (`workflow_dispatch`), which the Release workflow uses to start CI on `main`. On a PR, a `changes` job decides from the changed files what runs, and a PR with no changed files skips both jobs. Run `pnpm format:check` locally too, or `pnpm format` to fix it.
  - Docs (`**/*.md`, `LICENSE`) run no checks and no end-to-end tests, except the format check for Markdown, because oxfmt formats it.
  - Every PR with changed files, docs included, and every push runs the secret scan (gitleaks) over the commits it adds, in the checks job, so no new required check is needed.
  - A PR into `dev` that changes a `package.json` or `pnpm-lock.yaml` runs a dependency check, a step in the checks job: `pnpm audit` on the PR and on its base, failing only on a known vulnerability of high severity or worse that the PR adds, with the package, advisory and fixed version in the log and job summary (`scripts/audit-report.mts`). Fix it in the same PR, by updating to the fixed version. GitHub's dependency review can't read pnpm 12's two-document lockfile, so it isn't used.
  - The full audit is required before merging into `main`: every PR into `main` and every push to it runs `pnpm audit --audit-level=high` over the whole tree in that same step, whatever files changed, and a finding fails the required checks job and blocks the release. Fix a finding in `dev` first, in its own PR, then update the release PR.
  - `audit.yml` audits the whole tree weekly, and from `workflow_dispatch`, because a new advisory can appear for a dependency nobody touched. A finding opens one issue labeled `bug` and `todo`, or updates the open one, and never fails a PR. Fix it in its own PR that closes that issue, never in an unrelated PR.
  - The end-to-end tests run for changes under `packages/` (except docs) and to the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `.nvmrc`. Every other change runs only the checks.
  - A change to `ci.yml` runs everything.
  - The end-to-end job runs in Playwright's container image (`mcr.microsoft.com/playwright`), which has the browsers and their system packages, so nothing in CI runs `apt`, which hangs when Ubuntu's mirror is unreachable. The image is pinned by digest, with its tag in a comment. It must be the same version as `@playwright/test` in `pnpm-lock.yaml`, and the job's "Check the image's browsers" step fails if it isn't, so updating Playwright means updating the image in the same PR.
  - Skip a matrix job's steps, never the job: a skipped matrix job reports one check under its unexpanded name, `End-to-end tests (${{ matrix.browser }})`, so the required `End-to-end tests (chromium)`, `(firefox)` and `(webkit)` would wait forever. A non-matrix job can skip with `if:`, which counts as passing.
- The rules for branches, PRs and releases are in [CONTRIBUTING.md](CONTRIBUTING.md). PRs go into `dev`, except a release PR from `dev` into `main`. Sessions never release unless the user tells them to for that specific PR.
- Branch names start with the ticket number: `<TICKET_NUMBER>-<name>`, for example `2-peers-stuck-connecting`. `hotfix/*` branches have no ticket and keep that name.
- Sessions commit and push without asking first.
- Keep PR branches up to date by rebasing onto `origin/dev` and pushing with `--force-with-lease`. PRs land with "Rebase and merge", and merge commits are refused.
- The `rebase-prs` skill (`.claude/skills/rebase-prs`) rebases every ready PR into `dev` that has fallen behind, unless it conflicts, as the signed-in `gh` user, so CI runs on the new heads. After the user merges a PR, the session that made it runs the skill. Drafts are left alone, and a PR that conflicts gets one comment, after which its session rebases it itself.
- A rebase like that rewrites a PR branch on GitHub under its session. When a `git push --force-with-lease` is rejected after one, don't force it: run `git fetch origin`, then `git rebase origin/<branch>` to put the local commits on top of the rebased branch (or `git reset --hard origin/<branch>` if there are none), and push again.
- A new CI job has to be added as a required check in the `main` and `dev` rulesets.
- Every PR into `dev` must link an open issue with `Closes #N`, `Fixes #N` or `Resolves #N`, unless it comes from a `hotfix/*` branch; the `PR rules` check fails otherwise. Linked issues get a `PR Opened` label and close when the PR merges into `dev`, the default branch.
- If CI's end-to-end tests fail in any browser on a ready PR, run `gh pr ready --undo` and add a PR comment saying which browser and test failed and that this is why the PR is now a draft.
- Every open issue has a status label: `todo` when it isn't started (add it when creating the issue) and `in progress` from the moment work starts, including work delegated to a session or subagent. Swap them with `gh issue edit <N> --add-label "in progress" --remove-label todo`. `remove-status-labels.yml` removes both automatically when an issue closes.
- A ticket split into pieces that can't really be built on their own, because they depend on each other or only make sense together, gets those pieces as sub-issues (GitHub sub-issues). Work that can be built on its own becomes a separate ticket, not a sub-issue. Create a sub-issue with `gh issue create --parent <N>`, or add an existing issue with `gh issue edit <N> --add-sub-issue <CHILD>`. A `gh` without those flags uses the REST endpoint, which takes the child's issue id, not its number: `gh api repos/{owner}/{repo}/issues/<N>/sub_issues -F sub_issue_id="$(gh api repos/{owner}/{repo}/issues/<CHILD> --jq .id)"` (`-F` sends the id as a number).
- The Planning session (the one that writes tickets) starts ticket sessions. A ticket session may start a session only for a sub-issue of its own ticket, which nests under it and gets its own worktree on its own branch. For any other work, even work it finds along the way, it writes a ticket or tells the Planning session, and never starts a session for it.
- A session's work ends when its PR is ready. Link the ticket with `Closes #N` so that merging closes it. If a PR only resolves part of a ticket, move the remaining work to a new ticket before merging: a sub-issue of the ticket if it can't be built on its own, a separate ticket otherwise. After the user merges, check that the ticket is closed, and close it with `gh issue close` if it isn't, for example when a different PR resolved it or no PR was needed.
- Open a draft PR as soon as work on a ticket starts, so the PR list shows what's being worked on. If there's nothing to commit yet, start with `git commit --allow-empty`. The body links the ticket from the start and says what's planned and what's done so far. Push often, at least at every meaningful step, and keep the body current. Run `gh pr ready` only when the ticket's definition of done is met and CI passes. Checks that can only run after merging, such as a workflow that only runs from `main`, don't block it: list them in the PR and do them after the merge.
- A session answers every comment a developer leaves on its PR (a review comment on a line, a review, or a plain PR comment) on GitHub, in that comment's own thread, not only in the session's chat, so the PR shows what was asked and what came of it.
  - Answers about code link what they're about: the commit (`https://github.com/<owner>/<repo>/commit/<sha>`) or a permalink with the commit SHA and line (`https://github.com/<owner>/<repo>/blob/<sha>/<path>#L<n>`, or `#L<n>-L<m>` for a range). Never link a branch, which moves. Push the commit before linking it.
  - Questions are answered right away.
  - For a requested change, reply once a solution is found. If it changed code, push it and reply with what changed and the commit link. If it didn't, reply with the resolution.
  - Sessions reply without asking first, then say in their chat which comments they answered, linking each reply.
  - Getting told about comments: right after opening its PR, a session turns on PR monitoring if its environment has it. In the Claude desktop app that's the PR's Auto-fix switch (the `set_monitor` tool with `auto_fix: true` and `address_comments: true`), which wakes the session on review comments, CI failures and merge conflicts. Only the session itself can turn it on, so it doesn't wait to be asked. Without PR monitoring, the session checks its PR's comments and reviews whenever it's resumed and before marking the PR ready. `gh event listen` is a GitHub preview, so don't rely on it.
- When a session is woken by a CI failure on its PR, it fixes a failure that the PR's own change caused, as usual. A failure in something the PR didn't touch, such as a flaky test or the CI setup, it reports first, in a PR comment and to the developer, saying which check failed and why it isn't the PR's change, and it works on that only once they say so.
  - Reply to a review comment in its thread with `gh api repos/{owner}/{repo}/pulls/<PR>/comments/<ID>/replies -f body='...'`. `<ID>` is the thread's first comment, because GitHub doesn't take replies to replies, so for a reply use its `in_reply_to_id`. List review comments and their ids with `gh api repos/{owner}/{repo}/pulls/<PR>/comments`. Reviews and plain PR comments have no threads, so answer them with `gh pr comment <PR> --body '...'`, quoting the comment being answered. `gh pr view <PR> --comments` shows them.
- A PR's title is its branch name, for example `97-dependency-audit`, so the PR list matches the branch list. When the branch name doesn't explain the PR, add a colon and a few words: `85-deploy-hetzner: Hetzner Cloud in the EU`. Hotfix PRs use their `hotfix/<name>` branch the same way. The release PR from `dev` into `main` has no branch of its own, so it's titled `Release <date>`.
- Session titles start with the ticket number, for example `#85 Deploy to Hetzner Cloud in the EU`, because that's what the sidebar shows. A session working on a ticket with a different title renames itself when it starts.
- Only the user merges. A session never merges a PR or turns on auto-merge unless the user tells it to for that specific PR, and approval for one PR doesn't carry over to another. Sessions use the user's GitHub login, so GitHub can't enforce this for them.
- Sessions never run the Release workflow (`release.yml`), the same as never merging: releasing is the user's, from Actions → Release. A session may start a `dry_run` run, which pushes nothing, only when the user asks for one.
- Workflows declare top-level `permissions: contents: read` and grant write scopes only on the job that needs them. Pass PR data (body, title, branch names) to scripts through `env:`, never as `${{ }}` inside `run:`. Pin actions to a commit SHA with the version in a comment.

## Tooling

- Node.js 24 (`.nvmrc`, `engines` in `package.json`). The signaling server runs with `node src/server.ts` / `node --watch`, and the deploy workflows run `node packages/deploy/src/cli.ts`, using Node's built-in type stripping. There is no tsx, ts-node or build step; don't add one. Type errors only show up in `pnpm typecheck`.
- Code Node runs (the server, `shared-lib` and `packages/deploy`) must be plain type-strippable TypeScript, which `tsc` enforces with `erasableSyntaxOnly` and `verbatimModuleSyntax`:
  - Relative imports need the `.ts` extension: `import { x } from "./invites.ts"`.
  - Type-only imports use `import type`.
  - No enums, namespaces or constructor parameter properties.
  - `shared-lib` files are imported as `shared-lib/types` and `shared-lib/utils/<name>` (no extension), mapped by `exports` in its `package.json`. Add new shared files under `utils/` to keep them reachable.
- TypeScript 7 is the native `tsgo` compiler, run as `tsc`, used only for type checking. Tools that need the JavaScript TypeScript API (typescript-eslint and similar) don't work with it.
- Linting is oxlint: base rules in `.oxlintrc.json`, React rules in `packages/client-app/.oxlintrc.json`, which extends it. Unused names starting with `_` are allowed.
- Formatting is oxfmt (`.oxfmtrc.json`, 80 columns). There is no Prettier or ESLint.
- Dead code is found by knip (`knip.json`), which parses with oxc and works with TypeScript 7. Its Vite, Vitest and Playwright plugins find the entry points. Delete what it reports rather than ignoring it, and give any ignore in `knip.json` a comment saying why. It doesn't parse CSS, so a package imported only from CSS is ignored there.

## Signaling server

- Keep it thin: Node.js built-ins plus socket.io. No web framework, middleware or dotenv; its only job is holding invites in memory and relaying encrypted payloads.
- The server forgets an invite once the peers have connected. It never keeps peers paired, stores reconnect state or relays anything after the chat starts, so there is no ICE restart through the server. A connection that fails for good ends the chat, and recovery is a new invite. This is for privacy: a running chat shouldn't tell the server who is talking to whom.
- Configuration comes from environment variables (`PORT`, `HOST`, `CORS_ORIGINS`, `MAX_INVITES`), loaded from `packages/signaling-server/.env` and then `.env.local` with Node's `--env-file-if-exists`. Document new variables in `.env` and the README configuration table.
- Never log event payloads, even encrypted ones. Log startup, shutdown, connections, disconnections and errors only.
- socket.io's `cors` option is the only CORS handling. The client sends no cookies, so don't enable `credentials`.

## Deployment

Anyone with a fork can start a Paranoid server from GitHub Actions. Each provider has its own guide in `docs/deploy/<provider>.md`, listed in the README's "Deploy your own", its own workflows named after it (for example `deploy-<provider>.yml`), its own GitHub environment, and its own scripts in `deploy/<provider>`.

- `deploy/server` (cloud-init, `setup.sh`, systemd units, Caddyfile) is provider-neutral: no cloud provider's API, metadata or CLI. `deploy/ci` holds provider-neutral scripts the workflows run. A new provider gets its own scripts and workflows and reuses `deploy/server` and `deploy/ci`.
- A provider that needs `PARANOID_HOST` (a server behind NAT that only sees a private address) checks it before filling it into `cloud-init.yaml`, and every provider adds it to its `envsubst` list, empty if unused.
- `packages/deploy` holds the worst-case cost check. A deploy workflow that uses it runs it with its provider's price file, `deploy/<provider>/prices.json`, before it creates anything.
- A provider's credentials reach only the steps that need them, through `env:`. Never put them in a file, an input, a variable, user data, a label or a summary, and never echo them. The server never gets them.
- Deploy workflows run only on `workflow_dispatch` and `schedule`, never `pull_request` or `pull_request_target`, and use their provider's environment, which only `main` may use.
- User data and labels hold only values the scripts have checked, so an input can't inject commands.
- Pin every download (provider CLIs, Node.js, Caddy, gitleaks) to a version and check its checksum. Update the version and checksum together.
- `shellcheck` checks `deploy/**/*.sh` and `scripts/*.sh` in CI. Keep the deploy scripts there.

## End-to-end tests

- Playwright in `packages/e2e`. `webServer` builds the client into `packages/e2e/dist` and starts it and the signaling server on ports 8193 and 5193 (`E2E_SIGNALING_PORT`, `E2E_CLIENT_PORT`), or uses an app that already runs (`E2E_BASE_URL`).
- Use roles and labels (`getByRole`, `getByLabel`), and wait on outcomes rather than fixed sleeps. No retries: fix a flaky test instead of hiding it.
- Tests must not reach anything outside the machine. Use the `openPeer` fixture from `tests/fixtures.ts`: it removes the app's STUN servers from peer connections and fails a test that requests an external URL.
- Tag tests that need two peers to connect with `WEBRTC` from `tests/helpers.ts`. They run in every browser. WebKit offers only mDNS host candidates (`<uuid>.local`), which don't resolve under Playwright and which no WebKit setting turns off, so `openPeer` rewrites them to `127.0.0.1` in the descriptions and candidates a page receives.
- `tests/browser-pairs.spec.ts` connects two people in different browsers, in every ordered pair. `openPeer({ browser })` opens a person in another browser, launched with the settings in `tests/browsers.ts`, which the projects in `playwright.config.ts` use too: change a browser's device or launch settings there. Each pair runs only in its inviter's project and the others skip it, so CI's per-browser jobs run each pair once.
- Don't run a flakiness check before a PR into `dev` merges. CI's end-to-end jobs in every browser are the check there. Run one only when looking for a test that fails only sometimes, or when the user asks: `pnpm test:e2e --project=<browser> --repeat-each=20` in each browser, both with the default workers and under load with `--workers=100%` (one per core; more swamps the machine in Firefox and WebKit). Every run must pass, apart from failures with an open `bug` issue. Other sessions run end-to-end tests on this machine too, so use your own `E2E_SIGNALING_PORT` and `E2E_CLIENT_PORT` (for example 8293 and 5293), and record whether another run overlapped. See "Checking for flakiness" in the README.
- A test exposing an app bug gets `test.fixme`, a comment and a linked issue labeled `bug` and `todo`. Don't change app behavior to make a test pass.

## Client UI

No component library and no theme. The UI keeps the browser's default look, with a short list of deliberate exceptions, all in `src/index.css`: the neutral `accent-color`, the body's line height, button styling, the disabled look, the invalid-field bar and control sizes.

- Use native HTML elements wherever one fits, and only then write JavaScript: `<dialog>`, `popover`, `@starting-style`, `<fieldset>`/`<legend>`, `<progress>`, `<output>`, `<hr>`. Keep their native styling, apart from those exceptions. The small components in `packages/client-app/src/components` wrap these elements.
- `src/index.css` loads [`modern-normalize`](https://github.com/sindresorhus/modern-normalize) first. It evens out browser differences without removing default styles. Don't add a reset. It and the app's base element styles sit in the cascade layers `normalize` and `base`, so a component's CSS module always overrides them whatever the specificity. Put new element-level defaults inside `@layer base`.
- Colors follow the OS light or dark setting through `color-scheme: light dark`. Use system colors (`Canvas`, `CanvasText`, `GrayText`) only where a native element doesn't already provide the color. Don't define a palette. The UI is neutral, with no hue: `accent-color` is `CanvasText`, so don't use `AccentColor`.
- Button styling: Chrome's native dark buttons look disabled, so `index.css` outlines every `<button>` in `CanvasText` and fills submit buttons with `CanvasText` (text in `Canvas`). No accent color. Disabled controls (buttons, inputs, textareas) share one look: transparent, `GrayText` and a dashed border. Invalid fields (`aria-invalid="true"`) get a striped bar along their bottom edge.
- CSS modules (`styles.module.css` next to the component) only hold CSS that does a job: layout and spacing, positioning (toast) and the dialog transitions. No shadows, uppercase or custom button variants, and keep focus outlines visible.
- Font sizes are relative (`rem`/`em`), never `px`. Text is at least `1rem` (16px at the browser default, and it follows the user's font-size setting). Only `<small>` is smaller.
- Sizes are the same on every device: no media queries that change font sizes, control sizes, padding or spacing for mobile or desktop. Buttons, inputs and textareas are at least `2.75rem` tall (44px at the default font size), so they work as touch targets everywhere.
- Icons are inline SVG components in `src/components/Icon/icons.tsx`.
- Every generic component in `src/components` has a page in the playground at `/playground/<page>` showing its variants (`src/playground/pages`, listed in `pages/index.ts`). The playground route exists only in development (`import.meta.env.DEV` in `app.tsx`) and is loaded lazily, so it's not in the production build. Add a page when you add a component.

Import routing from `react-router`, not `react-router-dom`.
