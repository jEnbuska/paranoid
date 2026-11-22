# Deploy Paranoid to UpCloud

This guide takes you from a GitHub account to your own Paranoid server in the EU, on [UpCloud](https://upcloud.com), a Finnish cloud provider. You need no UpCloud experience, and you never log in to a server.

You start a server from GitHub Actions for a set number of invites. It powers itself off once the last invite is finished, or when its lifetime is over, and a scheduled workflow then deletes it. Nothing runs between uses. Chats that have started keep working after the server is gone, because they're peer to peer.

UpCloud's prices and rules below were checked on 2026-11-20. They can change, so check the linked pages too. [Deploying Paranoid](README.md) explains how deploying works on every provider, and lists the other providers.

## What this deployment needs

Everything this deployment needs from GitHub, by name. It also reads the [shared repository variables](README.md#shared-repository-variables).

### Environments

| Environment       | Branches    | Required reviewers | Used by                                   |
| ----------------- | ----------- | ------------------ | ----------------------------------------- |
| `upcloud`         | `main` only | You                | `deploy-upcloud.yml`                      |
| `upcloud-cleanup` | `main` only | None               | `cleanup-upcloud.yml`, `stop-upcloud.yml` |

### Secrets

| Secret          | Environment                  | Where its value comes from                                                                                                    |
| --------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `UPCLOUD_TOKEN` | `upcloud`, `upcloud-cleanup` | An UpCloud API token for each, from the account GitHub Actions uses, created in [step 4](#create-the-api-tokens-and-add-them) |

### Variables

| Variable           | Set in     | What it does                            | Required | Default                        | Explained in                   |
| ------------------ | ---------- | --------------------------------------- | -------- | ------------------------------ | ------------------------------ |
| `UPCLOUD_ZONE`     | Repository | The zone the server runs in.            | Optional | `fi-hel1`                      | [Step 5](#5-optional-settings) |
| `UPCLOUD_PLAN`     | Repository | The server's plan, its size and price.  | Optional | `STARTER-1xCPU-1GB`            | [Step 5](#5-optional-settings) |
| `UPCLOUD_TEMPLATE` | Repository | UpCloud's Debian image with cloud-init. | Optional | `Debian GNU/Linux 13 (Trixie)` | [Step 5](#5-optional-settings) |

## Contents

1. [What this deployment needs](#what-this-deployment-needs)
2. [Words used in this guide](#words-used-in-this-guide)
3. [Fork the repository](#1-fork-the-repository)
4. [Sign up for UpCloud](#2-sign-up-for-upcloud)
5. [Prepare the account](#3-prepare-the-account)
6. [Create the credentials and connect your fork](#4-create-the-credentials-and-connect-your-fork)
7. [Optional settings](#5-optional-settings)
8. [Start a server](#6-start-a-server)
9. [Stop it, and how it's cleaned up](#7-stop-it-and-how-its-cleaned-up)
10. [Costs](#costs)
11. [Checking nothing is left](#checking-nothing-is-left)
12. [The credentials](#the-credentials)
13. [Troubleshooting](#troubleshooting)
14. [Removing everything](#removing-everything)
15. [Privacy](#privacy)
16. [What a deploy does](#what-a-deploy-does)

## Words used in this guide

- **Control Panel:** UpCloud's website for managing your account, at [hub.upcloud.com](https://hub.upcloud.com).
- **Server:** a virtual computer in UpCloud's data center. UpCloud calls them Cloud Servers.
- **Plan:** a server's size and price, for example `STARTER-1xCPU-1GB`: 1 CPU core and 1 GB of memory.
- **Zone:** the data center a server runs in, for example `fi-hel1` in Helsinki or `de-fra1` in Frankfurt.
- **Storage:** the server's disk. It's billed while it exists, even when the server is off, until it's deleted.
- **API token:** a long secret string that lets a program, here GitHub Actions, use your UpCloud account without your password. Treat it like a password.
- **Sub-account, or workspace member:** a second login inside your UpCloud account, with only the permissions you give it. The tokens belong to one, so a leaked token can't do everything your own login can.
- **GitHub environment:** a named set of secrets in your fork that only chosen branches can use, and that can make a workflow wait for someone's approval. Here there are two, `upcloud` and `upcloud-cleanup`, and only `main` can use them.

## 1. Fork the repository

1. Open [github.com/jEnbuska/paranoid](https://github.com/jEnbuska/paranoid) and click **Fork**, then **Create fork**.
2. In your fork, open the **Actions** tab. GitHub turns workflows off in new forks: click **I understand my workflows, go ahead and enable them**.

You should see the workflows **CI**, **Deploy to UpCloud**, **Stop UpCloud** and **Clean up UpCloud** in the list on the left.

The rest of this guide writes your fork as `<owner>/<repo>`, for example `alex/paranoid`.

## 2. Sign up for UpCloud

1. On [upcloud.com](https://upcloud.com), click **Sign up**. UpCloud asks for your name, email address and phone number.
2. Confirm your email address with the link UpCloud sends you, and log in to the [Control Panel](https://hub.upcloud.com).
3. **Add balance.** UpCloud is prepaid: you add money first, and it takes the cost of what runs from that balance every hour.
   - In the Control Panel, go to **Account** → **Billing** → **Manual one time payment** (in a workspace, its **Billing** tab).
   - Pay **€10**, the minimum. That's more than three months of the server running nonstop, and a deploy of an hour costs less than a cent.
   - You can pay by credit or debit card, PayPal (PayPal balance, a bank account or a card through PayPal), Apple Pay or Google Pay. See [UpCloud's payment methods](https://upcloud.com/docs/getting-started/billing/payment-methods/).
   - EU VAT is added to the payment.
   - **Don't set up automated payments.** Then €10 is all UpCloud can take from you. See [Costs](#costs) for what happens when the balance runs out.
   - The first payment has a 30-day money-back guarantee.

You should now see your balance in the Control Panel.

**About the free trial:** UpCloud offers 7 days with €10 of credit, but starting it needs a credit card for a €0 or €1 check. During the trial, UpCloud locks the server firewall to its own rules, so the deploy may fail when it sets the firewall. Paying the €10 above upgrades the account to a full one, so you don't need the trial. See [UpCloud's free trial](https://upcloud.com/docs/getting-started/free-trial/).

## 3. Prepare the account

GitHub Actions gets its own login inside your UpCloud account, with access to servers and storage only: no billing, no other people and no other kinds of resources. Its two tokens are the only secrets you'll add to GitHub.

UpCloud has two kinds of accounts. Look at the Control Panel's menu:

- If you see a **workspace** name and **Workspace settings**, follow **A**.
- If you see **People** in the menu, follow **B**.

### A. Workspaces

UpCloud's [guide for scripts](https://upcloud.com/docs/getting-started/workspaces/api-tokens/#give-a-script-limited-access) says to give a script a member of its own with **Limited access**. That member needs its own email address. Many email providers let you add `+something` to your address, for example `alex+upcloud-deploy@example.com`, which arrives in your own inbox.

1. Optional but recommended: create a workspace used only for Paranoid, so the tokens can't reach anything else you run on UpCloud.
2. In the workspace, add a member with that email address, with **Limited access**.
3. Open the invitation email and accept it, signing up as that member. Log out of your own login first, or use a private browser window.
4. Back in your own login, set the member's **custom access** to:
   - **Servers:** all servers;
   - **Storages:** all storages.

   Nothing else: no billing access and no other resource types.

### B. Sub-accounts

See [UpCloud's sub-accounts](https://upcloud.com/docs/getting-started/accounts/subaccounts/).

1. Go to **People** and create a sub-account, for example `paranoid-deploy`, with its own strong password.
2. Go to **People** → **Permissions** and click **Edit permissions** next to it:
   - turn on **Allow access to Control Panel** for now, so you can create its token in the next step;
   - leave **Allow Basic Auth API connections** off. API tokens don't need it, and it would let the sub-account's password use the API;
   - give it access to **all servers** and **all storages**, and nothing else.

## 4. Create the credentials and connect your fork

The credentials are two UpCloud API tokens, one for each of two GitHub **environments** in your fork. UpCloud shows a token only once, so you create the environments first and paste each token into its environment as soon as UpCloud shows it.

### Create the environments

Only the `main` branch may use either of them:

- `upcloud` is for **Deploy to UpCloud**. You're its required reviewer, so every deploy waits until you approve it. Only you and people you give write access to your fork can start a workflow, and even when one of them starts a deploy, it doesn't run until you approve it.
- `upcloud-cleanup` is for **Stop UpCloud** and **Clean up UpCloud**. It has no reviewers, because the hourly cleanup has to run without anyone there to approve it. Both workflows only delete servers.

The workflows only run when you start them or on their schedule, never from a pull request, so nobody else's code can reach the tokens.

This needs a public repository, which a fork of this one is: see [what every provider needs from GitHub](README.md#what-every-provider-needs-from-github). A private copy on GitHub Free can't have environments, so it can't hold the tokens and isn't supported, and in one on Pro or Team deploys no longer wait for your approval (see GitHub's [deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)). Don't put the tokens in repository secrets instead: every branch and workflow could use them.

#### In GitHub's website

1. In your fork, go to **Settings** → **Environments** → **New environment**, name it `upcloud` and click **Configure environment**.
2. Tick **Required reviewers**, enter your own GitHub username and select it.
3. Leave **Prevent self-review** unticked. Ticked, it would stop you from approving the deploys you start yourself, and you're the only reviewer.
4. Under **Deployment branches and tags**, choose **Selected branches and tags**, click **Add deployment branch or tag rule**, enter `main` and click **Add rule**.
5. Click **Save protection rules**.
6. Go back to **Settings** → **Environments**, click **New environment** again, name it `upcloud-cleanup` and click **Configure environment**.
7. Leave **Required reviewers** unticked. Under **Deployment branches and tags**, choose **Selected branches and tags** and add the rule `main`, as for `upcloud`, then click **Save protection rules**.

#### Or with the GitHub CLI

With [`gh`](https://cli.github.com) signed in to your GitHub account, create `upcloud` with you as its reviewer, limited to `main`:

```bash
gh api --method PUT repos/<owner>/<repo>/environments/upcloud --input - <<JSON
{"reviewers": [{"type": "User", "id": $(gh api user --jq .id)}], "prevent_self_review": false, "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
JSON
```

```bash
gh api --method POST repos/<owner>/<repo>/environments/upcloud/deployment-branch-policies -f name=main -f type=branch
```

Then `upcloud-cleanup`, with no reviewers, limited to `main`:

```bash
gh api --method PUT repos/<owner>/<repo>/environments/upcloud-cleanup -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'
```

```bash
gh api --method POST repos/<owner>/<repo>/environments/upcloud-cleanup/deployment-branch-policies -f name=main -f type=branch
```

Either way, **Settings** → **Environments** now lists `upcloud`, with you as its reviewer and the branch rule `main`, and `upcloud-cleanup`, with only the branch rule `main`.

### Create the API tokens and add them

The account from step 3 gets two tokens: `paranoid-github-deploy` for `upcloud`, and `paranoid-github-cleanup` for `upcloud-cleanup`. Both can do the same things. UpCloud's permissions decide which servers and storages an account can reach, not what it may do with them, so a token that can delete servers can also create them. So the cleanup token could create servers too, but only the code on your fork's `main` ever gets it, and that code only deletes. A token for each environment still lets you revoke one without the other.

Create the first token:

1. Log in to the Control Panel **as the account from step 3**, not your own. Use a private browser window.
2. Go to **Workspace settings** → **API tokens** (A), or **Account** → **API tokens** (B), and click **Add new API token**.
3. Fill in:
   - **Name:** `paranoid-github-deploy`.
   - **Expiration:** 90 days is a good choice. 365 days is the most UpCloud allows. Put a reminder in your calendar a week before, to [replace the tokens](#the-credentials).
   - **Allow token to create tokens:** off.
   - **Allowed IP ranges:** tick **Allow access from all IP addresses**. GitHub's runners have different addresses every time, so an IP limit would make every deploy fail.
4. Click **Create API token**. **UpCloud shows the token only once.** It starts with `ucat_`. Keep this page open and add it to GitHub right away. Don't save the token in a file, a note, a password manager entry you'll forget, a chat or an email.

Add it to `upcloud`, in GitHub's website or with `gh`:

- **Website:** in your fork, go to **Settings** → **Environments** → **upcloud**. Under **Environment secrets**, click **Add environment secret**. Name it `UPCLOUD_TOKEN`, paste the token as its value and click **Add secret**.
- **`gh`:** run the command below. It asks for the token at a prompt, so it never appears on the command line or in your shell history. Don't use `--body`.

  ```bash
  gh secret set UPCLOUD_TOKEN --env upcloud --repo <owner>/<repo>
  ```

Then create the second token the same way, named `paranoid-github-cleanup`, with the same expiration, and add it to `upcloud-cleanup` as its `UPCLOUD_TOKEN`:

```bash
gh secret set UPCLOUD_TOKEN --env upcloud-cleanup --repo <owner>/<repo>
```

**Settings** → **Environments** → each environment now shows the secret `UPCLOUD_TOKEN`. GitHub never shows a secret's value again. Close the UpCloud page with the tokens.

For B, once both tokens are in GitHub, you can go back to your own login and turn **Allow access to Control Panel** off for the sub-account. The tokens keep the sub-account's server and storage permissions.

### Keep the workflow logs for 1 day

Your fork is public, so anyone signed in to GitHub can read its workflow runs and their logs. The workflows print nothing secret: GitHub hides the tokens' values, and the scripts never print what UpCloud returns. The logs still show your server's address and when it ran, so keep them only as long as you need them:

1. In your fork, go to **Settings** → **Actions** → **General**.
2. Under **Check, workflow run, status, artifact and log retention**, enter `1`, and click **Save**.

GitHub then deletes each run, with its logs, a day after it ran. The setting applies only to runs after you save it. To remove an earlier run's logs, or a run's logs at once, open the run in the **Actions** tab, click **…** (**Show workflow options**) in the top right corner, then **Delete all logs**.

## 5. Optional settings

Everything works with the defaults. The settings every provider shares, `MAX_INVITES`, `LIFETIME_MINUTES`, `MAX_EGRESS_MBIT` and `MAX_DEPLOY_COST_USD`, are in [Deploying Paranoid's shared variables](README.md#shared-repository-variables). The **Deploy to UpCloud** workflow's inputs win over the variables, and the variables over the defaults.

To change one, add a repository variable in **Settings** → **Secrets and variables** → **Actions** → **Variables** → **New repository variable**, or with `gh`, for example:

```bash
gh variable set UPCLOUD_ZONE --body de-fra1 --repo <owner>/<repo>
```

UpCloud's own settings:

| Name               | Default                        | What it does                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UPCLOUD_ZONE`     | `fi-hel1`                      | [Zone](https://upcloud.com/docs/getting-started/locations/). In the EU: `fi-hel1`, `fi-hel2`, `de-fra1`, `nl-ams1`, `dk-cph1`, `se-sto1`, `pl-waw1`, `es-mad1`. Other zones are refused, as they're not in [`prices.json`](../../deploy/upcloud/prices.json). |
| `UPCLOUD_PLAN`     | `STARTER-1xCPU-1GB`            | [Plan](https://upcloud.com/docs/products/cloud-servers/configurations/): `STARTER-1xCPU-1GB`, `STARTER-1xCPU-2GB` or `PREMIUM-1xCPU-1GB`, the plans in [`prices.json`](../../deploy/upcloud/prices.json). The default is the cheapest. See [Costs](#costs).   |
| `UPCLOUD_TEMPLATE` | `Debian GNU/Linux 13 (Trixie)` | UpCloud's Debian image with cloud-init. Change it only if UpCloud renames it.                                                                                                                                                                                 |

The only secrets are the two `UPCLOUD_TOKEN`s. Never put a token or password in a variable: variables are shown in logs and to anyone with access to the repository.

The app uses Google's STUN servers unless `VITE_ICE_SERVERS` in [`packages/client-app/.env`](../../packages/client-app/.env) says otherwise. To use your own, change it in your fork and commit it. It isn't a secret: it's built into the app that every visitor downloads.

## 6. Start a server

1. In your fork, go to **Actions** → **Deploy to UpCloud** → **Run workflow**.
2. Keep **Use workflow from** on `main`. Optionally fill in the number of invites and the lifetime. Click **Run workflow**.
3. Click the run that appears. It waits for your approval, and GitHub emails you about it. Click **Review deployments**, tick `upcloud` and click **Approve and deploy**. Nothing is created and nothing costs anything until you approve it, and the server's lifetime starts only then.
4. Setting up the server takes a few minutes, because it installs and builds the app itself.
5. When the run is green, its **Summary** shows the URL, `https://<ip-with-dashes>.sslip.io`, and when the server shuts down at the latest.

Or with `gh`:

```bash
gh workflow run deploy-upcloud.yml --ref main --repo <owner>/<repo> -f max_invites=5 -f lifetime_minutes=60
```

Then approve it on the run's page, as above. A deploy that's waiting for approval can wait up to 30 days. To drop it, click **Reject** instead, or **Cancel workflow**.

Open the URL, create an invite and open it in a second browser or on another device. The chat starts once both are connected.

Anyone who has the URL can create invites, which use up `max_invites`. In a public fork, anyone signed in to GitHub can read the run summary until the run is deleted (see [Keep the workflow logs for 1 day](#keep-the-workflow-logs-for-1-day)).

## 7. Stop it, and how it's cleaned up

- **Stop it now:** **Actions** → **Stop UpCloud** → **Run workflow** on `main` deletes every Paranoid server and its storage right away, with no approval needed. It also cancels a deploy that's running or waiting for approval. Chats that have started keep working. Or: `gh workflow run stop-upcloud.yml --ref main --repo <owner>/<repo>`.
- **On its own:** the server powers off once the last invite is finished, or at the end of its lifetime. A powered-off server is still billed, so the **Clean up UpCloud** workflow runs every hour and deletes every Paranoid server that's off or past its lifetime, with its storage. You can also run it by hand from the Actions tab.

Starting **Deploy to UpCloud** again first deletes any Paranoid server that's left, so there's only ever one.

GitHub can delay scheduled workflows, sometimes by more than an hour, and turns them off in a repository that has had no activity for 60 days. If Clean up UpCloud doesn't run, a powered-off server stays until you run Stop UpCloud or Clean up UpCloud by hand. The most it can then cost is in [Costs](#costs).

## Costs

Checked on 2026-11-20 on [UpCloud's pricing page](https://upcloud.com/pricing/) and in [UpCloud's docs](https://upcloud.com/docs/products/cloud-servers/configurations/). Prices exclude VAT.

| Plan                             | CPU and memory | Disk          | Per month at most | Per hour | Billed while off |
| -------------------------------- | -------------- | ------------- | ----------------- | -------- | ---------------- |
| `STARTER-1xCPU-1GB`, the default | 1 core, 1 GB   | 10 GB         | €3                | €0.0045  | Yes              |
| `STARTER-1xCPU-2GB`              | 1 core, 2 GB   | 20 GB         | €6                | €0.0089  | Yes              |
| `PREMIUM-1xCPU-1GB`              | 1 core, 1 GB   | 25 GB MaxIOPS | €5                | €0.0074  | Yes              |

- **Hourly, with a monthly cap.** UpCloud bills by the starting hour, and never more than 672 hours (28 days) a month. The hourly price is the monthly price divided by 672.
- **Starter and Premium plans include the disk and one IPv4 address**, and are billed the same whether the server is on or off, until it's deleted. These three are the only plans a deploy accepts: other plans bill their disk and IPv4 address separately, which the cost check doesn't cover.
- **Prices are the same in every zone**, and the deploy only accepts the EU zones listed in [Optional settings](#5-optional-settings).
- **The worst case for one deploy**, which **Deploy to UpCloud** checks before it creates anything: every started hour of the lifetime, plus 2 hours until Clean up UpCloud deletes the server, at the plan's price. Outbound traffic is free. The check works in US dollars, so [`prices.json`](../../deploy/upcloud/prices.json) holds UpCloud's euro prices converted at the European Central Bank's rate for 2026-11-20, 1.0990 dollars to the euro. With the default plan and `MAX_DEPLOY_COST_USD` of 1:
  - 60 minutes, the default: $0.0148;
  - 24 hours, the most: $0.1276, so every lifetime fits.

  If a deploy would cost more than the limit, it stops with "The worst case … is more than the limit" and the longest lifetime that fits.

- **Worst case for a month:** there's only ever one server, so even if Clean up UpCloud never runs, the most it can cost is one month of its plan: **€3** with the default.
- **A typical deploy** of an hour costs less than one cent.
- **Network traffic is free.** UpCloud charges nothing for inbound or outbound traffic, under its [Fair Transfer Policy](https://upcloud.com/docs/products/networking/network-transfer/): `STARTER-1xCPU-1GB` adds 0.5 TiB a month to your account's allowance, counted for the time the server exists. Past the allowance, UpCloud emails a warning and may slow the server to 100 Mbit/s, but doesn't charge more. `MAX_EGRESS_MBIT` keeps a server far below it.
- **The firewall** costs nothing.

### How the prepaid balance works

UpCloud takes each hour's cost from your balance (see [Account balance](https://upcloud.com/docs/getting-started/accounts/account-balance/)). Without automated payments, UpCloud can't take more money from you than you added, but **the balance can go below zero**:

- UpCloud emails you when the balance is about to run out.
- When it runs out, UpCloud shuts down all servers. Disks and IP addresses keep being charged, so the balance goes negative, and your next payment first pays that back.
- After a month, UpCloud deletes the servers. After two months, it deletes the disks.

So keep the balance small, such as the €10 minimum, leave automated payments off, and use Stop UpCloud or Clean up UpCloud to delete what's left.

### Where to see usage and billing

In the Control Panel, **Account** → **Billing** (in a workspace, its **Billing** tab) shows your balance, payments and what each resource has cost.

## Checking nothing is left

In the Control Panel, check that:

- **Servers** lists no server named `paranoid-<number>`;
- **Storage** lists no disk named `paranoid-<number>-OS`;
- **Network** → **IP addresses** lists no address that belonged to one of them. A server's IP address is released when it's deleted.

If something is left, run **Stop UpCloud**, or delete it in the Control Panel: stop the server, then delete it together with its storage.

## The credentials

The two `UPCLOUD_TOKEN` secrets are the only secrets, and they're never in the repository:

- One is a secret of the `upcloud` environment, used only by **Deploy to UpCloud**, which waits for your approval. The other is a secret of `upcloud-cleanup`, used by **Stop UpCloud** and **Clean up UpCloud**, which only delete servers. Only `main` can use either environment.
- The workflows run only when started by hand or on their schedule, never from a pull request, so no pull request or fork can reach it.
- Only the steps that call UpCloud's command-line tool, `upctl`, get it. Nothing writes it to disk or prints it, and GitHub hides it in logs.
- The server never gets it. It isn't in the server's setup data, its labels or the run summary. The server doesn't use UpCloud's API: it only powers itself off, and GitHub Actions deletes it.

**When they expire,** deploys, stops and cleanups fail with an authentication error. Create new tokens as in [step 4](#create-the-api-tokens-and-add-them), then replace each secret: in **Settings** → **Environments** → **upcloud**, and then **upcloud-cleanup**, click the pencil next to `UPCLOUD_TOKEN`, or run `gh secret set UPCLOUD_TOKEN --env upcloud --repo <owner>/<repo>` and `gh secret set UPCLOUD_TOKEN --env upcloud-cleanup --repo <owner>/<repo>` again. Then delete the old tokens in UpCloud.

**If it may have leaked,** for example it was pasted somewhere or committed:

1. **Revoke it first:** log in as the account from step 3, go to **API tokens** and click **Delete** next to it, `paranoid-github-deploy` or `paranoid-github-cleanup`. It stops working within a minute. If you don't know which one leaked, revoke both.
2. Check **Servers** and **Storage** for anything you didn't create, and delete it.
3. Create a new token and replace its secret as above.

A token that was committed to git stays in the history even after the file is changed, so revoking it is what matters.

## Troubleshooting

The run's log says which step failed and why. There's no SSH, so you can't log in to a server to look.

| What you see                                                                                | What to do                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The upcloud environment has no UPCLOUD_TOKEN secret", or the same for upcloud-cleanup      | Add the secret as in [step 4](#create-the-api-tokens-and-add-them). Check the name, `UPCLOUD_TOKEN`, and that it's an **environment** secret of the environment the message names, not a repository secret.                                                   |
| An authentication error from `upctl`, such as 401                                           | The token is wrong, expired or deleted. Create a new one and replace the secret.                                                                                                                                                                              |
| A deploy waits, and its page asks for a review                                              | It waits for your approval: click **Review deployments**, tick `upcloud` and click **Approve and deploy**. If you can't approve it, check that you're the environment's required reviewer and that **Prevent self-review** is off.                            |
| "Branch is not allowed to deploy to upcloud", or the same for upcloud-cleanup               | You started the workflow on another branch. Start it on `main`. Check the environment's deployment branch rule says `main`.                                                                                                                                   |
| Clean up UpCloud or Stop UpCloud waits for a review                                         | `upcloud-cleanup` has a required reviewer. Remove it: these two workflows must run without approval.                                                                                                                                                          |
| The workflows don't appear, or don't run                                                    | Actions are off in the fork: enable them in the **Actions** tab.                                                                                                                                                                                              |
| A permission error such as 403 when creating or deleting a server, storage or firewall rule | The account from step 3 lacks a permission. Give it all servers and all storages. For B, if you turned off **Allow access to Control Panel** and the error started then, turn it back on.                                                                     |
| "Not enough credits", or the account can't create servers                                   | Add balance as in step 2. During the trial, some zones aren't available: pay €10 to upgrade.                                                                                                                                                                  |
| Creating firewall rules fails during the trial                                              | UpCloud locks the firewall during the trial. Pay €10 to upgrade the account.                                                                                                                                                                                  |
| "The worst case … is more than the limit"                                                   | The deploy refused before creating anything. Choose a lifetime no longer than the one the message gives, or raise `MAX_DEPLOY_COST_USD`. See [Costs](#costs).                                                                                                 |
| "Price file … has no prices for" a zone, or "has no price for" a plan                       | The deploy only accepts the EU zones and the plans in [`prices.json`](../../deploy/upcloud/prices.json). Set `UPCLOUD_ZONE` or `UPCLOUD_PLAN` to one of them.                                                                                                 |
| A plan or template isn't found                                                              | UpCloud may have renamed it. Run `upctl server plans` or check the [plans](https://upcloud.com/docs/products/cloud-servers/configurations/), and set `UPCLOUD_PLAN` or `UPCLOUD_TEMPLATE`.                                                                    |
| "The app didn't come up in time"                                                            | The server took too long to set up, or its setup failed. The deploy deleted it. The message gives the last reason, for example "Couldn't connect", which means the server never got as far as starting its web server. Run Deploy again, or try another zone. |
| "HTTPS certificate problem"                                                                 | Let's Encrypt didn't give a certificate for the hostname. It allows only 5 certificates a week for the same hostname, which happens if you deploy many times in a week and get the same IP address. Wait, or try another zone to get another address.         |
| Servers stay after shutting down                                                            | Clean up UpCloud isn't running: GitHub delays scheduled runs, and turns them off after 60 days without activity. Open **Actions** → **Clean up UpCloud**, enable it if GitHub disabled it, and run it by hand.                                                |

## Removing everything

1. Run **Stop UpCloud**, then [check nothing is left](#checking-nothing-is-left). The firewall rules belong to the server and go with it.
2. Delete both tokens: as the account from step 3, **API tokens** → **Delete**.
3. Delete the account from step 3: the workspace member, or the sub-account in **People**. If you made a workspace only for Paranoid, you can delete it.
4. In your fork, delete both environments: **Settings** → **Environments** → **upcloud** → **Delete environment**, then the same for **upcloud-cleanup**. That deletes their secrets too.
5. If you want to close your UpCloud account, ask UpCloud's support in the Control Panel. Any balance that's left isn't refunded, apart from the 30-day money-back guarantee on the first payment. An account you stop using is also [removed after a period of inactivity](https://upcloud.com/docs/getting-started/accounts/account-removal/).

## Privacy

The server keeps no access logs. Its own logs hold only connections and errors, in memory, and go when it's deleted. Nothing is stored anywhere else, and deleting the server deletes its disk. What remains visible to others:

- **UpCloud**, as the network provider, can see which IP addresses connect to the server, but not message contents.
- **Google's STUN servers**, the default, see your users' IP addresses when their browsers find a way to connect. `VITE_ICE_SERVERS` can point to another one.
- **sslip.io** turns the hostname into the IP address, so it sees the lookups. It and **Let's Encrypt's public Certificate Transparency logs** reveal the server's IP-based hostname, but not who uses it.
- **GitHub**: in a public fork, anyone signed in to GitHub can read the run summary with the URL, and the logs, until the run is deleted. With [log retention at 1 day](#keep-the-workflow-logs-for-1-day), that is a day after the run.

## What a deploy does

[`deploy-upcloud.yml`](../../.github/workflows/deploy-upcloud.yml):

1. Checks the settings, before it changes anything.
2. Works out the worst-case cost from [`prices.json`](../../deploy/upcloud/prices.json), with the shared [`packages/deploy`](../../packages/deploy/src/cli.ts), and stops if it's above `MAX_DEPLOY_COST_USD`, or if the zone or plan isn't in the price file.
3. Installs `upctl` 3.37.0, UpCloud's command-line tool, from its release, after checking its checksum.
4. Deletes any existing Paranoid server, running or off, with its storage.
5. Creates a server named `paranoid-<run id>`, with the labels `app=paranoid`, `run`, `created` and `expires` (the Unix times it was created and its lifetime ends), and [`deploy/server/cloud-init.yaml`](../../deploy/server/cloud-init.yaml) as its setup data. It has only a public IPv4 address, and its login is a throwaway SSH key whose private half is deleted at once, so UpCloud sets and sends no root password.
6. Sets the server's firewall ([`firewall-rules.sh`](../../deploy/upcloud/firewall-rules.sh)). UpCloud's firewall is stateless, so besides new connections on TCP 80 and 443 it lets in only the answers the server needs: DNS from UpCloud's resolvers, and HTTP, HTTPS and time-server answers to the ports Linux uses for its own outgoing connections. Everything else is dropped, port 22 included.
7. Waits up to 10 minutes for `https://<host>/healthz` and a socket.io handshake. If they don't come up, it deletes the server and fails, with the reason from the last attempt.

On the server, cloud-init turns off SSH, locks root's password and sets a timer that powers off at the end of the lifetime. It then fetches exactly the deployed commit from the public repository with `git`, which checks every file against its hash, so the server needs no credentials. [`deploy/server/setup.sh`](../../deploy/server/setup.sh) from that commit does the rest:

- installs Node.js 24 and Caddy from pinned releases, after checking their checksums;
- runs `pnpm install --frozen-lockfile` and builds the app with `VITE_SIGNALING_SERVER=/`, as a user of its own, with a temporary swap file on a 1 GB server;
- starts the signaling server as a locked-down systemd service on `127.0.0.1` only, with `MAX_INVITES`. When it exits because its last invite is finished, the server powers off;
- starts Caddy, which gets a Let's Encrypt certificate for `<ip-with-dashes>.sslip.io`, serves the app and passes `/socket.io/` and `/healthz` to the signaling server;
- limits all outbound traffic to `MAX_EGRESS_MBIT` with `tc`.

[`cleanup-upcloud.yml`](../../.github/workflows/cleanup-upcloud.yml) runs every hour on the default branch, which can't use the `upcloud-cleanup` environment, so it starts itself on `main`, which can. It deletes only servers that are past their lifetime, or off and created at least 15 minutes ago, so it never deletes a server that a deploy is still creating or setting up, and it can run at the same time as a deploy. Deleting a server deletes its disk too, and releases its IP address. In case a failed create or delete left a disk behind, Stop UpCloud, Clean up UpCloud and a failed deploy also delete any disk named `paranoid-<run id>-OS` that is attached to no server and whose server doesn't exist. Clean up UpCloud skips the disks of deploys that haven't finished, since one of them may be creating its server, and deletes no such disks if it can't tell which deploys those are. [`stop-upcloud.yml`](../../.github/workflows/stop-upcloud.yml) deletes every Paranoid server right away. Deploy and Stop share a concurrency group, so a deploy waits for the one before it, and Stop UpCloud cancels a deploy that's running or waiting for approval. A running deploy then deletes its own server.
