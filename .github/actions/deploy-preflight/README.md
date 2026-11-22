# Deploy preflight

Every deploy, stop and cleanup workflow runs this first. Before any cloud step, it checks:

1. **Who started it** (unless `owner-only: "false"`): the actor and, on a re-run, whoever re-ran it, must have admin permission on the repository. This is read from GitHub's API, so a fork owned by an organisation works too.
2. **The environments:** each one in the provider's `requirements.json` exists, can be used from the `main` branch only, and has required reviewers (`"reviewers": "required"`) or none (`"none"`).
3. **The job's variables and secrets:** the repository variables the job's environment reads, and, inside that environment's job, the environment's own variables and secrets. Each required one must be set, and each one that's set must match its pattern and range.
4. **The shared variables** in `deploy/requirements.json`: optional, but each one that's set must be in its range.

It prints one list of everything missing or wrong, by name, each with a link to the guide step that fixes it, writes the same list to the job summary, and fails. It never prints a secret, its length or any part of it: a secret is only tested for being set and matching its pattern.

The checks are `packages/deploy/src/preflight.ts`, run by `preflight-cli.ts`. The lists' format is [`deploy/requirements.schema.json`](../../../deploy/requirements.schema.json).

## Using it

A deploy job waits for its environment's approval before its first step runs. So a deploy workflow runs the preflight twice: in a job without the environment, which fails a run that someone without admin permission started before anyone is asked to approve it, and as the first step of the environment's job, where its own variables and secrets can be read.

```yaml
permissions:
  contents: read

jobs:
  preflight:
    name: Preflight
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
      actions: read # reads the environments' settings
    steps:
      - uses: actions/checkout@<sha> # <version>
        with:
          persist-credentials: false
      - uses: ./.github/actions/deploy-preflight
        with:
          provider: <provider>
          environment: <provider>
          in-environment: "false"
          vars: ${{ toJSON(vars) }}

  deploy:
    needs: preflight
    environment: <provider>
    permissions:
      contents: read
      actions: read
    steps:
      - uses: actions/checkout@<sha> # <version>
        with:
          persist-credentials: false
      - uses: ./.github/actions/deploy-preflight
        with:
          provider: <provider>
          environment: <provider>
          vars: ${{ toJSON(vars) }}
        env:
          # Each secret the environment lists, under its own name
          <PROVIDER>_TOKEN: ${{ secrets.<PROVIDER>_TOKEN }}
      # ... the cost check and the cloud steps
```

Stop and cleanup use the cleanup environment, which has no reviewers, so they run it once, as the first step of their job, with `environment: <provider>-cleanup`. Cleanup also passes `owner-only: "false"`: its scheduled `start` job runs as whoever last edited the schedule, and the run it starts on `main` runs as `github-actions[bot]`.

| Input            | Default               | What it is                                                                                       |
| ---------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| `provider`       |                       | The provider, whose list is `deploy/<provider>/requirements.json`.                               |
| `environment`    |                       | The environment the workflow's job uses.                                                         |
| `in-environment` | `"true"`              | `"false"` in a job without the environment, which skips the environment's variables and secrets. |
| `owner-only`     | `"true"`              | `"false"` for cleanup.                                                                           |
| `vars`           |                       | Always `${{ toJSON(vars) }}`: a composite action can't read the `vars` context itself.           |
| `token`          | `${{ github.token }}` | Reads the environments' settings and the actors' permission.                                     |

### Permissions

The job's token needs `actions: read`, which GitHub's docs list for reading an environment and its deployment branch policies ("Repository permissions for Actions"), and `contents: read` for the checkout. Reading someone's permission on the repository needs `metadata: read`, which every token has. Nothing needs write access.

### Secrets

A composite action can't read the `secrets` context, so the step passes each secret its environment lists through `env:`, under the secret's own name. An unset secret arrives empty and is reported as not set. One the step doesn't pass at all is reported as a mistake in the workflow.

## Writing a provider's list

`deploy/<provider>/requirements.json` lists names and rules, never values:

```json
{
  "$schema": "../requirements.schema.json",
  "guide": "docs/deploy/<provider>.md",
  "environments": {
    "<provider>": {
      "reviewers": "required",
      "step": "#5-connect-your-fork",
      "variables": {
        "<PROVIDER>_PROJECT": {
          "required": true,
          "pattern": "^<pattern>$",
          "example": "<example>",
          "step": "#5-connect-your-fork"
        }
      },
      "secrets": {
        "<PROVIDER>_TOKEN": {
          "required": true,
          "pattern": "^<token pattern>$",
          "step": "#5-connect-your-fork"
        }
      }
    },
    "<provider>-cleanup": {
      "reviewers": "none",
      "step": "#5-connect-your-fork"
    }
  },
  "variables": {
    "<PROVIDER>_ZONE": {
      "pattern": "^[a-z]{2}-[a-z]{3}[0-9]{1,2}$",
      "example": "fi-hel1",
      "environments": ["<provider>"],
      "step": "#6-optional-settings"
    }
  }
}
```

- The names are the ones the provider's page lists in "What this deployment needs" ([the index](../../../docs/deploy/README.md#adding-a-provider) has its template). Keep the two the same.
- `environments.<name>.variables` are the environment's own variables, and `variables` at the top are repository variables. A repository variable's `environments` says which environments' jobs read it, so a cleanup isn't failed by a variable only the deploy reads. Without it, every job checks it.
- Each rule is optional unless `"required": true`, and it's checked whenever it's set. `pattern` is a whole-value regular expression, anchored with `^` and `$`. `minimum` and `maximum` make it a number in that range. `example` is shown when a variable is wrong. A secret has no example.
- `step` is the guide step that fixes it, a link into `guide`, by the [common guide skeleton](../../../docs/deploy/README.md#the-same-deploy-on-every-provider): the environments, the credentials in them and the identity values are set in step 5, "Connect your fork" (the credentials themselves are made in step 4), and the tuning values in step 6, "Optional settings". Link the heading the guide actually has, which a provider that folds two steps together, or adds words to one, names its own way.
- Don't list the shared variables (`MAX_INVITES`, `LIFETIME_MINUTES`, `MAX_EGRESS_MBIT`, `MAX_DEPLOY_COST_USD`). `deploy/requirements.json` has them, with the same rules as the index's [shared table](../../../docs/deploy/README.md#shared-repository-variables).
- `pnpm --filter deploy test` checks every provider's list the same way, in [`provider-requirements.test.ts`](../../../packages/deploy/src/__tests__/provider-requirements.test.ts), so a new provider needs no test of its own. It fails CI on a misspelled key or a bad pattern, and unless the list has the two environments with their reviewers as above, its keys in the example's order, a pattern for every value and an example for every variable, the provider's prefix on every name, and every `step` a heading in the guide, once the guide exists. It also runs the preflight against the list, set and unset. A provider with a secret adds a fake value for it to the test's `FAKE_SECRETS`.

## What it can't see

GitHub's job token can't list variables, so the preflight checks the value a job sees, from `vars`, not where it's set. A variable that should be an environment's own but is set for the whole repository still passes, and inside the environment's job an environment variable of the same name also satisfies a repository variable. Each guide says where each one goes.
