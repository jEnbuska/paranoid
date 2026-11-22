# Deploy Paranoid to Hetzner Cloud

This guide takes you from a GitHub account to your own Paranoid server in the EU, on [Hetzner Cloud](https://www.hetzner.com/cloud), from Hetzner, a German provider, in Germany or Finland. You need no Hetzner experience, and you never log in to a server.

You start a server from GitHub Actions for a set number of invites. It powers itself off once the last invite is finished, or when its lifetime is over, and a scheduled workflow then deletes it. Nothing runs between uses. Chats that have started keep working after the server is gone, because they're peer to peer.

Hetzner's prices and rules below were checked on 2026-11-20. They can change, so check the linked pages too. How deploying works on every provider, the shared settings and the other providers are in [Deploying Paranoid](README.md).

## What this deployment needs

Everything this deployment needs from GitHub, by name. It also reads the [shared repository variables](README.md#shared-repository-variables).

### Environments

| Environment       | Branches    | Required reviewers | Used by                                   |
| ----------------- | ----------- | ------------------ | ----------------------------------------- |
| `hetzner`         | `main` only | You                | `deploy-hetzner.yml`                      |
| `hetzner-cleanup` | `main` only | None               | `cleanup-hetzner.yml`, `stop-hetzner.yml` |

### Secrets

| Secret         | Environment                  | Where its value comes from                                                                                 |
| -------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `HCLOUD_TOKEN` | `hetzner`, `hetzner-cleanup` | A Hetzner Cloud API token with Read & Write for each, created in [step 4](#create-the-tokens-and-add-them) |

### Variables

| Variable              | Set in     | What it does                       | Required | Default            | Explained in                   |
| --------------------- | ---------- | ---------------------------------- | -------- | ------------------ | ------------------------------ |
| `HCLOUD_LOCATION`     | Repository | The location the server runs in.   | Optional | `nbg1`             | [Step 5](#5-optional-settings) |
| `HCLOUD_SERVER_TYPES` | Repository | The server types to try, in order. | Optional | `cx23,cax11,cpx12` | [Step 5](#5-optional-settings) |

## Contents

1. [What this deployment needs](#what-this-deployment-needs)
2. [Words used in this guide](#words-used-in-this-guide)
3. [Fork the repository](#1-fork-the-repository)
4. [Sign up for Hetzner](#2-sign-up-for-hetzner)
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

- **Hetzner Console:** Hetzner's website for managing cloud servers, at [console.hetzner.com](https://console.hetzner.com).
- **Project:** a separate space in your Hetzner account with its own servers, firewalls and API tokens. A token only reaches its own project, so Paranoid gets a project of its own.
- **Server:** a virtual computer in Hetzner's data center.
- **Server type:** a server's size and price, for example `cx23`: 2 shared CPU cores and 4 GB of memory.
- **Location:** the data center a server runs in: `nbg1` in Nuremberg, `fsn1` in Falkenstein (both in Germany) or `hel1` in Helsinki (Finland).
- **Primary IP:** the server's public internet address. Its IPv4 address costs a little extra, and goes when the server is deleted.
- **Firewall:** Hetzner's filter in front of the server, which decides what traffic gets in.
- **API token:** a long secret string that lets a program, here GitHub Actions, use your Hetzner project without your password. Treat it like a password.
- **GitHub environment:** a named set of secrets in your fork that only chosen branches can use, and that can make a workflow wait for someone's approval. Here there are two, `hetzner` and `hetzner-cleanup`, and only `main` can use them.

## 1. Fork the repository

1. Open [github.com/jEnbuska/paranoid](https://github.com/jEnbuska/paranoid) and click **Fork**, then **Create fork**.
2. In your fork, open the **Actions** tab. GitHub turns workflows off in new forks: click **I understand my workflows, go ahead and enable them**.

You should see the workflows **CI**, **Deploy to Hetzner**, **Stop Hetzner** and **Clean up Hetzner** in the list on the left.

The rest of this guide writes your fork as `<owner>/<repo>`, for example `alex/paranoid`.

## 2. Sign up for Hetzner

1. On [hetzner.com/cloud](https://www.hetzner.com/cloud), choose to sign up and register a Hetzner account. To create projects and servers you need a full account, with your personal details and a payment method (see [Hetzner's FAQ](https://docs.hetzner.com/cloud/general/faq/)).
2. Confirm your email address with the link Hetzner sends you.
3. Hetzner checks new accounts, and may ask you to verify your identity before you can create servers. That can take a while. Follow what Hetzner asks for, and wait until you can log in to the [Hetzner Console](https://console.hetzner.com).
4. Turn on two-factor authentication for your login in your account settings. Anyone with your password could otherwise create servers on your bill.

Hetzner bills afterwards, from your payment method, not from a prepaid balance. See [Costs](#costs) for how much a deploy can cost at most.

## 3. Prepare the account

Paranoid gets a project of its own in your Hetzner account.

1. In the [Hetzner Console](https://console.hetzner.com), create a new project, for example `paranoid`.
2. Use it only for Paranoid. The API tokens you'll create belong to this project, so even a leaked token can't reach anything else you run on Hetzner.

Open the project. It should be empty: no servers, firewalls or SSH keys.

New accounts can create only a limited number of servers, shown on the project's **Limits** tab. Paranoid needs one at a time.

## 4. Create the credentials and connect your fork

Hetzner shows an API token only once, so this step creates the two GitHub environments first, then each token, which goes straight into its environment. A token is never kept anywhere else, not even for a minute.

### Create the environments

The tokens go into two GitHub **environments**, which only the `main` branch may use:

- `hetzner` is for **Deploy to Hetzner**. You're its required reviewer, so every deploy waits until you approve it. Only you and people you give write access to your fork can start a workflow, and even when one of them starts a deploy, it doesn't run until you approve it.
- `hetzner-cleanup` is for **Stop Hetzner** and **Clean up Hetzner**. It has no reviewers, because the hourly cleanup has to run without anyone there to approve it. Both workflows only delete servers.

The workflows only run when you start them or on their schedule, never from a pull request, so nobody else's code can reach the tokens.

This needs a public repository, which a fork of this one is. On GitHub's Free, Pro and Team plans, required reviewers work only in public repositories, and on GitHub Free, so do environments and their secrets (see GitHub's [deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)). In a private copy on Pro or Team, the `main` limit still protects the tokens, but deploys no longer wait for your approval. A private copy on GitHub Free can't hold the tokens at all, so it isn't supported. Don't put them in repository secrets instead: every branch and workflow could use them.

#### In GitHub's website

1. In your fork, go to **Settings** → **Environments** → **New environment**, name it `hetzner` and click **Configure environment**.
2. Tick **Required reviewers**, enter your own GitHub username and select it.
3. Leave **Prevent self-review** unticked. Ticked, it would stop you from approving the deploys you start yourself, and you're the only reviewer.
4. Under **Deployment branches and tags**, choose **Selected branches and tags**, click **Add deployment branch or tag rule**, enter `main` and click **Add rule**.
5. Click **Save protection rules**.
6. Go back to **Settings** → **Environments**, click **New environment** again, name it `hetzner-cleanup` and click **Configure environment**.
7. Leave **Required reviewers** unticked. Under **Deployment branches and tags**, choose **Selected branches and tags** and add the rule `main`, as for `hetzner`, then click **Save protection rules**.

#### Or with the GitHub CLI

With [`gh`](https://cli.github.com) signed in to your GitHub account, create `hetzner` with you as its reviewer, limited to `main`:

```bash
gh api --method PUT repos/<owner>/<repo>/environments/hetzner --input - <<JSON
{"reviewers": [{"type": "User", "id": $(gh api user --jq .id)}], "prevent_self_review": false, "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
JSON
```

```bash
gh api --method POST repos/<owner>/<repo>/environments/hetzner/deployment-branch-policies -f name=main -f type=branch
```

Then `hetzner-cleanup`, with no reviewers, limited to `main`:

```bash
gh api --method PUT repos/<owner>/<repo>/environments/hetzner-cleanup -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'
```

```bash
gh api --method POST repos/<owner>/<repo>/environments/hetzner-cleanup/deployment-branch-policies -f name=main -f type=branch
```

Either way, **Settings** → **Environments** now lists `hetzner`, with you as its reviewer and the branch rule `main`, and `hetzner-cleanup`, with only the branch rule `main`.

### Create the tokens and add them

The project gets two tokens: `paranoid-github-deploy` for `hetzner`, and `paranoid-github-cleanup` for `hetzner-cleanup`. Both need **Read & Write**, and both can do the same things. Hetzner can't limit a token to deleting, so the cleanup token could create servers too, but only the code on your fork's `main` ever gets it, and that code only deletes. A token for each environment still lets you revoke one without the other.

Create the first token, as in [Hetzner's guide](https://docs.hetzner.com/cloud/api/getting-started/generating-api-token/):

1. In the Hetzner Console, open the `paranoid` project.
2. Go to **Security** in the menu on the left, then **API tokens** at the top, and click **Generate API token**.
3. Enter the description `paranoid-github-deploy`, choose **Read & Write**, and confirm.
4. **Hetzner shows the token only once.** It's 64 letters and digits. Keep this page open and add it to GitHub right away. Don't save the token in a file, a note, a password manager entry you'll forget, a chat or an email.

Add it to `hetzner`, in GitHub's website or with `gh`:

- **Website:** in your fork, go to **Settings** → **Environments** → **hetzner**. Under **Environment secrets**, click **Add environment secret**. Name it `HCLOUD_TOKEN`, paste the token as its value and click **Add secret**.
- **`gh`:** run the command below. It asks for the token at a prompt, so it never appears on the command line or in your shell history. Don't use `--body`.

  ```bash
  gh secret set HCLOUD_TOKEN --env hetzner --repo <owner>/<repo>
  ```

Then create the second token the same way, with the description `paranoid-github-cleanup` and **Read & Write**, and add it to `hetzner-cleanup` as its `HCLOUD_TOKEN`:

```bash
gh secret set HCLOUD_TOKEN --env hetzner-cleanup --repo <owner>/<repo>
```

**Settings** → **Environments** → each environment now shows the secret `HCLOUD_TOKEN`. GitHub never shows a secret's value again. Close the Hetzner page with the tokens. The Console's **API tokens** list now shows both, by description.

### Keep the workflow logs for 1 day

Your fork is public, so anyone signed in to GitHub can read its workflow runs and their logs. The workflows print nothing secret: GitHub hides the tokens' values, and the scripts never print what Hetzner returns. The logs still show your server's address and when it ran, so keep them only as long as you need them:

1. In your fork, go to **Settings** → **Actions** → **General**.
2. Under **Check, workflow run, status, artifact and log retention**, enter `1`, and click **Save**.

GitHub then deletes each run, with its logs, a day after it ran. The setting applies only to runs after you save it. To remove an earlier run's logs, or a run's logs at once, open the run in the **Actions** tab, click **…** (**Show workflow options**) in the top right corner, then **Delete all logs**.

## 5. Optional settings

Everything works with the defaults. The settings every provider shares, `MAX_INVITES`, `LIFETIME_MINUTES`, `MAX_EGRESS_MBIT` and `MAX_DEPLOY_COST_USD`, are in the index's [shared repository variables](README.md#shared-repository-variables). With Hetzner, `MAX_DEPLOY_COST_USD` must fit every type in `HCLOUD_SERVER_TYPES`, as the deploy may get any of them (see [Costs](#costs)). Hetzner's own two:

| Variable              | Default            | What it does                                                                                                                                                                                                                                     |
| --------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `HCLOUD_LOCATION`     | `nbg1`             | Location: `nbg1` (Nuremberg), `fsn1` (Falkenstein) or `hel1` (Helsinki), the locations in [`prices.json`](../../deploy/hetzner/prices.json).                                                                                                     |
| `HCLOUD_SERVER_TYPES` | `cx23,cax11,cpx12` | Server types to try, in order, separated by commas. Hetzner sometimes has a type unavailable in a location, so the deploy tries the next. Only the types in [`prices.json`](../../deploy/hetzner/prices.json) are accepted. See [Costs](#costs). |

To change one, add a repository variable in your fork under **Settings** → **Secrets and variables** → **Actions** → **Variables**, or with `gh`, for example:

```bash
gh variable set HCLOUD_LOCATION --body hel1 --repo <owner>/<repo>
```

The **Deploy to Hetzner** workflow's inputs win over the variables, and the variables over the defaults.

The only secret is `HCLOUD_TOKEN`. Never put a token or password in a variable: variables are shown in logs and to anyone with access to the repository.

The app uses Google's STUN servers unless `VITE_ICE_SERVERS` in [`packages/client-app/.env`](../../packages/client-app/.env) says otherwise. To use your own, change it in your fork and commit it. It isn't a secret: it's built into the app that every visitor downloads.

## 6. Start a server

1. In your fork, go to **Actions** → **Deploy to Hetzner** → **Run workflow**.
2. Keep **Use workflow from** on `main`. Optionally fill in the number of invites and the lifetime. Click **Run workflow**.
3. Click the run that appears. It waits for your approval, and GitHub emails you about it. Click **Review deployments**, tick `hetzner` and click **Approve and deploy**. Nothing is created and nothing costs anything until you approve it, and the server's lifetime starts only then.
4. Setting up the server takes a few minutes, because it installs and builds the app itself.
5. When the run is green, its **Summary** shows the URL, `https://<ip-with-dashes>.sslip.io`, when the server shuts down at the latest, and the most it can cost.

Or with `gh`:

```bash
gh workflow run deploy-hetzner.yml --ref main --repo <owner>/<repo> -f max_invites=5 -f lifetime_minutes=60
```

Then approve it on the run's page, as in 3 above. A deploy that's waiting for approval can wait up to 30 days. To drop it, click **Reject** instead, or **Cancel workflow**.

Open the URL, create an invite and open it in a second browser or on another device. The chat starts once both are connected. In the Hetzner Console, the project's **Servers** list shows the server, `paranoid-<number>`.

Anyone who has the URL can create invites, which use up `max_invites`. In a public fork, anyone signed in to GitHub can read the run summary until the run is deleted (see [Keep the workflow logs for 1 day](#keep-the-workflow-logs-for-1-day)).

## 7. Stop it, and how it's cleaned up

- **Stop it now:** **Actions** → **Stop Hetzner** → **Run workflow** on `main` deletes every Paranoid server right away, with no approval needed. It also cancels a deploy that's running or waiting for approval. Chats that have started keep working. Or: `gh workflow run stop-hetzner.yml --ref main --repo <owner>/<repo>`.
- **On its own:** the server powers off once the last invite is finished, or at the end of its lifetime. **Hetzner bills a server that's off just like one that's running**, so the **Clean up Hetzner** workflow runs every hour and deletes every Paranoid server that's off or past its lifetime. You can also run it by hand from the Actions tab.

Starting **Deploy to Hetzner** again first deletes any Paranoid server that's left, so there's only ever one.

GitHub can delay scheduled workflows, sometimes by more than an hour, and turns them off in a repository that has had no activity for 60 days. If Clean up Hetzner doesn't run, a powered-off server stays until you run Stop Hetzner or Clean up Hetzner by hand, or delete it in the Console. The most it can then cost is in [Costs](#costs).

## Costs

Checked on 2026-11-20 on [Hetzner's cost-optimized](https://www.hetzner.com/cloud/cost-optimized/) and [regular performance](https://www.hetzner.com/cloud/regular-performance/) pages and in [Hetzner's billing FAQ](https://docs.hetzner.com/cloud/billing/faq/). Prices exclude VAT.

| Type              | CPU and memory                | Disk  | Per hour | Per month at most        | Billed while off |
| ----------------- | ----------------------------- | ----- | -------- | ------------------------ | ---------------- |
| `cx23`, the first | 2 shared x86 cores, 4 GB      | 40 GB | €0.0096  | €5.99                    | Yes              |
| `cax11`           | 2 shared Arm cores, 4 GB      | 40 GB | €0.0104  | €6.49                    | Yes              |
| `cpx12`           | 1 shared x86 (AMD) core, 2 GB | 40 GB | €0.0160  | €11.99 (€9.99 in `hel1`) | Yes              |

- **Hourly, with a monthly cap.** Hetzner bills by the hour, rounding every started hour up, and never more than a server's monthly price.
- **A server is billed while it exists, on or off,** until it's deleted. That's why Clean up Hetzner deletes servers that are off.
- **The IPv4 address** costs €0.50 a month more, according to [Hetzner's docs](https://docs.hetzner.com/cloud/servers/overview/), and goes with the server. Hetzner's product pages say their prices include IPv4, so it may already be in the price. IPv6 is free.
- **Network traffic:** each server includes at least 20 TB of outbound traffic a month in the EU, and each TB more costs €1. Incoming traffic is free. `MAX_EGRESS_MBIT` keeps a server far below the allowance: at most 50 Mbit/s is about 16 TB in a whole month.
- **The firewall** costs nothing.
- **The worst case for one deploy**, which **Deploy to Hetzner** checks for every type in `HCLOUD_SERVER_TYPES` before it creates anything: every started hour of the lifetime, plus 2 hours until Clean up Hetzner deletes the server, at the type's price and an IPv4 address. The check works in US dollars, so [`prices.json`](../../deploy/hetzner/prices.json) holds Hetzner's euro prices converted at the European Central Bank's rate for 2026-11-20, 1.0990 dollars to the euro. With `MAX_DEPLOY_COST_USD` of 1 in `nbg1`:
  - 60 minutes, the default: $0.0350 for `cx23`, and $0.0575 for `cpx12`, the most expensive default type;
  - 24 hours, the most: $0.3029 for `cx23`, and $0.4979 for `cpx12`, so every lifetime fits.

  If a deploy would cost more than the limit, it stops with "The worst case … is more than the limit" and the longest lifetime that fits.

- **Worst case for a month:** there's only ever one server, so even if Clean up Hetzner never runs, the most it can cost is one month of its type plus its IPv4 address: **€6.49** for `cx23`, or €12.49 if Hetzner had only `cpx12` available.
- **A typical deploy** of an hour costs about one cent.

Your invoices and what's been used are in your Hetzner account. A powered-off Paranoid server shows in the project's **Servers** list until it's deleted.

## Checking nothing is left

In the Hetzner Console, open the `paranoid` project and check that:

- **Servers** lists no server named `paranoid-<number>`;
- **Primary IPs** lists no address that belonged to one. A server's addresses are released when it's deleted;
- **Firewalls** lists no firewall named `paranoid-<number>`. Each server has its own, deleted with it;
- **Security** → **SSH keys** lists no key named `paranoid-<number>`. Each deploy deletes its own, and Clean up Hetzner deletes one a deploy left behind.

If a server is left, run **Stop Hetzner**, or delete it in the Console.

## The credentials

The two `HCLOUD_TOKEN` secrets are the only secrets, and they're never in the repository:

- One is a secret of the `hetzner` environment, used only by **Deploy to Hetzner**, which waits for your approval. The other is a secret of `hetzner-cleanup`, used by **Stop Hetzner** and **Clean up Hetzner**, which only delete servers. Only `main` can use either environment.
- The workflows run only when started by hand or on their schedule, never from a pull request, so no pull request or fork can reach them.
- Only the steps that call Hetzner's command-line tool, `hcloud`, get them. Nothing writes them to disk or prints them, and GitHub hides them in logs.
- The server never gets them. They aren't in the server's setup data, its labels or the run summary. The server doesn't use Hetzner's API: it only powers itself off, and GitHub Actions deletes it.

**To replace a token,** create a new one as in [step 4](#create-the-tokens-and-add-them), then replace the secret: in **Settings** → **Environments** → **hetzner** (or **hetzner-cleanup**), click the pencil next to `HCLOUD_TOKEN`, or run the `gh secret set` command again. Then delete the old token in the Console's **API tokens** list.

**If it may have leaked,** for example it was pasted somewhere or committed:

1. **Revoke it first:** in the Hetzner Console, open the `paranoid` project, go to **Security** → **API tokens** and delete it, `paranoid-github-deploy` or `paranoid-github-cleanup`. If you don't know which one leaked, delete both.
2. Check **Servers**, **Primary IPs**, **Firewalls** and **Security** → **SSH keys** for anything you didn't create, and delete it.
3. Create a new token and replace its secret as above.

A token that was committed to git stays in the history even after the file is changed, so revoking it is what matters.

## Troubleshooting

The run's log says which step failed and why. There's no SSH, so you can't log in to a server to look.

| What you see                                                                          | What to do                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The hetzner environment has no HCLOUD_TOKEN secret", or the same for hetzner-cleanup | Add the secret as in [step 4](#create-the-tokens-and-add-them). Check the name, `HCLOUD_TOKEN`, and that it's an **environment** secret of the environment the message names, not a repository secret.                                                            |
| An error from `hcloud` such as `unauthorized` or 401                                  | The token is wrong or deleted. Create a new one and replace the secret.                                                                                                                                                                                           |
| An error from `hcloud` such as `forbidden` when creating or deleting                  | The token was created with **Read** only. Create one with **Read & Write** and replace the secret.                                                                                                                                                                |
| A deploy waits, and its page asks for a review                                        | It waits for your approval: click **Review deployments**, tick `hetzner` and click **Approve and deploy**. If you can't approve it, check that you're the environment's required reviewer and that **Prevent self-review** is off.                                |
| "Branch is not allowed to deploy to hetzner", or the same for hetzner-cleanup         | You started the workflow on another branch. Start it on `main`. Check the environment's deployment branch rule says `main`.                                                                                                                                       |
| Clean up Hetzner or Stop Hetzner waits for a review                                   | `hetzner-cleanup` has a required reviewer. Remove it: these two workflows must run without approval.                                                                                                                                                              |
| The workflows don't appear, or don't run                                              | Actions are off in the fork: enable them in the **Actions** tab.                                                                                                                                                                                                  |
| Creating the server fails because the account isn't verified or is limited            | Hetzner hasn't finished checking your account, or a limit is reached. Check your email from Hetzner, and the project's **Limits** tab. Hetzner reviews limit increases by hand, and only for customers of at least a month who have paid their first invoice.     |
| "None of the server types … could be created"                                         | Hetzner had none of `HCLOUD_SERVER_TYPES` available in `HCLOUD_LOCATION`. Try again later, or set `HCLOUD_LOCATION` to another location.                                                                                                                          |
| "The worst case … is more than the limit"                                             | The deploy refused before creating anything. Choose a lifetime no longer than the one the message gives, or raise `MAX_DEPLOY_COST_USD`, or leave the more expensive types out of `HCLOUD_SERVER_TYPES`. See [Costs](#costs).                                     |
| "Price file … has no prices for" a location, or "has no price for" a type             | The deploy only accepts the locations and types in [`prices.json`](../../deploy/hetzner/prices.json). Set `HCLOUD_LOCATION` or `HCLOUD_SERVER_TYPES` to them.                                                                                                     |
| "The app didn't come up in time"                                                      | The server took too long to set up, or its setup failed. The deploy deleted it. The message gives the last reason, for example "Couldn't connect", which means the server never got as far as starting its web server. Run Deploy again, or try another location. |
| "HTTPS certificate problem"                                                           | Let's Encrypt didn't give a certificate for the hostname. It allows only 5 certificates a week for the same hostname, which happens if you deploy many times in a week and get the same IP address. Wait, or try another location to get another address.         |
| Servers stay after shutting down                                                      | Clean up Hetzner isn't running: GitHub delays scheduled runs, and turns them off after 60 days without activity. Open **Actions** → **Clean up Hetzner**, enable it if GitHub disabled it, and run it by hand.                                                    |

## Removing everything

1. Run **Stop Hetzner**, then [check nothing is left](#checking-nothing-is-left).
2. Delete both tokens: **Security** → **API tokens**.
3. Delete the `paranoid` project itself, in its settings.
4. In your fork, delete both environments: **Settings** → **Environments** → **hetzner** → **Delete environment**, then the same for **hetzner-cleanup**. That deletes their secrets too.
5. If you want to close your Hetzner account, do it from your Hetzner account, or ask Hetzner's support. The last invoice still covers what ran that month.

## Privacy

The server keeps no access logs. Its own logs hold only connections and errors, in memory, and go when it's deleted. Nothing is stored anywhere else, and deleting the server deletes its disk. What remains visible to others:

- **Hetzner**, as the network provider, can see which IP addresses connect to the server, but not message contents.
- **Google's STUN servers**, the default, see your users' IP addresses when their browsers find a way to connect. `VITE_ICE_SERVERS` can point to another one.
- **sslip.io** turns the hostname into the IP address, so it sees the lookups. It and **Let's Encrypt's public Certificate Transparency logs** reveal the server's IP-based hostname, but not who uses it.
- **GitHub**: in a public fork, anyone signed in to GitHub can read the run summary with the URL, and the logs, until the run is deleted. With [log retention at 1 day](#keep-the-workflow-logs-for-1-day), that is a day after the run.

## What a deploy does

[`deploy-hetzner.yml`](../../.github/workflows/deploy-hetzner.yml):

1. Checks the settings, before it changes anything.
2. Works out the worst-case cost of every type in `HCLOUD_SERVER_TYPES` from [`prices.json`](../../deploy/hetzner/prices.json), with the shared [`packages/deploy`](../../packages/deploy/src/cli.ts), and stops if one is above `MAX_DEPLOY_COST_USD`, or if the location or a type isn't in the price file.
3. Installs `hcloud` 1.70.2, Hetzner's command-line tool, from its release, after checking its checksum.
4. Deletes any existing Paranoid server, running or off.
5. Creates a firewall of its own, `paranoid-<run id>` ([`firewall-rules.json`](../../deploy/hetzner/firewall-rules.json)): only TCP 80 and 443 get in. Everything else, port 22 included, is dropped.
6. Creates a Debian 13 server named `paranoid-<run id>`, trying each type in turn, behind that firewall from its first boot, and [`deploy/server/cloud-init.yaml`](../../deploy/server/cloud-init.yaml) as its setup data. Its login is a throwaway SSH key whose private half is deleted at once, so Hetzner sets and sends no root password. The key, the firewall and the server all get the labels `app=paranoid`, `run`, `created` and `expires` (the Unix times they were created and the lifetime ends), so the workflows find each of them, and Stop and Clean up Hetzner delete the firewall and key with the server.
7. Waits up to 10 minutes for `https://<host>/healthz` and a socket.io handshake. If they don't come up, it deletes the server and fails, with the reason from the last attempt.

On the server, cloud-init turns off SSH, locks root's password and sets a timer that powers off at the end of the lifetime. It then fetches exactly the deployed commit from the public repository with `git`, which checks every file against its hash, so the server needs no credentials. [`deploy/server/setup.sh`](../../deploy/server/setup.sh) from that commit does the rest:

- installs Node.js 24 and Caddy from pinned releases, after checking their checksums;
- runs `pnpm install --frozen-lockfile` and builds the app with `VITE_SIGNALING_SERVER=/`, as a user of its own;
- starts the signaling server as a locked-down systemd service on `127.0.0.1` only, with `MAX_INVITES`. When it exits because its last invite is finished, the server powers off;
- starts Caddy, which gets a Let's Encrypt certificate for `<ip-with-dashes>.sslip.io`, serves the app and passes `/socket.io/` and `/healthz` to the signaling server;
- limits all outbound traffic to `MAX_EGRESS_MBIT` with `tc`.

[`cleanup-hetzner.yml`](../../.github/workflows/cleanup-hetzner.yml) runs every hour on the default branch, which can't use the `hetzner-cleanup` environment, so it starts itself on `main`, which can. It deletes only servers that are past their lifetime, or off and created at least 15 minutes ago, so it never deletes a server that a deploy is still creating or setting up, and it can run at the same time as a deploy. [`stop-hetzner.yml`](../../.github/workflows/stop-hetzner.yml) deletes every Paranoid server right away. Deploy and Stop share a concurrency group, so a deploy waits for the one before it, and Stop Hetzner cancels a deploy that's running or waiting for approval. A running deploy then deletes its own server.
