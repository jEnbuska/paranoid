# Deploy Paranoid to Google Cloud

This guide takes you from a GitHub account to your own Paranoid server on [Google Cloud](https://cloud.google.com), in Finland by default. You need no Google Cloud experience, and you never log in to a server.

You start a server from GitHub Actions for a set number of invites. It powers itself off once the last invite is finished, a scheduled workflow then deletes it, and Google Cloud deletes it at the end of its lifetime whatever happens. Nothing runs between uses. Chats that have started keep working after the server is gone, because they're peer to peer.

**There's no secret to keep.** GitHub Actions signs in to Google Cloud with Workload Identity Federation (explained below), so no password, key or token is stored anywhere, not even in GitHub.

**There are two spending limits.** Before each deploy, the workflow works out the most the deployment could cost, and doesn't start it if that's more than $1, every provider's limit for one deploy, or more than what's left of Google Cloud's own limit for the month, $5 by default.

Google's prices and rules below were checked on 2026-11-20. They can change, so check the linked pages too. How deploying works on every provider, and the settings they share, are in [Deploying Paranoid](README.md).

## What this deployment needs

Everything this deployment needs from GitHub, by name. It also reads the [shared repository variables](README.md#shared-repository-variables).

### Environments

| Environment   | Branches    | Required reviewers | Used by                           |
| ------------- | ----------- | ------------------ | --------------------------------- |
| `gcp`         | `main` only | You                | `deploy-gcp.yml`                  |
| `gcp-cleanup` | `main` only | None               | `cleanup-gcp.yml`, `stop-gcp.yml` |

### Secrets

No secrets. GitHub Actions signs in to Google Cloud with Workload Identity Federation: Google Cloud trusts GitHub's short-lived token for your fork's `main` branch, so there's no key or token to keep anywhere.

### Variables

| Variable                         | Set in                               | What it does                                                                                                                   | Required | Default | Explained in                                |
| -------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------- | ------- | ------------------------------------------- |
| `GCP_PROJECT`                    | Environments `gcp` and `gcp-cleanup` | The Google Cloud project's ID.                                                                                                 | Required |         | [Step 5](#5-connect-your-fork)              |
| `GCP_REGION`                     | Repository                           | The region the VM runs in, such as `europe-north1`. It must have prices in `deploy/gcp/prices.json`.                           | Required |         | [Step 4](#4-run-the-one-time-setup)         |
| `GCP_ZONE`                       | Repository                           | The zone in that region, such as `europe-north1-a`.                                                                            | Required |         | [Step 5](#5-connect-your-fork)              |
| `GCP_BUCKET`                     | Environments `gcp` and `gcp-cleanup` | The bucket that holds the month's ledger.                                                                                      | Required |         | [Step 5](#5-connect-your-fork)              |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Environments `gcp` and `gcp-cleanup` | The Workload Identity provider that trusts your fork's `main` branch.                                                          | Required |         | [Step 5](#5-connect-your-fork)              |
| `GCP_SERVICE_ACCOUNT`            | Environments `gcp` and `gcp-cleanup` | The service account each environment acts as: `paranoid-deploy` in `gcp`, the delete-only `paranoid-cleanup` in `gcp-cleanup`. | Required |         | [Step 5](#5-connect-your-fork)              |
| `GCP_MONTHLY_BUDGET_USD`         | Repository                           | Google Cloud's own limit for the month's total, in US dollars, on top of the shared `MAX_DEPLOY_COST_USD`.                     | Optional | `5`     | [The spending limits](#the-spending-limits) |

The setup script prints the commands that set all of them, in [step 4](#4-run-the-one-time-setup).

## Contents

1. [Words used in this guide](#words-used-in-this-guide)
2. [Fork the repository](#1-fork-the-repository)
3. [Sign up for Google Cloud](#2-sign-up-for-google-cloud)
4. [Prepare the account](#3-prepare-the-account)
5. [Run the one-time setup](#4-run-the-one-time-setup)
6. [Connect your fork](#5-connect-your-fork)
7. [Optional settings](#6-optional-settings)
8. [Start a server](#7-start-a-server)
9. [Stop it, and how it's cleaned up](#8-stop-it-and-how-its-cleaned-up)
10. [Costs](#costs)
11. [The spending limits](#the-spending-limits)
12. [Checking nothing is left](#checking-nothing-is-left)
13. [The credentials](#the-credentials)
14. [Troubleshooting](#troubleshooting)
15. [Removing everything](#removing-everything)
16. [Privacy](#privacy)
17. [What a deploy does](#what-a-deploy-does)

## Words used in this guide

- **Console:** Google Cloud's website for managing your account, at [console.cloud.google.com](https://console.cloud.google.com).
- **Billing account:** where Google Cloud sends the bill, with your payment method. Every project that costs money is linked to one.
- **Project:** a container for everything you create in Google Cloud, with its own settings and permissions. Use one only for Paranoid, so it's easy to see what it costs and to delete it all.
- **VM (virtual machine):** a virtual computer in Google's data center. Google calls the service Compute Engine. Paranoid uses the smallest, `e2-micro`: 2 shared CPU cores and 1 GB of memory.
- **Region and zone:** a region is a place with data centers, for example `europe-north1` in Hamina, Finland. A zone is one data center in it, for example `europe-north1-a`.
- **Disk:** the VM's storage. It's billed while it exists, even when the VM is off, until it's deleted.
- **Egress:** traffic going out of Google Cloud to the internet, such as the app's files on their way to your users. Google charges for it by the gigabyte.
- **Service account:** a login for a program rather than a person. GitHub Actions uses two: `paranoid-deploy`, which can only do what a Paranoid deploy needs, and `paranoid-cleanup`, which can only delete Paranoid's VMs.
- **Role:** a set of permissions, such as "create VMs". The setup makes custom roles with only the permissions Paranoid needs.
- **Workload Identity Federation:** lets GitHub Actions act as the service account without a key. For each run, GitHub gives the run a short-lived signed token saying which repository, branch and environment it's from. Google Cloud checks it, and only accepts runs of your fork's `main` branch in its `gcp` or `gcp-cleanup` environment, each as its own service account.
- **Bucket:** a folder in Google's file storage, Cloud Storage. Paranoid's holds only the spending limit's ledger.
- **GitHub environment:** a named set of settings in your fork that only chosen branches can use, and that can make a run wait for someone's approval. There are two, and only `main` can use them: `gcp` for deploys, which wait for your approval, and `gcp-cleanup` for stopping and cleaning up, which don't.

## 1. Fork the repository

1. Open [github.com/jEnbuska/paranoid](https://github.com/jEnbuska/paranoid) and click **Fork**, then **Create fork**.
2. In your fork, open the **Actions** tab. GitHub turns workflows off in new forks: click **I understand my workflows, go ahead and enable them**.

You should see the workflows **Deploy to Google Cloud**, **Stop Google Cloud** and **Clean up Google Cloud** in the list on the left, among others.

The rest of this guide writes your fork as `<owner>/<repo>`, for example `alex/paranoid`.

## 2. Sign up for Google Cloud

1. Open [console.cloud.google.com](https://console.cloud.google.com) and sign in with a Google account. A new one only for this is a good idea.
2. Click **Start free** (or **Activate**, **Try for free**). Google asks for your country, whether the account is for an individual or a business, and a payment method.
   - Google needs a payment method even for the free trial: "a credit card or other payment method", and in some countries a check of your bank account. It's used to check your identity and against fraud, with a temporary hold of up to $1 that isn't charged.
   - The **free trial** gives $300 of credit for 90 days, to new customers only. While it lasts, Google doesn't charge your payment method. When the credit is spent or the 90 days are over, the trial's billing account closes and your VMs are stopped, unless you **Activate** a full account yourself. Google doesn't do that for you. See [Google's free trial and free tier](https://cloud.google.com/free/docs/free-cloud-features).
   - The **free tier** is separate and has no end date. It covers one `e2-micro` VM's hours a month and 30 GB of standard disk, but **only in the US regions** `us-west1`, `us-central1` and `us-east1`. Paranoid's default region is in Finland, so the free tier doesn't cover it. See [Costs](#costs).
3. You should land in the console, with a project called **My First Project** and a billing account. You can leave that project alone.

## 3. Prepare the account

Two things before the setup: a project of its own for Paranoid, and the command-line tools on your computer.

### Create a project

1. In the console, click the project picker at the top, then **New project**.
2. Name it, for example `paranoid`. Under the name, Google shows the **project ID**, which must be unique across Google Cloud, for example `paranoid-482113`. Click **Edit** to choose another. Write the ID down: the rest of this guide writes it as `<project-id>`.
3. Click **Create**.
4. Open **Billing** in the menu (☰). If the new project isn't linked to your billing account, click **Link a billing account** and choose it.

You should see `<project-id>` in the project picker, and **Billing** → **Account management** should list it under your billing account.

### Install the command-line tools

You run the setup once, from your own computer, with two command-line tools:

- **gcloud**, Google Cloud's: install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install), then sign in. A browser window opens for you to sign in with your Google account:

  ```bash
  gcloud auth login
  ```

- **gh**, GitHub's: install the [GitHub CLI](https://cli.github.com), then sign in:

  ```bash
  gh auth login
  ```

Clone your fork, so you have the setup script:

```bash
gh repo clone <owner>/<repo>
```

```bash
cd <repo>
```

## 4. Run the one-time setup

```bash
deploy/gcp/bootstrap.sh <project-id> <owner>/<repo>
```

It takes a few minutes. Running it again is safe, so if something fails halfway, fix it and run it again. It sets up, in your project:

- the Google Cloud services Paranoid uses (Compute Engine, IAM, Cloud Storage and a few for signing in and budgets). Turning them on costs nothing;
- a network of its own, `paranoid`, that lets in only web traffic (HTTP and HTTPS), and nothing else, not even SSH;
- a bucket, `<project-id>-paranoid`, for the spending limit's ledger;
- the service accounts `paranoid-deploy` and `paranoid-cleanup`, with only the permissions in [What the setup grants](#what-the-setup-grants-and-why);
- Workload Identity Federation for your fork's `main` branch: its `gcp` environment as `paranoid-deploy`, and its `gcp-cleanup` environment as `paranoid-cleanup`;
- a budget alert of $5 a month that emails you at 50%, 90% and 100%. It's in your billing account's currency, so in euros if that's what you pay in.

Nothing it creates costs money while no VM runs, apart from a fraction of a cent a month for the ledger.

Optionally, give it a region and a monthly limit for the alert, for example `us-central1` and 10:

```bash
deploy/gcp/bootstrap.sh <project-id> <owner>/<repo> us-central1 10
```

The regions it knows the prices of are `europe-north1` (Finland, the default), `europe-west1` (Belgium), and the free tier's `us-central1` (Iowa), `us-east1` (South Carolina) and `us-west1` (Oregon). For another region, add its prices to [`deploy/gcp/prices.json`](../../deploy/gcp/prices.json) first.

At the end it prints the commands for the next step. The budget alert may fail with a permission error if you aren't the billing account's administrator. Then create it in the console instead: **Billing** → **Budgets & alerts** → **Create budget**, scoped to `<project-id>`, with a monthly amount.

## 5. Connect your fork

Copy the commands the setup script printed and run them. Then check the result: **Settings** → **Environments** lists `gcp`, with **1 reviewer** and the branch rule `main`, and `gcp-cleanup`, with the branch rule `main`. Neither has any secrets.

### The environments

The commands create two environments. Only your fork's `main` branch can use either:

- `gcp`, for deploys. You're its **required reviewer**, so every deploy waits until you approve it. **Prevent self-review** is off, so you can approve the runs you start yourself.
- `gcp-cleanup`, for Stop and the hourly cleanup. It doesn't wait for anyone, because those runs can only delete. If they waited for approval, a powered-off VM would stay billed until you noticed.

Only people with write access to your fork can start a workflow, which is usually just you. The required reviewer makes sure of it: a deploy doesn't start, and can't sign in to Google Cloud, until you click **Approve and deploy**. Google Cloud only accepts sign-ins from runs in the `gcp` environment as `paranoid-deploy`, so a run can't skip the approval and still reach your project.

### The credentials in them

There's no secret to add: see [The credentials](#the-credentials). Instead, each environment gets the variables that say who signs in, and to what. These identity values are environment variables, never repository variables, so only a run in that environment can read them:

- `GCP_PROJECT`, `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_BUCKET`, the same in both;
- `GCP_SERVICE_ACCOUNT`, one name with a different value in each: `paranoid-deploy` in `gcp`, and the delete-only `paranoid-cleanup` in `gcp-cleanup`.

Where the server runs and the monthly limit, `GCP_REGION`, `GCP_ZONE` and `GCP_MONTHLY_BUDGET_USD`, are repository variables, like every provider's tuning and limits.

None of these values is a secret. They say where things are, and Google Cloud only lets your fork's `main` branch use them.

### Log retention

Your fork is public, so **everything its workflows print is public**: anyone can open the **Actions** tab and read a run's log and summary, with the server's URL. The workflows print nothing secret, because there's nothing secret to print, but a log still says when you ran a server and where. The commands keep your fork's logs for 1 day, the shortest GitHub allows, so GitHub deletes them a day after each run.

### Keep your fork public

GitHub only offers all of this in a public repository ([Managing environments for deployment](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)):

- **A public fork**, on any plan: both protections, the `main` limit and your approval of every deploy.
- **A private copy on GitHub Pro or Team:** the `main` limit, but no approval. Required reviewers work only in public repositories on those plans, so deploys start without waiting for you.
- **A private copy on GitHub Free:** no environments at all, so no `gcp` or `gcp-cleanup`, and no `GCP_SERVICE_ACCOUNT` in them. Nothing runs unprotected: no deploy, Stop or cleanup can sign in to Google Cloud.

Whatever the plan, Google Cloud only accepts a sign-in from a run of your fork's `main` branch whose token says it's in the `gcp` or `gcp-cleanup` environment, and only a `gcp` run can act as `paranoid-deploy`. A run without an environment is refused.

### Or in GitHub's website

In your fork:

1. **Settings** → **Environments** → **New environment**, name it `gcp`, and click **Configure environment**.
   - Tick **Required reviewers**, type your GitHub username and choose yourself.
   - Untick **Prevent self-review**.
   - Under **Deployment branches and tags**, choose **Selected branches and tags**, click **Add deployment branch or tag rule**, enter `main` and click **Add rule**.
   - Click **Save protection rules**.
   - Under **Environment variables**, click **Add environment variable** for `GCP_PROJECT`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_BUCKET` and `GCP_SERVICE_ACCOUNT`, with the values the script printed for `gcp`.
2. **Settings** → **Environments** → **New environment**, name it `gcp-cleanup`, and click **Configure environment**.
   - Leave **Required reviewers** off.
   - Under **Deployment branches and tags**, choose **Selected branches and tags** and add `main`, as above.
   - Add the same four environment variables, with the values the script printed for `gcp-cleanup`.
3. **Settings** → **Actions** → **General**. Under **Artifact and log retention**, enter `1` and click **Save**.
4. **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**, for `GCP_REGION`, `GCP_ZONE` and `GCP_MONTHLY_BUDGET_USD`.

## 6. Optional settings

Everything works with the defaults. The settings every provider shares, the number of invites, the lifetime, the outbound limit and the cost limit for one deploy (`MAX_INVITES`, `LIFETIME_MINUTES`, `MAX_EGRESS_MBIT` and `MAX_DEPLOY_COST_USD`), are repository variables explained in [the shared table](README.md#shared-repository-variables). For example:

```bash
gh variable set LIFETIME_MINUTES --body 120 --repo <owner>/<repo>
```

The **Deploy to Google Cloud** workflow's inputs win over the variables, and the variables over the defaults. With the defaults, `MAX_DEPLOY_COST_USD`'s $1 allows a lifetime of up to about 11 hours: at 2 Mbit/s, the worst case is about $0.09 an hour, mostly outbound traffic.

Google Cloud's own settings:

| Name                     | Default | What it does                                                                                                                                                                                                    |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GCP_MONTHLY_BUDGET_USD` | `5`     | Google Cloud's [limit for the month](#the-spending-limits), in US dollars, a repository variable like every limit. A deployment whose worst case doesn't fit what's left of the month's limit isn't started.    |
| `GCP_REGION`             |         | Set by the setup script. To change the region, run the setup script again with the new one and set the variables it prints: the network, the zone and the deploy permissions belong to the region and its zone. |

The app uses Google's STUN servers unless `VITE_ICE_SERVERS` in [`packages/client-app/.env`](../../packages/client-app/.env) says otherwise. To use your own, change it in your fork and commit it. It isn't a secret: it's built into the app that every visitor downloads.

## 7. Start a server

1. In your fork, go to **Actions** → **Deploy to Google Cloud** → **Run workflow**.
2. Keep **Use workflow from** on `main`. Optionally fill in the number of invites and the lifetime. Click **Run workflow**.
3. Click the run that appears. It says **Waiting for review**. Click **Review deployments**, tick **gcp** and click **Approve and deploy**. GitHub also emails you when a run is waiting. A waiting deploy doesn't hold up Stop or the hourly cleanup. A second deploy waits until the first is finished.
4. Setting up the server takes several minutes, because it installs and builds the app itself on a small VM.
5. When the run is green, its **Summary** shows the URL, `https://<ip-with-dashes>.sslip.io`, when Google Cloud deletes the server at the latest, and what it costs at most.

Or with `gh`:

```bash
gh workflow run deploy-gcp.yml --ref main --repo <owner>/<repo> -f max_invites=5 -f lifetime_minutes=60
```

and then approve it in the run's page, as above.

Open the URL, create an invite and open it in a second browser or on another device. The chat starts once both are connected.

Anyone who has the URL can create invites, which use up `max_invites`. In a public fork, anyone can read the run summary until its log is deleted, a day later. To delete it sooner, open the run, click **⋯** at the top right and **Delete all logs**.

## 8. Stop it, and how it's cleaned up

- **Stop it now:** **Actions** → **Stop Google Cloud** → **Run workflow** on `main` deletes every Paranoid VM and its disk right away, without waiting for approval. Chats that have started keep working. Or: `gh workflow run stop-gcp.yml --ref main --repo <owner>/<repo>`.
- **After the last invite:** the VM powers itself off. A powered-off VM no longer costs anything for its CPU or IP address, but its disk is still billed, so the **Clean up Google Cloud** workflow runs every hour and deletes every Paranoid VM that's off, or past its lifetime in case Google Cloud didn't delete it, with its disk. You can also run it by hand from the Actions tab.
- **At the end of its lifetime:** Google Cloud deletes the VM and its disk itself, even if invites are still open, its setup failed or GitHub is down.

Starting **Deploy to Google Cloud** again first deletes any Paranoid VM that's left, so there's only ever one.

GitHub can delay scheduled workflows, sometimes by more than an hour, and turns them off in a repository that has had no activity for 60 days. If Clean up Google Cloud doesn't run, a powered-off VM stays until you run Stop Google Cloud or Clean up Google Cloud by hand. Its disk then costs about 1.5 cents a day.

## Costs

Checked on 2026-11-20 on Google's pricing pages for [VMs](https://cloud.google.com/products/compute/pricing/general-purpose), [disks](https://cloud.google.com/compute/disks-image-pricing) and the [network](https://cloud.google.com/vpc/network-pricing), in US dollars, without VAT. If you pay in another currency, Google's prices in that currency apply.

What one Paranoid VM costs per hour in `europe-north1`, the default:

| Item                                             | Price                 | Per hour                   |
| ------------------------------------------------ | --------------------- | -------------------------- |
| `e2-micro` VM                                    | $0.0092 an hour       | $0.0092                    |
| External IPv4 address                            | $0.005 an hour        | $0.0050                    |
| 10 GB standard disk                              | $0.044 per GB a month | $0.0006                    |
| Outbound traffic, Standard Tier                  | $0.085 per GiB        | Up to $0.0712, at 2 Mbit/s |
| **Total, worst case**                            |                       | **$0.0861**                |
| **Total, typical** (a few chats, little traffic) |                       | **about $0.015**           |

- **Per deployment:** with the defaults, one hour, at most **$0.09**. With `max_invites`, it's usually deleted sooner, and costs less.
- **Per month:** at most the [spending limit](#the-spending-limits), **$5** by default: about 58 worst-case hours of servers. Typical use costs a few cents.
- **Outbound traffic** is the biggest part of the worst case. Standard Tier is the cheaper of Google's two network tiers. Its first 200 GiB a month per billing account are free, but the limit doesn't count on that, so the real cost is usually lower than the worst case.
- **Nothing is billed between deployments**: the network, its firewall rule, the service account, the roles and Workload Identity Federation are free. The ledger in the bucket is a few kilobytes, a fraction of a cent a month.
- **Google bills by the second**, with a minimum of one minute.

**In a free-tier region** (`us-central1`, `us-east1` or `us-west1`), the `e2-micro` VM and up to 30 GB of standard disk are free for one VM's worth of hours a month, counted across your billing account. The IPv4 address is still $0.005 an hour (the first hour a month is free), so a typical hour costs about half a cent. The free tier is only in the US, so the server, and Google's view of your users' IP addresses, would be in the US. Run the setup script with the region to use one, as in [step 4](#4-run-the-one-time-setup). The spending limit still counts the full price, to be safe.

**Another EU region**, such as `europe-west1` in Belgium, costs about the same as Finland.

### Where to see the bill

In the console, **Billing** → **Reports** shows what each service has cost, by day. Choose `<project-id>` under **Projects**. Billing data can lag by a day.

### A budget alert

The setup script creates a budget of $5 a month for the project, which emails your billing account's administrators at 50%, 90% and 100%. Find it in **Billing** → **Budgets & alerts**. A budget **doesn't stop anything**: it only sends emails, from billing data that lags by hours. The spending limit below is what keeps the cost down.

Google can also turn billing off for a project automatically when a budget is exceeded, with a small function you set up yourself ([Google's guide](https://cloud.google.com/billing/docs/how-to/disable-billing-with-notifications)). Paranoid doesn't do this: it needs billing administrator rights for a program, and Google warns that it stops all services in the project and that resources may be deleted.

## The spending limits

Google Cloud has no hard cap on spending, and no prepaid balance. So the deploy workflow checks two limits before it creates a VM:

- **`MAX_DEPLOY_COST_USD`**, $1 by default, every provider's limit for one deploy, explained in [the cost limit](README.md#the-cost-limit). With Google's prices in [`deploy/gcp/prices.json`](../../deploy/gcp/prices.json), a deploy whose worst case is higher isn't started, and the run says the longest lifetime that fits. This check runs before the workflow even signs in to Google Cloud.
- **`GCP_MONTHLY_BUDGET_USD`**, $5 by default, Google Cloud's own limit for the month's total, which keeps many cheap deploys from adding up. It works like this:

1. **Before it creates a VM**, it works out the same worst case for the deployment: the VM, its address and its disk for the whole lifetime, outbound traffic at `MAX_EGRESS_MBIT` for all of it, and the disk for two more hours, in case the VM powers off at the end and waits for the cleanup. Google Cloud deletes the VM at the end of its lifetime, and the VM can't send faster than the limit, so it can't cost more than that.
2. It reads the month's ledger in the bucket: every deployment this month, with its worst case or, once its VM is gone, what it cost.
3. If the worst case doesn't fit what's left, **it doesn't deploy**, and says what lifetime would fit.
4. Otherwise it records the worst case in the ledger and deploys.
5. When a VM is deleted, by the cleanup, Stop or a later deploy, the workflow replaces its worst case with the cost of the time it actually ran, and was off, still counting outbound traffic at the limit. A VM that Google Cloud deleted at the end of its lifetime keeps its full worst case, which is what it ran.

If anything goes wrong, a deployment keeps its full worst case counted, so the ledger can only say too much, never too little. The month is the calendar month in UTC, and a deployment counts in the month it started.

At the monthly limit, no new deployments start until next month, unless you raise `GCP_MONTHLY_BUDGET_USD`.

**What the limit rests on:**

- VMs in the project are started only through **Deploy to Google Cloud**. Anything else you run in the project isn't counted.
- The prices in [`deploy/gcp/prices.json`](../../deploy/gcp/prices.json) are current. They have the date they were checked. If Google raises its prices, update them.
- The project is used only for Paranoid.

## Checking nothing is left

In the console, with `<project-id>` chosen in the project picker:

- **Compute Engine** → **VM instances** lists no VM named `paranoid-<number>`.
- **Compute Engine** → **Disks** lists no disk named `paranoid-<number>`.
- **VPC network** → **IP addresses** lists no external address. An ephemeral address, the kind Paranoid uses, is released when its VM stops.
- **Billing** → **Reports**, for the project, shows no cost growing day after day.

What stays on purpose, at no cost: the `paranoid` network and its firewall rule, the bucket with its ledger, the service account and Workload Identity Federation.

If a VM is left, run **Stop Google Cloud**, or delete it in **VM instances**: tick it and click **Delete**. Its disk goes with it.

## The credentials

There are none to keep. Unlike a provider with an API token, Google Cloud here has no secret anywhere: not in your fork, not in GitHub's secrets, not on the VM.

### How a run signs in

1. GitHub gives each run a short-lived token, signed by GitHub, that says which repository, branch and environment the run is from.
2. The run's sign-in step sends that token to Google Cloud's Workload Identity Federation, which `bootstrap.sh` set up to trust only your fork's `main` branch, by the repository's and owner's numeric IDs, in the `gcp` or `gcp-cleanup` environment.
3. Google Cloud gives the run a short-lived token of one service account: `paranoid-deploy` for a run in `gcp`, which waits for your approval, and the delete-only `paranoid-cleanup` for a run in `gcp-cleanup`. Neither token outlives the run.

The VM itself has no service account, so nothing on it has Google Cloud credentials.

### Nothing to rotate

Nothing expires, so there's nothing to renew or replace on a schedule. The trust only changes when you run `bootstrap.sh` or `teardown.sh`.

### If something may be wrong

To cut GitHub off at once, for example if someone you don't trust got write access to your fork: in the console, **IAM & Admin** → **Workload Identity Federation** → **paranoid-github** → the **github** provider → **Delete**. No run can sign in after that. Run the setup script again to turn it back on, once you've checked your fork's collaborators and branch rules. Then check **Compute Engine** → **VM instances** for anything you didn't start.

### What the setup grants, and why

[`deploy/gcp/bootstrap.sh`](../../deploy/gcp/bootstrap.sh) creates four custom roles for two service accounts, and grants them two built-in roles. Only your fork's runs, each in its own environment, and the project's owners, can act as them, and neither can grant itself or anyone else more.

`paranoid-deploy`, for deploys in the `gcp` environment, which wait for your approval:

| Role, where it's granted                                                                          | Permissions                                                                                                                                        | Why                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paranoidVms`, on the project, only for VMs and disks named `paranoid-*` in the zone              | `compute.instances.create`, `.delete`, `.get`, `.getSerialPortOutput`, `.setLabels`, `.setMetadata`, `.setTags`; `compute.disks.create`, `.delete` | Create the VM with its labels, startup script and network tag, and its boot disk. Delete them. Read the VM's serial console to show why a setup failed. An IAM condition on the name and zone keeps it from any other VM.                |
| `paranoidList`, on the project                                                                    | `compute.instances.list`, `compute.disks.list`, `compute.zoneOperations.get`                                                                       | Find Paranoid's VMs and leftover disks, and wait for a create or delete to finish. Google can't limit listing by name.                                                                                                                   |
| `paranoidSubnet`, on the `paranoid` subnet only                                                   | `compute.subnetworks.use`, `compute.subnetworks.useExternalIp`                                                                                     | Put the VM on Paranoid's network, with an external IP address. Not on any other network.                                                                                                                                                 |
| `roles/storage.objectUser`, on the `<project-id>-paranoid` bucket only                            | Read, write and delete objects in it                                                                                                               | Read and update the ledger.                                                                                                                                                                                                              |
| `roles/iam.workloadIdentityUser`, on the service account, for your repository's `gcp` environment | `iam.serviceAccounts.getAccessToken` and similar                                                                                                   | Lets GitHub runs act as the service account. The Workload Identity provider accepts only your fork's `main` branch, by the repository's and owner's numeric IDs, which can't be reused, and only a run in `gcp` can act as this account. |

`paranoid-cleanup`, for Stop and the hourly cleanup in the `gcp-cleanup` environment, which don't wait for approval:

| Role, where it's granted                                                                                  | Permissions                                                | Why                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `paranoidVmsDelete`, on the project, only for VMs and disks named `paranoid-*` in the zone                | `compute.instances.delete`, `.get`; `compute.disks.delete` | Delete Paranoid's VMs and their disks, and read their times for the ledger. It can't create anything. |
| `paranoidList`, on the project                                                                            | As above                                                   | Find them.                                                                                            |
| `roles/storage.objectUser`, on the `<project-id>-paranoid` bucket only                                    | As above                                                   | Settle each deleted VM's cost in the ledger.                                                          |
| `roles/iam.workloadIdentityUser`, on the service account, for your repository's `gcp-cleanup` environment | As above                                                   | Lets those runs act as it, and no others.                                                             |

It doesn't get `iam.serviceAccounts.actAs`, because the VM has no service account, so it can't hand a VM any permission. It can't start a VM again, change a VM's lifetime, open a firewall port, or read or change anything else in the project.

## Troubleshooting

The run's log says which step failed and why. There's no SSH, so you can't log in to a server to look. When the app doesn't come up, the run shows the VM's setup log.

| What you see                                                                                                                | What to do                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "GCP_PROJECT must be a Google Cloud project ID, not ''", or another variable is empty                                       | The variables aren't set. Run the commands from [step 5](#5-connect-your-fork). `GCP_SERVICE_ACCOUNT` must be a variable of each environment, with that environment's service account.                                                                                            |
| The run says **Waiting for review** and doesn't start                                                                       | That's the approval in [step 7](#7-start-a-server): click **Review deployments**, tick **gcp** and **Approve and deploy**. A run that nobody approves is cancelled after 30 days.                                                                                                 |
| The hourly cleanup waits for review                                                                                         | `gcp-cleanup` has a required reviewer. Remove it: **Settings** → **Environments** → **gcp-cleanup**, untick **Required reviewers** and save.                                                                                                                                      |
| "Branch is not allowed to deploy to gcp", or the run waits for the environment                                              | You started the workflow on another branch. Start it on `main`. Check the environment's deployment branch rule says `main`.                                                                                                                                                       |
| "Sign in to Google Cloud" fails with `unauthorized_client` or "The given credential is rejected by the attribute condition" | Google Cloud only accepts runs of your fork's `main` branch in the `gcp` and `gcp-cleanup` environments. Start it on `main`, and check each environment's `GCP_SERVICE_ACCOUNT`. If you renamed or re-created the fork, run the setup script again with the new `<owner>/<repo>`. |
| A permission error such as 403 on `iam.serviceAccounts.getAccessToken`                                                      | The service account can't be used by the run. Run the setup script again, wait a minute, and retry: new permissions can take a few minutes to apply.                                                                                                                              |
| A permission error such as 403 on `compute.instances.create` or another `compute` permission                                | The zone or region variable doesn't match the setup. Run the setup script again and set the variables it prints. If it persists, the role may lack a permission: open an issue with the error.                                                                                    |
| "The worst case, ..., is more than the limit"                                                                               | One deploy could cost more than `MAX_DEPLOY_COST_USD`, $1 by default. Use a lifetime up to the one the message says, a lower `MAX_EGRESS_MBIT`, or raise `MAX_DEPLOY_COST_USD` ([shared variables](README.md#shared-repository-variables)).                                       |
| "This deployment could cost up to ..., but only ... is left"                                                                | The month's [spending limit](#the-spending-limits) is used up. Use a shorter lifetime, as the message says, wait until next month, or raise `GCP_MONTHLY_BUDGET_USD`.                                                                                                             |
| "deploy/gcp/prices.json has no prices for ..."                                                                              | Your region isn't in the price file. Use one of the regions it has, or add yours from Google's pricing pages.                                                                                                                                                                     |
| "Compute Engine API has not been used in project ... or it is disabled"                                                     | Run the setup script, which turns it on, and wait a few minutes.                                                                                                                                                                                                                  |
| "billing account ... is disabled", or "The billing account is closed"                                                       | Link the project to a working billing account, as in [step 3](#3-prepare-the-account). A free trial that's over needs **Activate** in the console.                                                                                                                                |
| `ZONE_RESOURCE_POOL_EXHAUSTED`, or the zone has no capacity                                                                 | Google has no `e2-micro` free in that zone right now. Try again later, or run the setup script with another region.                                                                                                                                                               |
| "The app didn't come up in time"                                                                                            | The VM took too long to set up, or its setup failed. The deploy deleted it. The log above gives the last reason and the VM's setup log. Run Deploy again.                                                                                                                         |
| "HTTPS certificate problem"                                                                                                 | Let's Encrypt didn't give a certificate for the hostname. It allows only 5 certificates a week for the same hostname, which can happen if you deploy many times in a week and get the same IP address. Wait, or deploy again later to get another address.                        |
| VMs stay after shutting down                                                                                                | Clean up Google Cloud isn't running: GitHub delays scheduled runs, and turns them off after 60 days without activity. Open **Actions** → **Clean up Google Cloud**, enable it if GitHub disabled it, and run it by hand.                                                          |
| The setup script says the budget couldn't be created                                                                        | Your Google account isn't an administrator of the billing account. Create the budget in the console, or ask the administrator.                                                                                                                                                    |

## Removing everything

1. Run **Stop Google Cloud**.
2. Run the teardown script. It removes the VMs, disks, network, bucket and ledger, service account, roles, Workload Identity Federation and the budget alert:

   ```bash
   deploy/gcp/teardown.sh <project-id>
   ```

   The Google Cloud services it turned on stay on, which costs nothing. Google keeps deleted roles and Workload Identity Federation for 30 to 37 days, so they can be restored, and then removes them. Running the setup script again restores them.

3. In your fork, delete both environments: **Settings** → **Environments** → **gcp** → **Delete environment**, and the same for **gcp-cleanup**. That deletes their variables too. Then delete the repository variables starting with `GCP_` in **Settings** → **Secrets and variables** → **Actions** → **Variables**.
4. To remove everything at once, delete the project instead: in the console, **IAM & Admin** → **Settings** → **Shut down**. Google deletes it after 30 days, and it can't cost anything from then on.
5. To close your billing account: **Billing** → **Account management** → **Close billing account**. You're billed for what was used up to then. To delete the whole Google account, see [Google's account settings](https://myaccount.google.com).

## Privacy

The server keeps no access logs. Its own logs hold only connections and errors, in memory, and go when it's deleted. Nothing else is stored, and deleting the VM deletes its disk. The setup turns on nothing that records traffic: no flow logs, no firewall logging, no Cloud Logging agent. The VM has no Google Cloud credentials at all, so it can't send anything to Google Cloud. What remains visible to others:

- **Google Cloud's Admin Activity audit logs** record every change made through Google Cloud's API, such as creating and deleting a VM, and which service account did it. They can't be turned off, and they don't include your users' traffic.
- **Google**, as the network provider, can see which IP addresses connect to the server, but not message contents, which are encrypted end to end. HTTPS ends on the VM, not on a Google load balancer.
- **The VM's serial console**, readable in the console while the VM exists, has its setup's messages, which hold no user data.
- **The ledger** has one entry per deployment: its run number, worst case, cost and hours. Nothing about who used a server or when chats happened.
- **Google's STUN servers**, the default, see your users' IP addresses when their browsers find a way to connect. `VITE_ICE_SERVERS` can point to another one.
- **sslip.io** turns the hostname into the IP address, so it sees the lookups. It and **Let's Encrypt's public Certificate Transparency logs** reveal the server's IP-based hostname, but not who uses it.
- **The region** decides which country the server is in: Finland by default. The free tier's regions are all in the US.
- **GitHub**: in a public fork, anyone can read the run summary with the URL, and the run's log, until GitHub deletes it a day later, or you delete it sooner (see [step 5](#log-retention)).

## What a deploy does

[`deploy-gcp.yml`](../../.github/workflows/deploy-gcp.yml):

1. Waits for your approval, in the `gcp` environment.
2. Checks the settings, before it changes anything.
3. Checks the worst-case cost against `MAX_DEPLOY_COST_USD`, before it signs in.
4. Signs in to Google Cloud with Workload Identity Federation, as `paranoid-deploy`, and installs the Google Cloud CLI at a pinned version, after checking each of its parts against Google's checksum.
5. Checks the month's [spending limit](#the-spending-limits), and records the deployment's worst case in the ledger.
6. Deletes any existing Paranoid server, running or off, with its disk.
7. Creates an `e2-micro` VM named `paranoid-<run id>-<attempt>` from Google's Debian 13 image, with:
   - a 10 GB standard disk that's deleted with it;
   - Shielded VM (secure boot, a virtual TPM and integrity monitoring);
   - no service account, so nothing on it has Google Cloud credentials;
   - the `paranoid` network, the `paranoid` tag that its firewall rule lets HTTP and HTTPS in to, and a Standard Tier IPv4 address only;
   - a maximum run time of its lifetime, after which Google Cloud deletes it;
   - the labels `app=paranoid`, `run` (the run's ID and attempt), `created` and `expires` (Unix times), like every provider's, and `paranoid-month` for the ledger;
   - project SSH keys blocked, the interactive serial console off and its copy to Cloud Logging off;
   - [`deploy/gcp/startup.sh`](../../deploy/gcp/startup.sh) as its startup script, and the repository, commit, invites and outbound limit as metadata. Nothing in its metadata is a secret.
8. Waits up to 20 minutes for `https://<host>/healthz` and a socket.io handshake. If they don't come up, it shows the VM's setup log, deletes the VM and fails, with the reason from the last attempt.

On the VM, the startup script turns off SSH and locks root's password. It reads the VM's external IP address from Google's metadata server, because the VM itself only sees its private address, and fetches exactly the deployed commit from the public repository with `git`, which checks every file against its hash, so the VM needs no credentials. [`deploy/server/setup.sh`](../../deploy/server/setup.sh) from that commit does the rest, the same as on the other providers:

- installs Node.js 24 and Caddy from pinned releases, after checking their checksums;
- runs `pnpm install --frozen-lockfile` and builds the app with `VITE_SIGNALING_SERVER=/`, as a user of its own, with a temporary swap file on the 1 GB VM;
- starts the signaling server as a locked-down systemd service on `127.0.0.1` only, with `MAX_INVITES`. When it exits because its last invite is finished, the VM powers off;
- starts Caddy, which gets a Let's Encrypt certificate for `<ip-with-dashes>.sslip.io`, serves the app and passes `/socket.io/` and `/healthz` to the signaling server;
- limits all outbound traffic to `MAX_EGRESS_MBIT` with `tc`.

[`cleanup-gcp.yml`](../../.github/workflows/cleanup-gcp.yml) runs every hour on the default branch, which can't use the `gcp-cleanup` environment, so it starts itself on `main`, which can. It deletes only VMs that are off. It and Stop sign in as `paranoid-cleanup`, and don't wait for approval. [`stop-gcp.yml`](../../.github/workflows/stop-gcp.yml) deletes every Paranoid VM right away. All three update the ledger for each VM they delete. Deploy and Stop share a concurrency group, so only one deploy runs at a time, and Stop never waits: it cancels a deploy that's running, which then deletes its own VM, and then deletes whatever is left. The cleanup has a group of its own, so it never waits behind a deploy that's waiting for approval. It only deletes VMs that are off or past their expiry time, a label set when the VM is created, so it can't touch a new one. When two of them delete the same VM at once, one finds it gone and leaves it to the other, and each ledger update only goes through if nobody changed the ledger since it was read.
