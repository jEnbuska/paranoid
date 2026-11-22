# CI, workflows and actions

Rules for `.github/`, on top of the root [CLAUDE.md](../CLAUDE.md), which has what a session does about a CI failure, an audit finding or a CodeQL alert on its PR. The deploy workflows (`*-<provider>.yml`) and `actions/deploy-preflight` also follow [`deploy/CLAUDE.md`](../deploy/CLAUDE.md): read it before changing them.

## CI

- CI (`.github/workflows/ci.yml`) runs `pnpm lint`, `pnpm knip`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm check:deploy-docs` and `pnpm build`, and `pnpm test:e2e` as a separate job, one per browser (Chromium, Firefox and WebKit). Pushes to `main` and `dev` run everything, and so does a manual run (`workflow_dispatch`), which the Release workflow uses to start CI on `main`. On a PR, a `changes` job decides from the changed files what runs, and a PR with no changed files skips both jobs.
  - Docs (`**/*.md`, `LICENSE`) run no checks and no end-to-end tests, except the format check for Markdown, because oxfmt formats it, and the deployment docs check for Markdown under `docs/deploy/` and `deploy/`.
  - Every PR with changed files, docs included, and every push runs the secret scan (gitleaks) over the commits it adds, in the checks job, so no new required check is needed.
  - A PR into `dev` that changes a `package.json` or `pnpm-lock.yaml` runs a dependency check, a step in the checks job: `pnpm audit` on the PR and on its base, failing only on a known vulnerability of high severity or worse that the PR adds, with the package, advisory and fixed version in the log and job summary (`scripts/audit-report.mts`). GitHub's dependency review can't read pnpm 12's two-document lockfile, so it isn't used.
  - The full audit is required before merging into `main`: every PR into `main` and every push to it runs `pnpm audit --audit-level=high` over the whole tree in that same step, whatever files changed, and a finding fails the required checks job and blocks the release.
  - `audit.yml` audits the whole tree weekly, and from `workflow_dispatch`, because a new advisory can appear for a dependency nobody touched. A finding opens one issue labeled `bug` and `todo`, or updates the open one, and never fails a PR.
  - Dependabot only keeps the actions current: `.github/dependabot.yml` opens one PR into `dev` a week that bumps each pinned SHA and its `# vX.Y.Z` comment, skipping releases less than a week old. It doesn't check npm dependencies: GitHub's docs say Dependabot alerts and security updates don't cover pnpm 12's two-document lockfile, and alerts don't cover actions pinned to a SHA. `pnpm audit` is the real dependency check. Alerts are on and security updates off. See "Dependabot" in CONTRIBUTING.md.
  - CodeQL code scanning runs as GitHub's default setup, turned on in the repository's settings, so there is no workflow file for it. It analyses the TypeScript and JavaScript and the GitHub Actions workflows (such as `${{ }}` inside `run:`, or too-broad `permissions`) on every PR into `dev` and `main`, every push to them, and weekly. It skips dot-folders such as `.claude`. Its results are the `CodeQL` check, and its alerts are under the repository's Security tab.
  - The end-to-end tests run for changes under `packages/` (except docs) and to the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `.nvmrc`. Every other change runs only the checks.
  - A change to `ci.yml` runs everything.
  - The end-to-end job runs in Playwright's container image (`mcr.microsoft.com/playwright`), which has the browsers and their system packages, so nothing in CI runs `apt`, which hangs when Ubuntu's mirror is unreachable. The image is pinned by digest, with its tag in a comment. It must be the same version as `@playwright/test` in `pnpm-lock.yaml`, and the job's "Check the image's browsers" step fails if it isn't, so updating Playwright means updating the image in the same PR.
  - Skip a matrix job's steps, never the job: a skipped matrix job reports one check under its unexpanded name, `End-to-end tests (${{ matrix.browser }})`, so the required `End-to-end tests (chromium)`, `(firefox)` and `(webkit)` would wait forever. A non-matrix job can skip with `if:`, which counts as passing.
- A new CI job has to be added as a required check in the `main` and `dev` rulesets.

## Workflows

- Workflows declare top-level `permissions: contents: read` and grant write scopes only on the job that needs them. Pass PR data (body, title, branch names) to scripts through `env:`, never as `${{ }}` inside `run:`. Pin actions to a commit SHA with the version in a comment.
