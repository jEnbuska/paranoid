# Deploy Paranoid to Azure

This guide takes you from a GitHub account to your own Paranoid server in the EU, on [Microsoft Azure](https://azure.microsoft.com). You need no Azure experience, and you never log in to a server.

You start a server from GitHub Actions for a set number of invites. It powers itself off once the last invite is finished, or when its lifetime is over, and is then deleted within minutes. Nothing runs between uses. Chats that have started keep working after the server is gone, because they're peer to peer.

**There's no password, key or token to keep secret.** GitHub Actions proves to Azure which repository and environment a run comes from, and Azure trusts only yours. Nothing secret is stored in GitHub or anywhere else.

Azure's prices and rules below were checked on 2026-11-20. They can change, so check the linked pages too.

## Contents

1. [Words used in this guide](#words-used-in-this-guide)
2. [Fork the repository](#1-fork-the-repository)
3. [Sign up for Azure](#2-sign-up-for-azure)
4. [Run the one-time setup](#3-run-the-one-time-setup)
5. [Connect your fork to Azure](#4-connect-your-fork-to-azure)
6. [Optional settings](#5-optional-settings)
7. [Start a server](#6-start-a-server)
8. [Stop it, and how it's cleaned up](#7-stop-it-and-how-its-cleaned-up)
9. [Costs](#costs)
10. [Checking nothing is left](#checking-nothing-is-left)
11. [Why there's no secret](#why-theres-no-secret)
12. [Troubleshooting](#troubleshooting)
13. [Removing everything](#removing-everything)
14. [Privacy](#privacy)
15. [What a deploy does](#what-a-deploy-does)

## Words used in this guide

- **Azure portal:** Azure's website for managing everything, at [portal.azure.com](https://portal.azure.com). Its search bar at the top finds any page or resource by name.
- **Subscription:** the billing account that resources belong to. Every cost lands on one. A new account gets one, called _Azure subscription 1_ or similar.
- **Tenant:** your organization in Microsoft's sign-in system, Microsoft Entra ID. A personal account gets one of its own. GitHub signs in to it.
- **Region:** the data center area a resource lives in, for example `swedencentral` (Gävle, Sweden) or `germanywestcentral` (Frankfurt).
- **Resource group:** a folder for resources. Everything Paranoid makes is in one called `paranoid`, so deleting it deletes them all.
- **Resource:** anything you create in Azure, such as a VM, a disk or an IP address.
- **VM (virtual machine):** a virtual computer in Azure's data center. Its **size**, for example `Standard_B2ats_v2`, sets its CPUs, memory and price.
- **Stopped and deallocated:** a VM that shuts itself down is _Stopped_, and Azure still bills it like a running one. Only a _Stopped (deallocated)_ or deleted VM stops costing. That's why Paranoid deletes it.
- **Disk, NIC and public IP:** the VM's hard disk, its network card, and its internet address. Each is a resource of its own, billed while it exists.
- **NSG (network security group):** Azure's firewall. Paranoid's lets in only web traffic, on ports 80 and 443.
- **Managed identity:** a login for a program, not a person. GitHub Actions signs in as one called `paranoid-deployer`.
- **Federated credential:** the rule on that identity that says which GitHub repository and environment may sign in as it, through **OIDC**, a standard way for one service to vouch for another. No password or key is involved.
- **Role:** a list of what an identity may do, and where. Paranoid's roles work only inside the `paranoid` resource group.
- **Logic App:** a small automated workflow that runs inside Azure. Paranoid's, `paranoid-backstop`, deletes servers even if GitHub doesn't.
- **Cloud Shell:** a terminal in the Azure portal, already signed in, with Azure's command-line tool `az` installed.
- **GitHub environment:** a named set of settings in your fork that only chosen branches can use. Here it's `azure`, and only `main` can use it.

## 1. Fork the repository

1. Open [github.com/jEnbuska/paranoid](https://github.com/jEnbuska/paranoid) and click **Fork**, then **Create fork**.
2. In your fork, open the **Actions** tab. GitHub turns workflows off in new forks: click **I understand my workflows, go ahead and enable them**.

You should see the workflows **CI**, **Deploy to Azure**, **Stop Azure** and **Clean up Azure** in the list on the left.

The rest of this guide writes your fork as `<owner>/<repo>`, for example `alex/paranoid`. Write it exactly as in your fork's address, capitals included: Azure compares it letter by letter.

## 2. Sign up for Azure

1. Go to [azure.microsoft.com/pricing/purchase-options/azure-account](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account) and click **Try Azure for free**, or **Pay as you go** if you've had an Azure account before. Sign in with a Microsoft account, or create one. You can also sign in with GitHub.
2. Fill in your details. Azure checks:
   - **your phone number,** with a code by text message or call;
   - **a credit or debit card.** Prepaid cards aren't accepted. Azure may place a temporary hold of about $1 to check it, which goes away. With the free account, your card isn't charged unless you upgrade.
3. Accept the agreement and click **Sign up**. After a minute, you land in the [Azure portal](https://portal.azure.com).

You should see **Subscriptions** (search for it at the top) list one subscription, with the status **Active**.

**About the free account** (see [Azure's free account](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account) and its [FAQ](https://azure.microsoft.com/en-us/pricing/free-account-faq)):

- It's for **new Azure customers only**, one per person.
- **$200 of credit for 30 days.** A Paranoid deploy costs cents, so the credit covers far more than you'll use.
- **12 months of free services,** including 750 hours a month of the B1s, B2pts v2 and B2ats v2 VMs. Paranoid's default, `Standard_B2ats_v2`, is one of them. Microsoft's pages don't say whether the free hours apply in every region, so check your bill after the first deploy (see [Costs](#costs)).
- **After 30 days, or once the credit is used up,** Azure disables the subscription unless you **upgrade** to pay-as-you-go: in the portal, open **Subscriptions**, your subscription, and click **Upgrade**. The free services keep going for the rest of the 12 months. After upgrading, Azure charges your card for what you use beyond them.

## 3. Run the one-time setup

[`deploy/azure/bootstrap.sh`](../../deploy/azure/bootstrap.sh) creates what the deploys need. It's safe to run again: it changes only what isn't right yet. It takes a few minutes.

1. In the [Azure portal](https://portal.azure.com), click the **Cloud Shell** icon (`>_`) in the top bar.
2. If it asks, choose **Bash**. Under **Getting started**, choose **No storage account required**, pick your subscription and click **Apply**. A storage account would cost money; you don't need one.
3. Run these, with your fork's name and an email address for cost alerts:

   ```bash
   git clone https://github.com/<owner>/<repo>.git paranoid
   ```

   ```bash
   bash paranoid/deploy/azure/bootstrap.sh <owner>/<repo> <you@example.com>
   ```

You can also run it on your own computer, with the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) and `jq` installed, after `az login`.

To use another region than `swedencentral`, put `AZURE_REGION=germanywestcentral` (for example) before `bash`. Only the regions in [Costs](#costs) work.

It prints a section for each part, and at the end, **Done** and the commands for the next step. Keep the Cloud Shell open. What it made, in the resource group `paranoid`:

- **The firewall:** an NSG on the network that lets in only TCP 80 and 443. Port 22, SSH, is closed.
- **The identity** `paranoid-deployer`, with one federated credential that trusts only `repo:<owner>/<repo>:environment:azure`.
- **The role** _Paranoid deployer_ for that identity, which can only create and delete VMs, disks, NICs and public IPs in `paranoid`, and start the backstop. See [Why there's no secret](#why-theres-no-secret).
- **The backstop,** the Logic App `paranoid-backstop`, with the role _Paranoid backstop_, which can only delete those.
- **A budget** that emails you when Paranoid's costs pass 50% or 100% of 5 a month in your billing currency (USD or EUR, for example), or are forecast to. It's a late warning only: Azure checks costs a few times a day, and a budget never stops anything. To change the amount, put `BUDGET_AMOUNT=10` (for example) before `bash` and run it again.

None of these costs anything while no server runs. Azure also registers the services Paranoid uses in your subscription.

## 4. Connect your fork to Azure

GitHub needs to know which Azure identity to sign in as. These are IDs, not secrets, and go in **repository variables**. The deploy workflows use the GitHub **environment** `azure`, which only the `main` branch may use, and that's what Azure trusts.

### With the GitHub CLI

The setup printed the commands, with your IDs filled in. Run them where [`gh`](https://cli.github.com) is installed and signed in (`gh auth login`), for example on your own computer. They look like this:

```bash
gh variable set AZURE_CLIENT_ID --repo <owner>/<repo> --body <client-id>
```

There's one each for `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP` and `AZURE_REGION`, and two that create the environment and limit it to `main`.

### Or in GitHub's website

1. In your fork, go to **Settings** → **Secrets and variables** → **Actions** → **Variables** → **New repository variable**, and add each of the five variables with the value the setup printed.
2. Go to **Settings** → **Environments** → **New environment**, name it `azure` and click **Configure environment**.
3. Under **Deployment branches and tags**, choose **Selected branches and tags**, click **Add deployment branch or tag rule**, enter `main` and click **Add rule**.

Either way, **Settings** → **Secrets and variables** → **Actions** → **Variables** now lists the five variables, and **Settings** → **Environments** → **azure** shows the branch rule `main`. There are no secrets to add.

## 5. Optional settings

Everything works with the defaults. To change one, add a repository variable as in step 4, for example:

```bash
gh variable set LIFETIME_MINUTES --body 30 --repo <owner>/<repo>
```

The **Deploy to Azure** workflow's inputs win over the variables, and the variables over the defaults.

| Name                  | Default                           | What it does                                                                                                                                                                                |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAX_INVITES`         | `5`                               | Invites the server creates before it powers off, from 1 to 10000. The `max_invites` input overrides it.                                                                                     |
| `LIFETIME_MINUTES`    | `60`                              | Minutes until the server powers off at the latest, from 1 to 1440 (24 hours), counted from when it starts. The `lifetime_minutes` input overrides it.                                       |
| `MAX_EGRESS_MBIT`     | `2`                               | Limit on all the server's outbound traffic, in Mbit/s, from 1 to 50, against abuse and its cost. At 2 Mbit/s, the app's files load in about a second.                                       |
| `MAX_DEPLOY_COST_USD` | `1`                               | The most one deploy may cost in the worst case, in USD. A deploy that could cost more is refused before anything starts. See [Costs](#costs).                                               |
| `AZURE_REGION`        | `swedencentral`                   | Set by the setup. One of the regions in [Costs](#costs). To change it, run the setup again with the new `AZURE_REGION`, after [removing everything](#removing-everything).                  |
| `AZURE_VM_SIZE`       | `Standard_B2ats_v2`               | [VM size](https://learn.microsoft.com/azure/virtual-machines/sizes/general-purpose/basv2-series). `Standard_B1s` also works. For the Arm-based `Standard_B2pts_v2`, also set `AZURE_IMAGE`. |
| `AZURE_IMAGE`         | `Debian:debian-13:13-gen2:latest` | The Debian 13 image, as `publisher:offer:sku:version`. For an Arm size, use Debian's Arm image: `az vm image list --publisher Debian --offer debian-13 --all -o table` lists them.          |

Never put a password or token in a variable: variables are shown in logs and to anyone who can read the repository. Paranoid's Azure setup needs none.

The app uses Google's STUN servers unless `VITE_ICE_SERVERS` in [`packages/client-app/.env`](../../packages/client-app/.env) says otherwise. To use your own, change it in your fork and commit it. It isn't a secret: it's built into the app that every visitor downloads.

## 6. Start a server

1. In your fork, go to **Actions** → **Deploy to Azure** → **Run workflow**.
2. Keep **Use workflow from** on `main`. Optionally fill in the number of invites and the lifetime. Click **Run workflow**.
3. Click the run that appears. Setting up the server takes about 5 to 10 minutes, because it installs and builds the app itself.
4. When the run is green, its **Summary** shows the URL, `https://<ip-with-dashes>.sslip.io`, and when the server shuts down at the latest.

Or with `gh`:

```bash
gh workflow run deploy-azure.yml --ref main --repo <owner>/<repo> -f max_invites=5 -f lifetime_minutes=60
```

Open the URL, create an invite and open it in a second browser or on another device, such as your phone. The chat starts once both are connected.

Anyone who has the URL can create invites, which use up `max_invites`. In a public fork, anyone can read the run summary.

## 7. Stop it, and how it's cleaned up

- **Stop it now:** **Actions** → **Stop Azure** → **Run workflow** on `main` deletes every Paranoid server, with its disk, NIC and public IP, right away. Chats that have started keep working. Or: `gh workflow run stop-azure.yml --ref main --repo <owner>/<repo>`.
- **On its own:** the server powers off once the last invite is finished, or at the end of its lifetime. A powered-off VM is still billed, so two things delete it:
  - **the backstop,** in Azure, checks the server every 2 minutes and deletes it once it's stopped or its lifetime is over. Each deploy starts it, and it also runs once a day for anything left over. It doesn't depend on GitHub at all.
  - **Clean up Azure,** in GitHub, runs every 5 minutes and deletes Paranoid servers that are off or past their lifetime, and any disk, NIC or IP address left without a server. You can also run it by hand from the Actions tab.

Starting **Deploy to Azure** again first deletes any Paranoid server that's left, so there's only ever one.

GitHub can delay scheduled workflows, sometimes by more than an hour, and turns them off in a repository that has had no activity for 60 days. That's why the backstop exists.

## Costs

Checked on 2026-11-20 with Microsoft's [retail prices API](https://prices.azure.com/api/retail/prices), which the [pricing pages](https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/) use. Pay-as-you-go prices in USD, without VAT. Azure bills in your own currency at its exchange rate. The same prices are in [`deploy/azure/prices.json`](../../deploy/azure/prices.json), which [`fetch-prices.sh`](../../deploy/azure/fetch-prices.sh) refreshes.

What a server is made of, per hour:

| Part                                       | `swedencentral` | `germanywestcentral` | `northeurope` | `westeurope` |
| ------------------------------------------ | --------------- | -------------------- | ------------- | ------------ |
| VM `Standard_B2ats_v2` (2 CPUs, 1 GiB)     | $0.00972        | $0.0108              | $0.0102       | $0.0108      |
| VM `Standard_B1s` (1 CPU, 1 GiB)           | $0.0108         | $0.012               | $0.0113       | $0.012       |
| VM `Standard_B2pts_v2` (2 Arm CPUs, 1 GiB) | $0.0086         | $0.0096              | $0.0092       | $0.0096      |
| Disk, Standard SSD 32 GiB ($2.40 a month)  | $0.0033         | $0.0033              | $0.0033       | $0.0033      |
| Public IPv4 address, static                | $0.005          | $0.005               | $0.005        | $0.005       |
| **Total with the default size**            | **$0.018**      | **$0.019**           | **$0.019**    | **$0.019**   |

- **Outbound traffic:** the first 100 GB a month are free, for all your Azure use together. After that, $0.087 per GB from these regions. Inbound traffic is free. See [bandwidth pricing](https://azure.microsoft.com/en-us/pricing/details/bandwidth/).
- **A stopped VM costs as much as a running one** until it's deleted. The disk and IP address cost until they're deleted too.
- **The backstop** uses Logic Apps' built-in actions, of which the first 4,000 a month are free, then $0.000025 each. An hour-long deploy uses about 100.
- **Free:** the NSG, the network, the managed identity, the network watcher and the budget.
- **With the free account**, the VM's hours are covered for 12 months (750 hours a month of `Standard_B2ats_v2`, `Standard_B1s` or `Standard_B2pts_v2`), and the $200 credit covers the rest in the first 30 days.

**Worst case for one deploy.** Before starting anything, **Deploy to Azure** works out the most the deploy could cost: every started hour of the lifetime plus an hour for the cleanup, at the hourly price, plus outbound traffic at `MAX_EGRESS_MBIT` for the whole lifetime, without the free 100 GB. It refuses the deploy if that's above `MAX_DEPLOY_COST_USD`, $1 by default. With the defaults in `swedencentral`:

| Lifetime           | Worst case | Allowed with the default $1 limit                              |
| ------------------ | ---------- | -------------------------------------------------------------- |
| 60 minutes         | $0.11      | Yes                                                            |
| 24 hours, the most | $2.33      | No: set `MAX_DEPLOY_COST_USD` to 3, or lower `MAX_EGRESS_MBIT` |

A typical deploy of an hour, deleted within minutes of shutting down, costs about $0.02.

**Worst case for a month.** There's only ever one server. If it were never deleted, it would cost **$13.15** a month in `swedencentral`. If you deployed nonstop all month with traffic at the 2 Mbit/s limit the whole time, that's 657 GB, so about **$62**.

### Where to see the bill

- **Your costs:** in the portal, search for **Cost Management** → **Cost analysis**. Set the scope to the resource group `paranoid` to see only Paranoid. Costs show up after 8 to 24 hours.
- **The free account's credit and free services:** search for **Subscriptions**, open yours, and see **Overview**, or the **Free services** page.
- **Invoices:** **Cost Management + Billing** → **Invoices**.

### The budget alert

The setup created a budget, `paranoid`, for the resource group: **Cost Management** → **Budgets**, with the scope set to `paranoid`. It emails you at 50% and 100% of 5 a month, in your billing currency, and when Azure forecasts 100%. You can change the amount or the email addresses there. To also watch everything else in your subscription, create a budget for the whole subscription on the same page.

## Checking nothing is left

In the portal, search for **Resource groups** and open `paranoid`. Between deploys it should hold only these, which cost nothing:

- `paranoid-deployer` (managed identity), `paranoid-backstop` (Logic App), `paranoid-nsg` (network security group), `paranoid-vnet` (virtual network), and possibly `NetworkWatcher_<region>` (network watcher).

There should be **no** virtual machine, disk, network interface or public IP address named `paranoid-<number>…`. To check the whole subscription, search for **All resources** and filter by the tag `app` : `paranoid`.

To see what the backstop did, open `paranoid-backstop` → **Run history**.

If a server is left, run **Stop Azure**, or delete it in the portal: open the virtual machine, click **Delete**, and tick its disk, network interface and public IP address to delete them with it.

## Why there's no secret

There's nothing to leak, so there's nothing to rotate or revoke:

- **GitHub proves who's asking.** Each run of the deploy, stop and cleanup jobs gets a short-lived token from GitHub, signed by GitHub, saying which repository, branch and environment it comes from. Only those jobs may ask for one (`id-token: write`).
- **Azure checks it.** The identity's federated credential accepts only tokens for `repo:<owner>/<repo>:environment:azure`. The `azure` environment only allows `main`, and the workflows only run when started by hand or on their schedule, never from a pull request, so no fork or pull request can sign in.
- **Azure gives a short-lived login back,** valid for about an hour and for that run only. Nothing is stored in GitHub.
- **The server never gets any Azure credentials.** It doesn't use Azure's API: it only powers itself off, and the backstop or GitHub Actions deletes it.

What the identity may do, with the role _Paranoid deployer_, only in the `paranoid` resource group:

| Permission                                                                                                      | Why                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Microsoft.Resources/subscriptions/resourceGroups/read`, `resourceGroups/resources/read`                        | Reading the resource group and finding Paranoid's resources in it                                                             |
| `Microsoft.Resources/deployments/read`, `write`, `validate/action`, `operations/read`, `operationStatuses/read` | Creating the NIC and VM from [`server.json`](../../deploy/azure/server.json). A template can only create what the role allows |
| `Microsoft.Resources/tags/read`, `write`                                                                        | Tagging the VM's disk, which Azure creates untagged                                                                           |
| `Microsoft.Compute/virtualMachines/read`, `write`, `delete`, `instanceView/read`                                | Creating, listing with their power state, and deleting VMs                                                                    |
| `Microsoft.Compute/disks/read`, `write`, `delete`                                                               | The VM's disk                                                                                                                 |
| `Microsoft.Network/publicIPAddresses/read`, `write`, `delete`, `join/action`                                    | The VM's public IP address                                                                                                    |
| `Microsoft.Network/networkInterfaces/read`, `write`, `delete`, `join/action`                                    | The VM's NIC                                                                                                                  |
| `Microsoft.Network/virtualNetworks/read`, `subnets/read`, `subnets/join/action`                                 | Putting the NIC on the network the setup made                                                                                 |
| `Microsoft.Network/networkSecurityGroups/read`, `join/action`                                                   | Using the subnet's firewall. It can't change it                                                                               |
| `Microsoft.Compute/locations/operations/read`, `Microsoft.Network/locations/operations/read`                    | Waiting for Azure to finish creating or deleting something                                                                    |
| `Microsoft.Logic/workflows/triggers/run/action`                                                                 | Starting the backstop for a new server                                                                                        |

It can't change the firewall or the network, so it can't open port 22. It can't give anyone permissions, change identities, run commands on a VM, install VM extensions or change the backstop. The backstop's role, _Paranoid backstop_, can only read VMs and delete VMs, disks, NICs and public IPs.

## Troubleshooting

The run's log says which step failed and why. There's no SSH, so you can't log in to a server to look.

| What you see                                                                                      | What to do                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The repository variable AZURE_CLIENT_ID must be the ID that deploy/azure/bootstrap.sh printed"   | Set the variables as in [step 4](#4-connect-your-fork-to-azure). They're **repository** variables, not environment variables or secrets.                                                                                                          |
| `AADSTS700213` or `AADSTS70021`, "No matching federated identity record found"                    | Azure didn't recognize the run. Check that you started it on `main`, that the environment is named `azure`, and that you gave the setup your fork's name exactly as GitHub writes it, capitals included. Run the setup again with the right name. |
| "Branch is not allowed to deploy to azure", or the run waits for the environment                  | You started the workflow on another branch. Start it on `main`. Check the environment's deployment branch rule says `main`.                                                                                                                       |
| `AuthorizationFailed` right after the setup                                                       | Azure takes a few minutes to spread a new role everywhere. Wait 5 minutes and run it again. If it keeps happening, check that `AZURE_RESOURCE_GROUP` is `paranoid`, and run the setup again.                                                      |
| `MissingSubscriptionRegistration`                                                                 | Run the setup again: it registers the services Paranoid uses.                                                                                                                                                                                     |
| `SkuNotAvailable`, `ZonalAllocationFailed` or "capacity"                                          | Azure has no room for that VM size in the region right now. Try again later, or set `AZURE_VM_SIZE` to `Standard_B1s`.                                                                                                                            |
| `QuotaExceeded` or "Operation could not be completed as it results in exceeding approved … quota" | New subscriptions have small limits on CPUs per VM family. In the portal, search for **Quotas** → **Compute**, find the family (for example _Standard Basv2 Family vCPUs_) in your region and request 2 or more.                                  |
| "has no price for … in …"                                                                         | The region or size isn't in [`prices.json`](../../deploy/azure/prices.json). Use one from [Costs](#costs), or add it with `fetch-prices.sh` and commit it.                                                                                        |
| "This deployment could cost up to …, more than the limit"                                         | See [Costs](#costs). Shorten the lifetime, lower `MAX_EGRESS_MBIT`, or raise `MAX_DEPLOY_COST_USD`.                                                                                                                                               |
| An image isn't found                                                                              | Debian may have renamed it. List them with `az vm image list --publisher Debian --offer debian-13 --all -o table` in Cloud Shell and set `AZURE_IMAGE`.                                                                                           |
| "The app didn't come up in time"                                                                  | The server took too long to set up, or its setup failed. The deploy deleted it. The message gives the last reason, for example "Couldn't connect", which means the server never got as far as starting its web server. Run Deploy again.          |
| "HTTPS certificate problem"                                                                       | Let's Encrypt didn't give a certificate for the hostname. It allows only 5 certificates a week for the same hostname, which happens if you deploy many times in a week and get the same IP address. Wait, or try another region.                  |
| Your subscription is disabled                                                                     | The free account's 30 days or $200 are over. Upgrade it to pay-as-you-go, as in [step 2](#2-sign-up-for-azure).                                                                                                                                   |
| A server stays _Stopped_ and isn't deleted                                                        | Open `paranoid-backstop` → **Run history** to see what it did, and run **Stop Azure** or **Clean up Azure** by hand. If GitHub disabled Clean up Azure after 60 days without activity, enable it in the Actions tab.                              |
| The budget step says it couldn't create the budget                                                | Some subscription types can't have budgets made from the command line. Create one in **Cost Management** → **Budgets** instead.                                                                                                                   |

## Removing everything

1. Run [`teardown.sh`](../../deploy/azure/teardown.sh) in Cloud Shell, as in [step 3](#3-run-the-one-time-setup):

   ```bash
   bash paranoid/deploy/azure/teardown.sh
   ```

   Type `paranoid` when it asks. It deletes the budget, the roles, and the resource group with everything in it: any server, the identity, the backstop and the network. It ends with "Nothing tagged app=paranoid is left in this subscription."

2. [Check nothing is left](#checking-nothing-is-left): **Resource groups** no longer lists `paranoid`.
3. In your fork, delete the `azure` environment (**Settings** → **Environments** → **azure** → **Delete environment**) and the five `AZURE_` variables.
4. If you want to close your Azure account, first wait for the last invoice, then follow [Cancel your Azure subscription](https://learn.microsoft.com/azure/cost-management-billing/manage/cancel-azure-subscription): **Subscriptions** → your subscription → **Cancel subscription**. A free account you don't upgrade is disabled on its own after 30 days.

## Privacy

The server keeps no access logs. Its own logs hold only connections and errors, in memory, and go when it's deleted. Deleting the server deletes its disk. Paranoid turns on no Azure logging: no NSG flow logs, no Azure Monitor agent or other VM extensions, and no boot diagnostics, which would save the server's console output. What remains visible to others:

- **Microsoft**, as the network provider, can see which IP addresses connect to the server, but not message contents.
- **Azure's Activity Log** records every change to your resources, such as creating and deleting a server, for 90 days. It records management calls, not your users' traffic, and it can't be turned off. See it by searching for **Activity log**.
- **Google's STUN servers**, the default, see your users' IP addresses when their browsers find a way to connect. `VITE_ICE_SERVERS` can point to another one.
- **sslip.io** turns the hostname into the IP address, so it sees the lookups. It and **Let's Encrypt's public Certificate Transparency logs** reveal the server's IP-based hostname, but not who uses it.
- **GitHub**: in a public fork, anyone can read the run summary with the URL.

## What a deploy does

[`deploy-azure.yml`](../../.github/workflows/deploy-azure.yml):

1. Checks the settings ([`settings.sh`](../../deploy/azure/settings.sh)), before it changes anything.
2. Works out the worst-case cost ([`check-cost.mts`](../../deploy/azure/check-cost.mts)) and stops if it's above `MAX_DEPLOY_COST_USD`.
3. Signs in to Azure with Microsoft's [`azure/login`](https://github.com/Azure/login) action, through OIDC.
4. Deletes any existing Paranoid server, running or off, with its disk, NIC and public IP ([`delete-servers.sh`](../../deploy/azure/delete-servers.sh)).
5. Creates ([`create-server.sh`](../../deploy/azure/create-server.sh)):
   - a static public IPv4 address, `paranoid-<run id>-ip`. The VM only sees a private address, so its hostname, `<ip-with-dashes>.sslip.io`, is worked out here and passed to it;
   - from [`server.json`](../../deploy/azure/server.json), the NIC `paranoid-<run id>-nic` on the setup's network, and the VM `paranoid-<run id>` with its disk `paranoid-<run id>-disk`, and [`deploy/server/cloud-init.yaml`](../../deploy/server/cloud-init.yaml) as its setup data. Deleting the VM deletes the disk, NIC and IP with it. Its login is a throwaway SSH key whose private half is deleted at once, with password login off, and VM extensions and boot diagnostics are off.
   - Everything is tagged `app=paranoid`, `run`, `expires-at` (when its lifetime ends, in UTC) and `commit`.
6. Starts the backstop for the new server.
7. Waits up to 15 minutes for `https://<host>/healthz` and a socket.io handshake. If they don't come up, it deletes the server and fails, with the reason from the last attempt.

On the server, cloud-init turns off SSH, locks root's password and sets a timer that powers off at the end of the lifetime. It then fetches exactly the deployed commit from the public repository with `git`, which checks every file against its hash, so the server needs no credentials. [`deploy/server/setup.sh`](../../deploy/server/setup.sh) from that commit does the rest:

- installs Node.js 24 and Caddy from pinned releases, after checking their checksums;
- runs `pnpm install --frozen-lockfile` and builds the app with `VITE_SIGNALING_SERVER=/`, as a user of its own, with a temporary swap file on a 1 GB server;
- starts the signaling server as a locked-down systemd service on `127.0.0.1` only, with `MAX_INVITES`. When it exits because its last invite is finished, the server powers off;
- starts Caddy, which gets a Let's Encrypt certificate for `<ip-with-dashes>.sslip.io`, serves the app and passes `/socket.io/` and `/healthz` to the signaling server;
- limits all outbound traffic to `MAX_EGRESS_MBIT` with `tc`.

The backstop, [`backstop.json`](../../deploy/azure/backstop.json), lists the VMs tagged `app=paranoid`, checks each every 2 minutes, and deletes it, its NIC, IP address and disk once it's stopped, deallocated or past `expires-at`. [`cleanup-azure.yml`](../../.github/workflows/cleanup-azure.yml) does the same from GitHub every 5 minutes: it runs on the default branch, which can't use the `azure` environment, so it starts itself on `main`, which can. [`stop-azure.yml`](../../.github/workflows/stop-azure.yml) deletes every Paranoid server right away. The three workflows share a concurrency group, so only one of them changes servers at a time, and Stop Azure cancels a deploy that's in progress, which then deletes its own server.
