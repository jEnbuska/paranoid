# CLAUDE.md

Paranoid is a peer-to-peer, end-to-end encrypted chat. See [README.md](README.md) for how it works.

## Monorepo

pnpm workspace (`pnpm-workspace.yaml`) with four packages: `packages/client-app` (React + Vite), `packages/signaling-server` (socket.io, run by Node.js directly from TypeScript), `packages/shared-lib` (shared utils and socket event types, imported as source as `shared-lib/...`) and `packages/e2e` (Playwright tests).

## Installing dependencies

- The package manager is pnpm (version pinned in the root `package.json` `packageManager`). Never use npm or yarn, and don't create `package-lock.json` or `yarn.lock`.
- Always run pnpm from the repository root, never inside a package directory.
- `pnpm install` installs all packages at once. The root `pnpm-lock.yaml` is the only lockfile; it records every package's own dependencies.
- `pnpm install --frozen-lockfile` installs exactly what the lockfile says and fails if the lockfile and `package.json` files disagree. Use it when `node_modules` looks stale or broken.
- One package only: `pnpm install --frozen-lockfile --filter <package>` (root tooling is included).
- Add or remove a package's dependency from the root: `pnpm add <dep> --filter <package>`, `pnpm remove <dep> --filter <package>`. Commit the updated `package.json` and `pnpm-lock.yaml` together.
- Shared tooling (TypeScript 7, oxlint, oxfmt, knip) is a root dev dependency: `pnpm add -D -w <tool>` (`-w` is the workspace root, not a package). Don't add these to a package.
- Workspace packages depend on each other with `"workspace:*"` (for example `"shared-lib": "workspace:*"`).
- pnpm is strict: a package can only import what its own `package.json` declares. If an import fails to resolve, add the dependency to that package instead of relying on another package's.
- Dependency install scripts only run when allowed under `allowBuilds` in `pnpm-workspace.yaml`. On `ERR_PNPM_IGNORED_BUILDS`, ask before running `pnpm approve-builds <package>`.
- Don't install anything else yourself, such as Playwright browsers, system packages or command-line tools. Ask the user to install it, and say what is needed and why. `pnpm install` from the lockfile is the exception.

## Commands (from the root)

- `pnpm dev`: signaling server (port 8181) and Vite (port 5173) in parallel (`pnpm -r --parallel`; Ctrl+C stops both).
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`: all workspaces. `pnpm test` is unit tests only.
- `pnpm test:e2e`: Playwright tests, on their own ports. Install browsers first: `pnpm --filter e2e exec playwright install chromium firefox webkit`.
- `pnpm format` / `pnpm format:check`: oxfmt over the whole repo.
- `pnpm knip`: unused files, exports and dependencies in every workspace.
- One package: `pnpm --filter <package> <script>`.

Before finishing a change, run `pnpm typecheck`, `pnpm lint`, `pnpm knip`, `pnpm format:check` and `pnpm test`, and `pnpm build` and `pnpm test:e2e` for client or signaling changes.

## CI and pull requests

- CI (`.github/workflows/ci.yml`) runs `pnpm lint`, `pnpm knip`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` and `pnpm build`, and `pnpm test:e2e` as a separate job (Chromium, plus Firefox and WebKit on PRs into `main`), on every PR with changed files (a PR with none skips both jobs) and on pushes to `main` and `dev`. Run `pnpm format:check` locally too, or `pnpm format` to fix it.
- The rules for branches, PRs and releases are in [CONTRIBUTING.md](CONTRIBUTING.md). PRs go into `dev`, except a release PR from `dev` into `main`. Sessions never release unless the user tells them to for that specific PR.
- Branch names start with the ticket number: `#<TICKET_NUMBER>-<name>`, for example `#2-peers-stuck-connecting`. Quote the name in a shell (`git switch -c '#2-peers-stuck-connecting'`), because an unquoted `#` starts a comment. `hotfix/*` branches have no ticket and keep that name.
- Sessions commit and push without asking first.
- Keep PR branches up to date by rebasing onto `origin/dev` and pushing with `--force-with-lease`. PRs land with "Rebase and merge", and merge commits are refused.
- A new CI job has to be added as a required check in the `main` and `dev` rulesets.
- Every PR into `dev` must link an open issue with `Closes #N`, `Fixes #N` or `Resolves #N`, unless it comes from a `hotfix/*` branch; the `PR rules` check fails otherwise. Linked issues get a `PR Opened` label and close when the PR merges into `dev`, the default branch.
- After opening a PR, run `pnpm test:e2e` locally in all browsers, because CI only runs Chromium on PRs into `dev`. If any browser fails, run `gh pr ready --undo` and add a PR comment saying which browser and test failed and that this is why the PR is now a draft.
- Every open issue has a status label: `todo` when it isn't started (add it when creating the issue) and `in progress` from the moment work starts, including work delegated to a session or subagent. Swap them with `gh issue edit <N> --add-label "in progress" --remove-label todo`. `remove-status-labels.yml` removes both automatically when an issue closes.
- A session's work ends when its PR is ready. Link the ticket with `Closes #N` so that merging closes it. If a PR only resolves part of a ticket, move the remaining work to a new ticket before merging. After the user merges, check that the ticket is closed, and close it with `gh issue close` if it isn't, for example when a different PR resolved it or no PR was needed.
- Open a draft PR as soon as work on a ticket starts, so the PR list shows what's being worked on. If there's nothing to commit yet, start with `git commit --allow-empty`. The body links the ticket from the start and says what's planned and what's done so far. Push often, at least at every meaningful step, and keep the body current. Run `gh pr ready` only when the ticket's definition of done is met and CI passes. Checks that can only run after merging, such as a workflow that only runs from `main`, don't block it: list them in the PR and do them after the merge.
- Session and PR titles start with the ticket number, for example `#22 Run Playwright against the deployed URL`. A session working on a ticket with a different title renames itself when it starts.
- Only the user merges. A session never merges a PR or turns on auto-merge unless the user tells it to for that specific PR, and approval for one PR doesn't carry over to another. Sessions use the user's GitHub login, so GitHub can't enforce this for them.
- Workflows declare top-level `permissions: contents: read` and grant write scopes only on the job that needs them. Pass PR data (body, title, branch names) to scripts through `env:`, never as `${{ }}` inside `run:`. Pin actions to a commit SHA with the version in a comment.

## Tooling

- Node.js 24 (`.nvmrc`, `engines` in `package.json`). The signaling server runs with `node src/server.ts` / `node --watch`, using Node's built-in type stripping. There is no tsx, ts-node or build step; don't add one. Type errors only show up in `pnpm typecheck`.
- Code Node runs (the server and `shared-lib`) must be plain type-strippable TypeScript, which `tsc` enforces with `erasableSyntaxOnly` and `verbatimModuleSyntax`:
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
- Configuration comes from environment variables (`PORT`, `CORS_ORIGINS`), loaded from `packages/signaling-server/.env` with Node's `--env-file-if-exists`. Document new variables in that file and the README configuration table.
- Never log event payloads, even encrypted ones. Log startup, shutdown, connections, disconnections and errors only.
- socket.io's `cors` option is the only CORS handling. The client sends no cookies, so don't enable `credentials`.

## End-to-end tests

- Playwright in `packages/e2e`. `webServer` builds the client into `packages/e2e/dist` and starts it and the signaling server on ports 8193 and 5193 (`E2E_SIGNALING_PORT`, `E2E_CLIENT_PORT`), or uses an app that already runs (`E2E_BASE_URL`).
- Use roles and labels (`getByRole`, `getByLabel`), and wait on outcomes rather than fixed sleeps. No retries: fix a flaky test instead of hiding it.
- Tests must not reach anything outside the machine. Use the `openPeer` fixture from `tests/fixtures.ts`: it removes the app's STUN servers from peer connections and fails a test that requests an external URL.
- Tag tests that need two peers to connect with `WEBRTC` from `tests/helpers.ts`. WebKit skips them, because its mDNS host candidates don't resolve under Playwright. Firefox skips them until the connection bug is fixed, because peers sometimes get stuck connecting. For now they're `test.fixme` in every browser, because of a connection bug: they sometimes fail in Chromium with the inviter left on the start page. Remove those marks when it's fixed.
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
