# Deploying Paranoid

Anyone with a fork of this repository can start their own Paranoid server from GitHub Actions, on one of the cloud providers below. Each provider has its own page, a step-by-step guide that assumes only a GitHub account: creating the provider's account and its credentials, keeping them secret, the cost, and removing everything again.

This page is the index: how deploying works on every provider, the settings they share, and the list of providers.

## Contents

- [How deploying works](#how-deploying-works)
- [What every provider needs from GitHub](#what-every-provider-needs-from-github)
- [Shared repository variables](#shared-repository-variables)
- [The cost limit](#the-cost-limit)
- [Providers](#providers)
- [Adding a provider](#adding-a-provider)

## How deploying works

You start a server from your fork's **Actions** tab for a set number of invites. It powers itself off once the last invite is finished, or when its lifetime is over, whichever comes first, and the provider's cleanup workflow then deletes it. Every deploy, stop and cleanup first runs a preflight, which fails a run that someone without admin permission on the fork started, and lists everything below that's missing or wrong, with the guide step that fixes it, before anything is created. Before the deploy creates anything, it works out what the server could cost in the worst case and refuses to start if that's over your limit. Every deploy waits for you to approve it, as the required reviewer of the provider's deploy environment. Stopping and cleaning up need no approval, so the scheduled cleanup can run without anyone there. Nothing runs between uses, and chats that have started keep working after the server is gone, because they're peer to peer.

## What every provider needs from GitHub

Each provider's page starts with a section, **What this deployment needs**, which lists everything that provider needs from GitHub by name: its environments, its secrets and its variables. Names aren't secret, since the public workflow files use them. Values are never listed, only what each is for and where it comes from.

Every provider follows the same pattern:

- **Two GitHub environments**, which only the `main` branch may use:
  - `<provider>`, for **Deploy to &lt;Provider&gt;**, with you as its required reviewer;
  - `<provider>-cleanup`, for **Stop &lt;Provider&gt;** and **Clean up &lt;Provider&gt;**, with no reviewers.
- **Identity values, in those environments only**: everything that says who signs in to the provider, or which of your account's resources a deploy uses. That's an API token, as an environment secret, or, for providers that trust GitHub's OIDC token and need no secret, the role, client, tenant, subscription, project and service account IDs, as environment variables. What the provider's one-time setup made, such as a security group, bucket or resource group, is an environment variable too. Each goes in every environment whose workflows use it, under the same name in each, even where its value differs. None is ever a repository variable, so only an approved deploy, or a stop or cleanup on `main`, can read it.
- **Tuning values, as repository variables**: the region, zone, server size, plan and image, and every limit. They say nothing about your account, so any job can read them, as it reads the [shared ones](#shared-repository-variables). All are optional, with defaults the guide explains.
- **A public fork**, with workflow logs kept for 1 day. Required reviewers work only in public repositories on GitHub's Free, Pro and Team plans, and anyone can read a public fork's logs, which show the server's address.

## Shared repository variables

Every provider's deploy workflow reads these repository variables. They're all optional: set one in your fork under **Settings** → **Secrets and variables** → **Actions** → **Variables** only to change its default. A provider's page links here rather than repeating them.

| Variable              | What it does                                                                                                                                                                                                                                                                      | Default | Allowed values                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| `MAX_INVITES`         | Invites the server creates before it powers off. The deploy workflow's `max_invites` input overrides it.                                                                                                                                                                          | `5`     | A whole number from 1 to 10000                                                   |
| `LIFETIME_MINUTES`    | Minutes until the server powers off at the latest, counted from when it starts. The deploy workflow's `lifetime_minutes` input overrides it.                                                                                                                                      | `60`    | A whole number from 1 to 1440 (24 hours)                                         |
| `MAX_EGRESS_MBIT`     | Limit on all the server's outbound traffic, in Mbit/s, against abuse and its cost. At 2 Mbit/s, the app's files load in about a second. A higher limit makes each deploy's worst case more expensive.                                                                             | `2`     | A whole number from 1 to 50                                                      |
| `MAX_DEPLOY_COST_USD` | The most one deploy may cost in the worst case, in US dollars before tax: the server for its whole lifetime, with outbound traffic at `MAX_EGRESS_MBIT` all the time. A deploy that could cost more is refused before it creates anything. See [The cost limit](#the-cost-limit). | `1`     | An amount in dollars with up to two decimals, such as `1` or `2.50`, below 10000 |

Shared names have no provider prefix. Every other name starts with its provider's own prefix, such as `UPCLOUD_` or `AWS_`, and is on that provider's page.

## The cost limit

Every provider uses the same name, `MAX_DEPLOY_COST_USD`, for the most a single deploy may cost. Each deploy workflow checks it, with its provider's prices in `deploy/<provider>/prices.json`, before it creates anything. One name means you set it once, whichever providers you use, and every guide can promise the same thing.

A provider may add a second limit on top, but never instead of it. Google Cloud is the example: it has no prepaid balance or hard cap on spending, so its deploy also keeps a ledger of the month's deploys and refuses one that doesn't fit the month's total. That's a different amount, the total for a calendar month, so it has its own name with the provider's prefix, `GCP_MONTHLY_BUDGET_USD`, and is listed on Google Cloud's page.

## Providers

A provider is listed here only once its pull request has merged, with its page, its workflows and its scripts. **Needs a secret** is "No" for providers that sign in with GitHub's OIDC token. **Deployed for real** says whether the guide has been followed end to end on a real account.

<!-- One row per provider, in alphabetical order, added by the pull request that adds its workflows. scripts/check-deploy-docs.mts checks it. -->

| Provider              | Where it runs                                                                                                          | Needs a secret                         | Deployed for real |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------- |
| [UpCloud](upcloud.md) | UpCloud, a Finnish provider, in its EU zones: Helsinki, Frankfurt, Amsterdam, Copenhagen, Stockholm, Warsaw and Madrid | Yes, an API token for each environment | No                |

## Adding a provider

This part is for whoever adds a provider. Besides its workflows (`deploy-`, `stop-` and `cleanup-<provider>.yml`) and its scripts in `deploy/<provider>/`, a provider's pull request adds:

1. **Its page, `docs/deploy/<provider>.md`**, with **What this deployment needs** right after the introduction, before step 1 of the guide, in the form below.
2. **Its folder's README, `deploy/<provider>/README.md`**, two lines for people reading the code: what the folder is, and a link to `../../docs/deploy/<provider>.md`.
3. **Its row in [Providers](#providers)**, linking its page.
4. **Its preflight list, `deploy/<provider>/requirements.json`**: the same environments, secrets and variables as its page, with the rules each value must follow and the guide step that sets it. The deploy, stop and cleanup workflows run [the deploy preflight](../../.github/actions/deploy-preflight/README.md) first, which reads the list. The action's README has [the list's format](../../.github/actions/deploy-preflight/README.md#writing-a-providers-list), including where the shared variables go.

A variable that every provider uses goes in the [shared table](#shared-repository-variables) instead of each page, and a shared variable must be used by every provider.

### The same deploy on every provider

Every provider's deploy works the same way, so that whoever knows one knows them all, and a review finds a difference only where a provider needs one. Where a choice touches security, this takes the more secure option. A provider departs from it only where it says so below, with the reason.

1. **The preflight first.** Every deploy, stop and cleanup job runs [the deploy preflight](../../.github/actions/deploy-preflight/README.md) as its first step after the checkout, with `deploy/<provider>/requirements.json`, and a deploy also runs it before that, in a separate job without the environment, so a run started by someone without admin permission fails before anyone is asked to approve it. The action's README has [the calling pattern](../../.github/actions/deploy-preflight/README.md#using-it). The preflight checks the environments, variables and secrets. The provider's scripts check the workflow's inputs, and check again every value they write into the server's startup settings (its user data), so those values are checked twice.
2. **Where settings live**, as in [What every provider needs from GitHub](#what-every-provider-needs-from-github):
   - Identity values are environment secrets or environment variables, in each of `<provider>` and `<provider>-cleanup` that uses them, never repository variables. Only `main`, and for a deploy only once you approve it, can read them.
   - One name per role: a value that differs between the two environments, such as the role or client ID each one signs in as, keeps one name in both, such as `<PROVIDER>_ROLE_ARN`, never a `<PROVIDER>_CLEANUP_…` second name. The environment, not the name, says which one a job gets.
   - Tuning values (region, zone, size, plan, image) and every limit, a provider's own included, such as `GCP_MONTHLY_BUDGET_USD`, are repository variables, like the shared ones.
   - No job reads an identity value outside its environment, where GitHub gives it as empty. A scheduled cleanup's `start` job, which has no environment, checks only that `<provider>-cleanup` exists, and the cleanup job it starts checks the rest with the preflight.
3. **Pinned CLIs.** The provider's CLI is installed at a pinned version with a checked checksum, like every download, never taken from the runner image, which changes it without notice. A provider that can't do this says why in its pull request.
4. **Concurrency groups:** deploy and stop share `<provider>`, so a stop cancels a deploy in progress. Cleanup uses `<provider>-cleanup`, so it never waits behind a deploy that is waiting hours for its approval.
5. **Scheduled cleanup**, hourly, at a different minute for each provider, so that cleanups of several providers in one fork don't all start at once: UpCloud 17, Hetzner 23, AWS 41, Google Cloud 47, Azure 5. The cost check counts the time a finished server may wait for it, `cleanupDelayMinutes: 120` in the price file, an hour between runs and an hour of margin. AWS has none, because its server terminates itself, and a terminated instance stops billing.
6. **Timeouts:** the deploy job 30 minutes, stop and cleanup 15. The wait for the app inside the deploy stays each provider's own, since servers boot at different speeds.
7. **Names:**
   - Jobs: the stop job is "Delete the servers", the cleanup job "Delete finished servers".
   - Steps: "Check the worst-case cost", "Delete the existing servers" and "Create the server" (`id: create`). Every step has a name.
   - Scripts: `deploy/<provider>/create-server.sh`, and `deploy/<provider>/delete-servers.sh all|finished|run`. Log lines may use the provider's own word, such as AWS's "terminate", but names don't.
8. **Labels or tags** on everything a deploy creates: `app=paranoid`, `run`, `created` and `expires`, the times in Unix seconds. Two exceptions, for what only that provider has:
   - Google Cloud adds `paranoid-month` for its monthly ledger, and its `run` is `<run_id>-<attempt>`, because a re-run creates a server of its own.
   - Azure keeps ISO times only if its Logic App backstop can't compare Unix seconds.
9. **The cost check** gets the server size the deploy will actually use, from its setting. Google Cloud may pass `e2-micro` as written only while its size isn't a setting.
10. **The deploy's summary** has the app's URL, the shutdown time, the size and region, what deletes the server (the cleanup or a backstop), and "The most it can cost is $WORST_CASE_USD". A provider's extras, such as Google Cloud's budget left for the month, come after it.
11. **The guide's skeleton**, after "What this deployment needs", "Contents" and "Words used in this guide":
    1. Fork the repository
    2. Sign up
    3. Prepare the account
    4. Create the credentials, or run the one-time setup
    5. Connect your fork: the environments, the credentials in them, and log retention as a `###` of its own
    6. Optional settings
    7. Start a server
    8. Stop it

    A provider that needs fewer steps folds two together, such as "4. Create the credentials and connect your fork", and keeps the order. Then come "Costs", the provider's own extras, "Checking nothing is left", "The credentials" (where they live, what they may do and how to replace them, or why there's no secret), "Troubleshooting", "Removing everything", "Privacy" and "What a deploy does".

### What CI checks

CI keeps the pages true to the workflows, and checks the parts of the pattern above that it can read. [`scripts/check-deploy-docs.mts`](../../scripts/check-deploy-docs.mts) reads every `.github/workflows/*-<provider>.yml` and fails if:

- a page doesn't list an environment, secret or variable that the provider's workflows use, or lists one they no longer use, or a provider with workflows has no page, no folder README or no row here;
- a secret, or a variable set in an environment, is read outside that environment's jobs, a job's own `if:` included, which runs before the job gets its environment;
- a variable's **Set in** doesn't match where the workflows read it, an identity value is set in the repository or a tuning value in an environment, judged by its name's ending (`_ARN`, `_CLIENT_ID`, `_PROJECT` and the like, or `_REGION`, `_SIZE`, `_USD` and the like), a token is a variable, or an identity value has a second, `_CLEANUP_` name;
- the guide's `##` headings aren't the skeleton's, in its order, with the steps numbered from 1, starting with "Fork" and "Sign up" and ending with "Optional settings", "Start a server" and "Stop it".

It also reads the preflight's lists, `deploy/requirements.json` and each `deploy/<provider>/requirements.json`, so the page, the workflows and what the preflight checks can't drift apart. A provider's list is checked once its workflows land, and the check fails if:

- a provider with workflows has no list, or its list and its page don't name the same environments, secrets and variables in the same places: an environment's required reviewers ("You" or "None"), the environments each secret and environment variable is in, which variables are repository variables, and which are **Required** (write "Required" or "Optional");
- a `step` in a list isn't a heading in its guide, or, for the shared list, in this index;
- `deploy/requirements.json` doesn't list the same variables as [the shared table](#shared-repository-variables), or a rule disagrees with its row: the **Default** and each value in backticks under **Allowed values** must pass the rule, and the phrases "whole number", "from A to B", "below N" and "up to N decimals" must say what the rule allows;
- a workflow's preflight step names another provider or an environment its list doesn't have, checks an environment that isn't its job's, or, in the environment's job, doesn't pass every secret that environment lists through `env:` under its own name.

The lists' own format, and what the preflight does with them, are `packages/deploy`'s tests, which `pnpm test` runs.

The rest of the pattern, such as the CLIs, schedules, timeouts, job and step names, labels and the summary, is for review. Run the check from the repository root:

```bash
node scripts/check-deploy-docs.mts
```

The check reads the tables by their columns, so keep the headings and columns exactly as below. The first column holds the name in backticks. **Used by** lists the workflows that use each environment, and a secret's **Environment** lists each environment it's in, each in backticks too. A variable's **Set in** is `Repository`, or the environments it's in, in backticks, such as `` `<provider>` and `<provider>-cleanup` ``. A provider with no secrets writes "No secrets" and a line on why, instead of the secrets table.

```markdown
## What this deployment needs

Everything this deployment needs from GitHub, by name. It also reads the [shared repository variables](README.md#shared-repository-variables).

### Environments

| Environment          | Branches    | Required reviewers | Used by                                         |
| -------------------- | ----------- | ------------------ | ----------------------------------------------- |
| `<provider>`         | `main` only | You                | `deploy-<provider>.yml`                         |
| `<provider>-cleanup` | `main` only | None               | `cleanup-<provider>.yml`, `stop-<provider>.yml` |

### Secrets

| Secret             | Environment                        | Where its value comes from                                 |
| ------------------ | ---------------------------------- | ---------------------------------------------------------- |
| `<PROVIDER>_TOKEN` | `<provider>`, `<provider>-cleanup` | A <Provider> API token for each, created in [step 5](#5-…) |

### Variables

| Variable              | Set in                             | What it does                                 | Required | Default   | Explained in                   |
| --------------------- | ---------------------------------- | -------------------------------------------- | -------- | --------- | ------------------------------ |
| `<PROVIDER>_ROLE_ARN` | `<provider>`, `<provider>-cleanup` | The role each environment's jobs sign in as. | Required | None      | [Step 5](#5-…)                 |
| `<PROVIDER>_REGION`   | Repository                         | Where the server runs.                       | Optional | `<value>` | [Step 6](#6-optional-settings) |
```
