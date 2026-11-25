# Start the cleanup on main

The `start` job of every provider's scheduled cleanup, `cleanup-<provider>.yml`. Scheduled runs use the default branch, `dev`, and only `main` may use the `<provider>-cleanup` environment, so the scheduled run can't clean up itself. This action starts the same workflow on `main` instead, and that run cleans up.

It first checks that the fork has a `<provider>-cleanup` environment and that `cleanup-<provider>.yml` is on `main`. Without either, nothing can have been deployed, since `deploy-<provider>.yml` reaches `main` with the cleanup, so it starts nothing and passes. Any other error reading them fails the run, so a cleanup that can't start shows. The cleanup job it starts checks the environment's settings with the [deploy preflight](../deploy-preflight/README.md).

It reads no `vars` or `secrets`, and needs neither. Its step runs [`deploy/ci/start-cleanup.sh`](../../../deploy/ci/start-cleanup.sh), where CI's shellcheck checks it.

## Using it

Each provider keeps its own job header, its cron (a different minute for each provider, see "The same deploy on every provider" in [`docs/deploy/README.md`](../../../docs/deploy/README.md)), the `if:` on `schedule` and `actions: write`:

```yaml
on:
  schedule:
    - cron: "<minute> * * * *"
  workflow_dispatch:

jobs:
  start:
    name: Start the cleanup on main
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    # actions: write, to start the workflow on main
    permissions:
      actions: write
      contents: read

    steps:
      - name: Check out the repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Start the cleanup on main
        uses: ./.github/actions/start-cleanup-on-main
        with:
          provider: <provider>
          workflow: cleanup-<provider>.yml
```

The checkout is needed because the action is in this repository. `workflow` must be `cleanup-<provider>.yml`, the workflow the job is in, and `pnpm check:deploy-docs` fails a `cleanup-<provider>.yml` that doesn't use this action that way.
