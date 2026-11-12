# Paranoid

Paranoid is a private, peer-to-peer chat for two people. You don't need an account, nothing is stored, and the server never sees your messages.

Messages go straight from one browser to the other over WebRTC. A small signaling server only helps the two browsers find each other. Even that handshake is end-to-end encrypted, so the server only passes along data it can't read.

## How it works

1. **Create an invite.** The person starting the chat chooses a display name, a pass phrase and how long the invite stays valid (2 to 20 minutes). The browser makes a new ECDH (P-521) key pair, and the public key is registered with the signaling server under a one-time invite id.
2. **Share it.** The invite goes to the other person as a direct link (Web Share API) or as a link copied to the clipboard. The pass phrase can be sent with the invite, or separately over another channel for extra safety.
3. **Join.** The other person opens the invite and enters the pass phrase. The server gives them the inviter's public key once and then deletes it from the invite.
4. **Handshake.** Both sides derive a shared AES-GCM key using ECDH. Every signaling payload (pass phrase check, SDP descriptions, ICE candidates) is encrypted twice: first with the ECDH-derived key, then with a key derived from the pass phrase (PBKDF2, 100k iterations). The server only relays this ciphertext between the two sockets.
5. **Chat.** Once the WebRTC connection is up, text messages go directly between the peers. Invites live only in server memory and are removed when they expire, when the chat closes or when either side disconnects.

> NAT traversal uses Google's public STUN servers by default, and they see users' IP addresses. Setting `VITE_ICE_SERVERS` to a self-hosted STUN server avoids this. No TURN server is set up, so some restrictive networks may fail to connect.

## Repository layout

This is a pnpm workspace monorepo:

| Package                                                  | Description                                                                                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`packages/client-app`](packages/client-app)             | React 19 + Vite 8 web app (React Router 8, TanStack Query, socket.io-client). Native HTML elements (`<dialog>`, popovers, anchor positioning) in the browser's default look, modern-normalize, OS light or dark mode, and SVG icons. |
| [`packages/signaling-server`](packages/signaling-server) | socket.io signaling server. Node.js runs its TypeScript directly ([type stripping](https://nodejs.org/api/typescript.html)), with no build step. It holds invites in memory and relays the encrypted handshake.                      |
| [`packages/shared-lib`](packages/shared-lib)             | Shared TypeScript utilities and socket event types, used as source by the client and the server.                                                                                                                                     |
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
pnpm install
```

This one command installs the dependencies of all the packages and the shared root tooling. pnpm reads the packages listed in [`pnpm-workspace.yaml`](pnpm-workspace.yaml), resolves them together and writes a single lockfile, the root [`pnpm-lock.yaml`](pnpm-lock.yaml). It records each package's own dependencies too, so the packages have no lockfiles of their own.

Each package gets its own `node_modules` containing only the dependencies it declares, as links into a shared store at `node_modules/.pnpm`. A package can't import something it doesn't list in its `package.json`, even if another package uses it. `shared-lib` is declared as `"workspace:*"`, so `packages/*/node_modules/shared-lib` links straight to `packages/shared-lib`.

For an install that matches the lockfile exactly, use `--frozen-lockfile`. It fails instead of updating `pnpm-lock.yaml` when the lockfile and the `package.json` files disagree. Use it in CI, after switching branches, or when `node_modules` seems broken (delete `node_modules` first for a fully clean install):

```bash
pnpm install --frozen-lockfile
```

To install only what one package needs, for example in a server deployment, add `--filter`. The root tooling is installed too:

```bash
pnpm install --frozen-lockfile --filter signaling-server
```

To add or remove a dependency, run the command from the root and name the package with `--filter`. It updates that package's `package.json` and the root lockfile:

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

By default the server only accepts browser connections from `http://localhost:5173` (Vite dev) and `http://localhost:4173` (Vite preview). If you serve the client from another origin, add it to `CORS_ORIGINS` (see below). Ctrl+C or `SIGTERM` disconnects every socket and closes the server.

### Configuration

The signaling server reads these environment variables. The `start` and `dev` scripts also load [`packages/signaling-server/.env`](packages/signaling-server/.env) with Node's built-in `--env-file-if-exists`; variables already set in the environment take precedence.

| Variable       | Default                                       | Purpose                                             |
| -------------- | --------------------------------------------- | --------------------------------------------------- |
| `PORT`         | `8181`                                        | Port the server listens on.                         |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:4173` | Comma-separated browser origins allowed to connect. |

The server logs startup, connections, disconnections and handler errors. It never logs event payloads.

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

| Command             | What it does                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm dev`          | Signaling server and Vite dev server in parallel, with each line labeled by package; Ctrl+C stops both |
| `pnpm test`         | Unit tests in every package that has them (client-app, shared-lib, signaling-server)                   |
| `pnpm test:e2e`     | Playwright end-to-end tests, see [End-to-end tests](#end-to-end-tests)                                 |
| `pnpm typecheck`    | Type-check every package                                                                               |
| `pnpm lint`         | Lint the whole repo with oxlint (`.oxlintrc.json`; the client adds React rules in its own config)      |
| `pnpm knip`         | Find unused files, exports and dependencies in every package with knip (`knip.json`)                   |
| `pnpm build`        | Build every package that has a build (client-app)                                                      |
| `pnpm format`       | Format the whole repo with oxfmt (`.oxfmtrc.json`)                                                     |
| `pnpm format:check` | Check formatting without changing files                                                                |

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

The tests send nothing outside the machine:

- Every peer connection gets an empty ICE server list in place of the app's Google STUN servers, so peers connect with host candidates. Browsers also expose plain host candidates, because resolving mDNS names depends on multicast.
- A test fails if its page requests anything outside `localhost`.
- Reports and traces hold only test data, and git ignores them.

| Browser  | Coverage                                                                                                                                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium | Everything except the `test.fixme` tests, with the real clipboard.                                                                                                                                                                                                           |
| Firefox  | Everything except reading the real clipboard, as Playwright can't grant the permission, and for now tests tagged `@webrtc`: peers sometimes get stuck connecting.                                                                                                            |
| WebKit   | Everything except the real clipboard, which could replace the clipboard of the machine, and tests tagged `@webrtc`: Playwright's WebKit only offers mDNS host candidates, and they don't resolve, so two peers never connect. The forms, dialogs and invite flows still run. |

Tests that document a known bug are marked `test.fixme`, with a comment saying what goes wrong.

For now, every test that connects two people, including the core flow, is marked `test.fixme`: until that bug is fixed they sometimes fail in Chromium with the inviter left on the start page. So neither CI nor `pnpm test:e2e` checks that two people can chat.

## Continuous integration

GitHub Actions workflows live in [`.github/workflows`](.github/workflows):

| Workflow                                                                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ci.yml`](.github/workflows/ci.yml)                                     | On every pull request and every push to `main` or `dev`: `pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm knip`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` and `pnpm build`, each as its own step. A second job, `End-to-end tests`, runs `pnpm test:e2e` for one browser with a cached browser and uploads the HTML report when it fails: Chromium everywhere, plus Firefox and WebKit on pull requests into `main`. |
| [`pr-rules.yml`](.github/workflows/pr-rules.yml)                         | Fails a pull request into `main` that isn't from `dev`, a pull request into `dev` that doesn't link an open issue or come from a `hotfix/*` branch, and a pull request with no changes that isn't a draft.                                                                                                                                                                                                                              |
| [`label-issues-on-pr.yml`](.github/workflows/label-issues-on-pr.yml)     | When a pull request opens, adds the `PR Opened` label to the issues it links.                                                                                                                                                                                                                                                                                                                                                           |
| [`remove-status-labels.yml`](.github/workflows/remove-status-labels.yml) | When an issue closes, removes its `todo` and `in progress` labels.                                                                                                                                                                                                                                                                                                                                                                      |

The `main` and `dev` rulesets require these checks, so GitHub refuses to merge a pull request while one of them is failing. See [CONTRIBUTING.md](CONTRIBUTING.md#where-the-rules-are-enforced).

A pull request into `dev` links the issue it resolves (for example `Closes #12` in its description), and GitHub closes the issue when the pull request merges. Run the same checks locally before pushing.

The workflows use a read-only `GITHUB_TOKEN` by default (`permissions: contents: read`); only the two labeling jobs may write, and only to issues.

## Contributing

The branches, the rules for pull requests and how releases work are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE), so you're free to use, change, fork and deploy it.

The icons in [`icons.tsx`](packages/client-app/src/components/Icon/icons.tsx) come from Google Material Icons, which are under the [Apache License 2.0](packages/client-app/src/components/Icon/LICENSE-material-icons.txt).
