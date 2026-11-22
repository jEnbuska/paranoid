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
- **Credentials**, in those environments only: an environment secret, such as an API token, or no secret at all for providers that trust GitHub's OIDC token, whose IDs go in environment variables instead.
- **Variables**: the [shared ones](#shared-repository-variables), all optional, and the provider's own, which the setup prints or the guide explains.
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

| Provider | Where it runs | Needs a secret | Deployed for real |
| -------- | ------------- | -------------- | ----------------- |

## Adding a provider

This part is for whoever adds a provider. Besides its workflows (`deploy-`, `stop-` and `cleanup-<provider>.yml`) and its scripts in `deploy/<provider>/`, a provider's pull request adds:

1. **Its page, `docs/deploy/<provider>.md`**, with **What this deployment needs** right after the introduction, before step 1 of the guide, in the form below.
2. **Its folder's README, `deploy/<provider>/README.md`**, two lines for people reading the code: what the folder is, and a link to `../../docs/deploy/<provider>.md`.
3. **Its row in [Providers](#providers)**, linking its page.
4. **Its preflight list, `deploy/<provider>/requirements.json`**: the same environments, secrets and variables as its page, with the rules each value must follow and the guide step that sets it. The deploy, stop and cleanup workflows run [the deploy preflight](../../.github/actions/deploy-preflight/README.md) first, which reads the list. The shared variables are in `deploy/requirements.json`, not in each list.

A variable that every provider uses goes in the [shared table](#shared-repository-variables) instead of each page, and a shared variable must be used by every provider.

CI keeps all this true. [`scripts/check-deploy-docs.mts`](../../scripts/check-deploy-docs.mts) reads every `.github/workflows/*-<provider>.yml` and fails if a page doesn't list an environment, secret or variable that the provider's workflows use, or lists one they no longer use, or if a provider with workflows has no page, no folder README or no row here. Run it from the repository root:

```bash
node scripts/check-deploy-docs.mts
```

The check reads the tables by their columns, so keep the headings and columns exactly as below. The first column holds the name in backticks. **Used by** lists the workflows that use each environment, and a secret's **Environment** lists each environment it's in, each in backticks too. A provider with no secrets writes "No secrets" and a line on why, instead of the secrets table.

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

| Variable            | Set in     | What it does           | Required | Default   | Explained in                   |
| ------------------- | ---------- | ---------------------- | -------- | --------- | ------------------------------ |
| `<PROVIDER>_REGION` | Repository | Where the server runs. | Optional | `<value>` | [Step 6](#6-optional-settings) |
```
