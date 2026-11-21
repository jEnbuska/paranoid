# Paranoid

Paranoid is a private, peer-to-peer chat for two people. You don't need an account, nothing is stored, and the server never sees your messages.

Messages go straight from one browser to the other over WebRTC. A small signaling server only helps the two browsers find each other. Even that handshake is end-to-end encrypted, so the server only passes along data it can't read.

## How it works

1. **Create an invite.** The person starting the chat chooses a display name, a pass phrase and how long the invite stays valid (2 to 20 minutes). The browser makes a new ECDH (P-521) key pair, and the public key is registered with the signaling server under a one-time invite id.
2. **Share it.** The invite goes to the other person as a direct link (Web Share API) or as a link copied to the clipboard. The pass phrase can be sent with the invite, or separately over another channel for extra safety.
3. **Join.** The other person opens the invite and enters the pass phrase. The server gives them the inviter's public key once and then deletes it from the invite.
4. **Handshake.** Both sides derive a shared AES-GCM key using ECDH. Every signaling payload (pass phrase check, SDP descriptions, ICE candidates) is encrypted twice: first with the ECDH-derived key, then with a key derived from the pass phrase (PBKDF2, 100k iterations). The server only relays this ciphertext between the two sockets.
5. **Chat.** Once the WebRTC connection is up, text messages go directly between the peers. Invites live only in server memory. The server forgets an invite once both sides have finished the handshake over the data channel, or earlier when it expires, when it's closed or when either side disconnects.

If the connection to the peer drops, a short interruption can recover by itself: the chat says the connection is interrupted and doesn't send until it's back. Connecting that fails or takes longer than 30 seconds, and a connection that fails or closes during the chat, for example after a network switch or when the other person leaves, end on the error page. Either person can then start again with a new invite, which has to be sent again, and the old chat isn't carried over. The server takes no part in reconnecting, by design. It has forgotten the invite, and keeping peers paired or holding reconnect state would let it know who is talking to whom.

> NAT traversal uses Google's public STUN servers by default, and they see users' IP addresses. Setting `VITE_ICE_SERVERS` to a self-hosted STUN server avoids this. No TURN server is set up, so some restrictive networks may fail to connect.

## Repository layout

This is a pnpm workspace monorepo:

| Package                                                  | Description                                                                                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`packages/client-app`](packages/client-app)             | React 19 + Vite 8 web app (React Router 8, TanStack Query, socket.io-client). Native HTML elements (`<dialog>`, popovers, anchor positioning) in the browser's default look, modern-normalize, OS light or dark mode, and SVG icons. |
| [`packages/signaling-server`](packages/signaling-server) | socket.io signaling server. Node.js runs its TypeScript directly ([type stripping](https://nodejs.org/api/typescript.html)), with no build step. It holds invites in memory and relays the encrypted handshake.                      |
| [`packages/shared-lib`](packages/shared-lib)             | Shared TypeScript utilities and socket event types, used as source by the client and the server.                                                                                                                                     |
| [`packages/deploy`](packages/deploy)                     | Helpers for the deploy workflows, run by Node.js from TypeScript like the server: the worst-case cost check that refuses a deployment above its limit, with each provider's prices in `deploy/<provider>/prices.json`.               |
| [`packages/e2e`](packages/e2e)                           | Playwright end-to-end tests of the real client and signaling server, with two browser contexts as the two people.                                                                                                                    |

Shared tooling is installed once at the repository root: TypeScript 7 (the native `tsgo` compiler), [oxlint](https://oxc.rs/docs/guide/usage/linter), and [oxfmt](https://oxc.rs/docs/guide/usage/formatter) and [knip](https://knip.dev). `tsc` only type-checks; Node.js runs the server's TypeScript without checking types. Tests run on Vitest, so no tool needs the older JavaScript-based TypeScript API.

## Local development

### Prerequisites

- **Node.js 24 LTS**. The repo has an `.nvmrc`, so `nvm use` picks the right version.
- **pnpm 12** ([install](https://pnpm.io/installation), for example `npm install -g pnpm@12`)
- A modern browser with WebRTC and Web Crypto support

### Install

pnpm runs everything in this repo. The version is pinned in the root `package.json` (`packageManager`). Install it from the repository root, never inside a package:

```bash
pnpm install --frozen-lockfile
```

This one command installs the dependencies of all the packages and the shared root tooling. pnpm reads the packages listed in [`pnpm-workspace.yaml`](pnpm-workspace.yaml) and installs exactly what the single lockfile, the root [`pnpm-lock.yaml`](pnpm-lock.yaml), says. The lockfile records each package's own dependencies too, so the packages have no lockfiles of their own. `--frozen-lockfile` makes the install fail when the lockfile and the `package.json` files disagree, instead of quietly rewriting `pnpm-lock.yaml` as plain `pnpm install` would. If `node_modules` seems broken, delete it and run the same command for a fully clean install.

Each package gets its own `node_modules` containing only the dependencies it declares, as links into a shared store at `node_modules/.pnpm`. A package can't import something it doesn't list in its `package.json`, even if another package uses it. `shared-lib` is declared as `"workspace:*"`, so `packages/*/node_modules/shared-lib` links straight to `packages/shared-lib`.

To install only what one package needs, for example in a server deployment, add `--filter`. The root tooling is installed too:

```bash
pnpm install --frozen-lockfile --filter signaling-server
```

The lockfile changes only through commands that change dependencies: `pnpm add`, `pnpm remove` and `pnpm update`, or plain `pnpm install` right after editing a `package.json` by hand. Commit the `package.json` and `pnpm-lock.yaml` together. To add or remove a dependency, run the command from the root and name the package with `--filter`. It updates that package's `package.json` and the root lockfile:

```bash
pnpm add some-lib --filter signaling-server
```

```bash
pnpm remove some-lib --filter signaling-server
```

Tools used by every package (TypeScript, oxlint, oxfmt, knip) are root dev dependencies: `pnpm add -D -w some-tool` (`-w` means the workspace root).

pnpm doesn't run dependencies' install scripts unless they're allowed under `allowBuilds` in `pnpm-workspace.yaml`, and no dependency here needs one. If an install fails with `ERR_PNPM_IGNORED_BUILDS`, check what the package's script does before allowing it with `pnpm approve-builds <package>`.

### Run

Start the signaling server and the web app together from the repository root:

```bash
pnpm dev
```

The signaling server listens on `localhost:8181` (set `PORT` to change it) and restarts when files change; the web app is a Vite dev server with HMR. Open http://localhost:5173. To try a full chat on one machine, open the app in two browser windows (for example a normal window and a private one): create an invite in one and join it from the other.

By default the server only accepts browser connections from `http://localhost:5173` (Vite dev) and `http://localhost:4173` (Vite preview). If you serve the client from another origin, add it to `CORS_ORIGINS` (see below). Ctrl+C or `SIGTERM` disconnects every socket and closes the server, which then exits with 130 or 143.

### Configuration

The signaling server reads these environment variables. The `start` and `dev` scripts also load [`packages/signaling-server/.env`](packages/signaling-server/.env) and then `.env.local`, whose values win, with Node's built-in `--env-file-if-exists`; variables already set in the environment take precedence over both. `.env` is committed and holds only non-secret defaults. `.env.local` is for your own overrides, and git ignores it.

| Variable       | Default                                       | Purpose                                                                            |
| -------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| `PORT`         | `8181`                                        | Port the server listens on.                                                        |
| `HOST`         | Every interface                               | Address the server listens on, for example `127.0.0.1` behind a reverse proxy.     |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:4173` | Comma-separated browser origins allowed to connect.                                |
| `MAX_INVITES`  | No limit                                      | How many invites the server creates before it exits: a whole number of at least 1. |

The server logs startup, connections, disconnections and handler errors. It never logs event payloads.

With `MAX_INVITES` set, the server refuses to create an invite once it has created that many, and the person trying sees the error page. Opening an invite that already exists still works. Once the last invite is finished, however it ends, the server closes and exits with code 0, so a deployment can shut itself down. Chats already running keep going, because they don't use the server. Code 0 means only that; a crash, a startup error such as an invalid `MAX_INVITES`, or a signal exits with another code. The server only counts invites: nothing about who created which one is kept or logged.

`GET /healthz` returns `200` with the body `ok`, for deploy and uptime checks. The response is constant, so it says nothing about the server's state, and health requests aren't logged. Other paths outside socket.io return `404`.

The client reads these Vite env variables from [`packages/client-app/.env`](packages/client-app/.env):

| Variable                | Value in `.env`  | Purpose                                                                                                                                                                                                                          |
| ----------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_SIGNALING_SERVER` | `localhost:8181` | Address of the signaling server.                                                                                                                                                                                                 |
| `VITE_APP_NAME`         | `Paranoid`       | Name shown in the UI.                                                                                                                                                                                                            |
| `VITE_ICE_SERVERS`      | Not set          | STUN servers, as a JSON array of `RTCIceServer` objects with only `urls`, for example `[{"urls":"stun:stun.example.com:3478"}]`. Not set means Google's public STUN servers. An invalid value stops `vite build` and `vite dev`. |

`VITE_ICE_SERVERS` is built into the client and visible to anyone using the app, so static TURN credentials must not be put in it, and the check refuses them.

### Scripts

From the repository root:

| Command             | What it does                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`          | Signaling server and Vite dev server in parallel, with each line labeled by package; Ctrl+C stops both                |
| `pnpm test`         | Unit tests in every package that has them (client-app, shared-lib, signaling-server)                                  |
| `pnpm test:e2e`     | Playwright end-to-end tests, see [End-to-end tests](#end-to-end-tests)                                                |
| `pnpm typecheck`    | Type-check every package                                                                                              |
| `pnpm lint`         | Lint the whole repo with oxlint (`.oxlintrc.json`; the client adds React rules in its own config)                     |
| `pnpm knip`         | Find unused files, exports and dependencies in every package with knip (`knip.json`), and explain how to fix each one |
| `pnpm build`        | Build every package that has a build (client-app)                                                                     |
| `pnpm format`       | Format the whole repo with oxfmt (`.oxfmtrc.json`)                                                                    |
| `pnpm format:check` | Check formatting without changing files                                                                               |

For a single package:

| Command                                | What it does                                    |
| -------------------------------------- | ----------------------------------------------- |
| `pnpm --filter client-app dev`         | Vite dev server with HMR                        |
| `pnpm --filter <package> typecheck`    | Type-check a package with tsgo (TypeScript 7)   |
| `pnpm --filter client-app build`       | Type-check and build the production bundle      |
| `pnpm --filter client-app preview`     | Serve the production build locally on port 4173 |
| `pnpm --filter client-app test`        | Client unit tests (Vitest)                      |
| `pnpm --filter client-app test:watch`  | Client unit tests in watch mode                 |
| `pnpm --filter signaling-server dev`   | Signaling server in watch mode (`node --watch`) |
| `pnpm --filter signaling-server start` | Signaling server without watch                  |
| `pnpm --filter shared-lib test`        | Shared utility tests (Vitest)                   |

## End-to-end tests

The tests in [`packages/e2e`](packages/e2e) build the client and run it with a real signaling server, then act like two people in two separate browser contexts. Install the browsers once, and again when Playwright is updated:

```bash
pnpm --filter e2e exec playwright install chromium firefox webkit
```

Then run the tests from the repository root. Arguments go to Playwright:

```bash
pnpm test:e2e
```

```bash
pnpm test:e2e --project=chromium tests/chat.spec.ts
```

```bash
pnpm test:e2e --repeat-each=5
```

After a failure, open the report with its traces and screenshots:

```bash
pnpm --filter e2e exec playwright show-report
```

The tests start their own servers on ports `8193` (signaling) and `5193` (client), so they run next to `pnpm dev`. Set `E2E_SIGNALING_PORT` and `E2E_CLIENT_PORT` to use others. To test an app that already runs, set `E2E_BASE_URL` to its address, and the tests start no servers. The client is built into `packages/e2e/dist`, not into its own `dist`.

The `MAX_INVITES` tests ([`invite-limit.spec.ts`](packages/e2e/tests/invite-limit.spec.ts)) can't use the shared signaling server, which must not exit under the other tests. Each starts a server process of its own with the `startSignalingServer` fixture, on a port the OS picks, routes its pages' socket.io requests there and checks the exit code. Those pages only use HTTP long-polling, because Playwright can send an HTTP request to another port but not a WebSocket.

The tests send nothing outside the machine:

- Every peer connection gets an empty ICE server list in place of the app's Google STUN servers, so peers connect with host candidates. One test gives them a STUN server of its own that never answers, on the machine's own address. Browsers also expose plain host candidates, because resolving mDNS names depends on multicast. WebKit has no setting for that, so the test setup rewrites the `.local` names in the candidates a page receives to `127.0.0.1`, which reaches the other page on the same machine.
- A test fails if its page requests anything outside `localhost`.
- Reports and traces hold only test data, and git ignores them.

| Browser  | Coverage                                                                                |
| -------- | --------------------------------------------------------------------------------------- |
| Chromium | Everything, with the real clipboard.                                                    |
| Firefox  | Everything except reading the real clipboard, as Playwright can't grant the permission. |
| WebKit   | Everything except the real clipboard, which could replace the clipboard of the machine. |

Each project runs both people in its own browser. [`browser-pairs.spec.ts`](packages/e2e/tests/browser-pairs.spec.ts) connects two people in different browsers, in every ordered pair of Chromium, Firefox and WebKit, because browsers set up WebRTC differently. `openPeer({ browser })` launches the other browser with the same device and launch settings as its project, defined once in [`browsers.ts`](packages/e2e/tests/browsers.ts). Each pair runs once when every project runs, in its inviter's project, and the other projects skip it.

Tests that document a known bug are marked `test.fixme`, with a comment saying what goes wrong.

### Checking for flakiness

Playwright never retries a test, so a test that passes only sometimes fails the run. Pull requests into `dev` don't need this check, as CI runs the end-to-end tests in every browser. To find a flaky test, run every test 20 times in each browser, once on an idle machine and once under load:

```bash
pnpm test:e2e --project=chromium --repeat-each=20
```

```bash
pnpm test:e2e --project=chromium --repeat-each=20 --workers=100%
```

The second command runs one worker per CPU core, twice Playwright's default, so the browsers compete for the CPU, as on a busy CI runner. Repeat both for `firefox` and `webkit`. Every run should pass with no failures. Don't go much higher: each Firefox and WebKit worker starts several processes, and at twice as many workers as cores a 10-core Mac stopped launching them, so nearly every test timed out, whatever it did. Known failures under load are tracked in issues labeled `bug`. Treat a failure that happens only sometimes as a bug in the app or the test, and fix its cause. Don't add a retry, a longer timeout or a fixed wait. When another end-to-end run shares the machine, give each run its own `E2E_SIGNALING_PORT` and `E2E_CLIENT_PORT`, and count the overlap as load.

## Deploy your own

Anyone with a fork can start a Paranoid server from GitHub Actions for a set number of invites. The server powers itself off once the last invite is finished, or when its lifetime is over, and the provider's cleanup then deletes it. Nothing runs between uses. Chats that have started keep working after the server is gone, because they're peer to peer.

Each provider has its own step-by-step guide, which assumes only a GitHub account: creating the account and its credentials, keeping them secret, the cost, and removing everything again. Providers are listed here, one line each, as their guides land.

<!-- One line per provider, in alphabetical order: - [Provider](docs/deploy/<provider>.md), where it runs. -->

- [Azure](docs/deploy/azure.md), Microsoft's cloud, in the EU (Sweden by default), with no secret: GitHub signs in through OIDC.

## Continuous integration

GitHub Actions workflows live in [`.github/workflows`](.github/workflows):

| Workflow                                                                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`ci.yml`](.github/workflows/ci.yml)                                     | On every pull request and every push to `main` or `dev`: `pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm knip`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` and `pnpm build`, each as its own step. A second job, `End-to-end tests`, runs `pnpm test:e2e` once per browser (Chromium, Firefox and WebKit) in Playwright's container image, which already has the browsers and their system packages, and uploads the HTML report when it fails. The image is pinned by digest to the version of `@playwright/test` in `pnpm-lock.yaml`, and the job fails if they differ, so a Playwright update changes both. Pushes run everything. On a pull request, a first job, `Find the changed files`, skips what the changes can't affect: docs (`*.md`, `LICENSE`) only run the format check, and the end-to-end tests only run for changes under `packages/` or to the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` or `.nvmrc`. A change to `ci.yml` runs everything. Every PR with changes, docs included, and every push also runs a secret scan with [gitleaks](https://github.com/gitleaks/gitleaks), a pinned release checked against its checksum, over the commits it adds, with gitleaks' default rules and the providers' token rules in [`.gitleaks.toml`](.gitleaks.toml), and `shellcheck` on the scripts in `deploy/`. |
| [`pr-rules.yml`](.github/workflows/pr-rules.yml)                         | Fails a pull request into `main` that isn't from `dev`, a pull request into `dev` that doesn't link an open issue or come from a `hotfix/*` branch, and a pull request with no changes that isn't a draft.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [`label-issues-on-pr.yml`](.github/workflows/label-issues-on-pr.yml)     | When a pull request opens, adds the `PR Opened` label to the issues it links.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [`remove-status-labels.yml`](.github/workflows/remove-status-labels.yml) | When an issue closes, removes its `todo` and `in progress` labels.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

The `main` and `dev` rulesets require these checks, so GitHub refuses to merge a pull request while one of them is failing. See [CONTRIBUTING.md](CONTRIBUTING.md#where-the-rules-are-enforced).

A pull request into `dev` links the issue it resolves (for example `Closes #12` in its description), and GitHub closes the issue when the pull request merges. Run the same checks locally before pushing.

The workflows use a read-only `GITHUB_TOKEN` by default (`permissions: contents: read`); only the two labeling jobs may write, and only to issues.

## Contributing

The branches, the rules for pull requests and how releases work are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE), so you're free to use, change, fork and deploy it.

The icons in [`icons.tsx`](packages/client-app/src/components/Icon/icons.tsx) come from Google Material Icons, which are under the [Apache License 2.0](packages/client-app/src/components/Icon/LICENSE-material-icons.txt).
