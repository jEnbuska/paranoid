# Deploy Paranoid to AWS

This guide takes you from a GitHub account to your own Paranoid server in the EU, on [Amazon Web Services (AWS)](https://aws.amazon.com), in Stockholm by default. You need no AWS experience, and you never log in to a server.

You start a server from GitHub Actions for a set number of invites. It powers itself off once the last invite is finished, or when its lifetime is over, and powering off deletes it. If that ever fails, AWS deletes it at the end of its lifetime anyway. Nothing runs between uses. Chats that have started keep working after the server is gone, because they're peer to peer.

There's no password, key or token to copy anywhere. GitHub Actions proves to AWS which repository and branch it's running for, and gets permissions that last for one run.

This page is AWS's part of [Deploying Paranoid](README.md), which explains how deploying works on every provider, the shared settings and the cost limit.

AWS's prices and rules below were checked on 2026-11-20. They can change, so check the linked pages too.

## What this deployment needs

Everything this deployment needs from GitHub, by name. It also reads the [shared repository variables](README.md#shared-repository-variables).

### Environments

| Environment   | Branches    | Required reviewers | Used by                           |
| ------------- | ----------- | ------------------ | --------------------------------- |
| `aws`         | `main` only | You                | `deploy-aws.yml`                  |
| `aws-cleanup` | `main` only | None               | `cleanup-aws.yml`, `stop-aws.yml` |

### Secrets

No secrets. The workflows sign in to AWS with GitHub's OIDC token, which AWS trusts only for these two environments, so there's no access key or token to store anywhere.

### Variables

| Variable                 | Set in                  | What it does                                                                                                               | Required | Default      | Explained in                          |
| ------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ------------------------------------- |
| `AWS_ROLE_ARN`           | `aws` and `aws-cleanup` | The role the job signs in as: `paranoid-deploy` in `aws`, and `paranoid-cleanup`, which can only delete, in `aws-cleanup`. | Yes      | None         | [Step 5](#5-connect-your-fork-to-aws) |
| `AWS_SCHEDULER_ROLE_ARN` | `aws`                   | The `paranoid-scheduler` role the backstop schedule uses to terminate a server at its expiry.                              | Yes      | None         | [Step 5](#5-connect-your-fork-to-aws) |
| `AWS_SECURITY_GROUP_ID`  | `aws`                   | The `paranoid` security group, which lets in only TCP 80 and 443.                                                          | Yes      | None         | [Step 5](#5-connect-your-fork-to-aws) |
| `AWS_REGION`             | Repository              | The region the server runs in: `eu-north-1`, `eu-central-1` or `eu-west-1`.                                                | Optional | `eu-north-1` | [Step 6](#6-optional-settings)        |
| `AWS_INSTANCE_TYPE`      | Repository              | The server's size: `t4g.micro`, `t4g.small`, `t3.micro` or `t3.small`.                                                     | Optional | `t4g.micro`  | [Step 6](#6-optional-settings)        |

None of them is a secret. The IDs are environment variables, so only jobs in their environment can read them, and the setup script in [step 4](#4-run-the-one-time-setup) prints the commands that set them. The region and the size are repository variables, like the [shared ones](README.md#shared-repository-variables).

## Contents

1. [What this deployment needs](#what-this-deployment-needs)
2. [Words used in this guide](#words-used-in-this-guide)
3. [Fork the repository](#1-fork-the-repository)
4. [Sign up for AWS](#2-sign-up-for-aws)
5. [Prepare the account](#3-prepare-the-account)
6. [Run the one-time setup](#4-run-the-one-time-setup)
7. [Connect your fork to AWS](#5-connect-your-fork-to-aws)
8. [Optional settings](#6-optional-settings)
9. [Start a server](#7-start-a-server)
10. [Stop it, and how it's cleaned up](#8-stop-it-and-how-its-cleaned-up)
11. [Costs](#costs)
12. [Checking nothing is left](#checking-nothing-is-left)
13. [The credentials](#the-credentials)
14. [Troubleshooting](#troubleshooting)
15. [Removing everything](#removing-everything)
16. [Privacy](#privacy)
17. [What a deploy does](#what-a-deploy-does)

## Words used in this guide

- **Console:** AWS's website for managing your account, at [console.aws.amazon.com](https://console.aws.amazon.com).
- **Root user:** the login you create when you sign up, with your email address and password. It can do everything in the account, including closing it.
- **Region:** the place AWS runs things, for example `eu-north-1` in Stockholm or `eu-central-1` in Frankfurt. The console shows the current one at the top right. Most things you create belong to one region, and you only see them while that region is selected.
- **EC2 instance:** a virtual computer in AWS's data center (EC2 is AWS's name for the service). Its **instance type** is its size and price, for example `t4g.micro`: 2 virtual CPUs and 1 GiB of memory, on an Arm processor.
- **EBS volume:** an instance's disk. Here it's deleted with the instance.
- **Terminate:** AWS's word for deleting an instance for good. A **stopped** instance still exists, and its disk is still billed. Paranoid's instances never stop: powering off terminates them.
- **Security group:** a firewall for instances. Paranoid's lets in only web traffic.
- **IAM:** AWS's system of logins and permissions. An **IAM role** is a set of permissions that someone or something can take on for a while, without a password.
- **OIDC (OpenID Connect):** the way GitHub Actions proves to AWS which repository, branch and environment a run belongs to. AWS then lets the run take on a role for an hour at most.
- **EventBridge Scheduler:** an AWS service that does something at a set time. Here it terminates a server at the end of its lifetime, in case the server didn't power itself off.
- **CloudShell:** a command line in your browser, inside the console, already signed in to your account. You run the setup script there, so you don't install anything.
- **AWS Budgets:** emails you when your costs pass an amount you choose.
- **GitHub environment:** a named set of rules in your fork for the workflow runs that use it: which branches may use it, and who must approve a run before it starts. Here there are two, both for `main` only: `aws` for deploys, which wait for your approval, and `aws-cleanup` for stopping and cleaning up, which don't.
- **Required reviewer:** someone who must click **Approve** before a run that uses the environment starts. Here it's you.

## 1. Fork the repository

1. Open [github.com/jEnbuska/paranoid](https://github.com/jEnbuska/paranoid) and click **Fork**, then **Create fork**. Keep the fork **public**: the setup script looks it up on GitHub without signing in, and the server downloads its code from it.
2. In your fork, open the **Actions** tab. GitHub turns workflows off in new forks: click **I understand my workflows, go ahead and enable them**.

You should see the workflows **Deploy to AWS**, **Stop AWS** and **Clean up AWS** in the list on the left.

The rest of this guide writes your fork as `<owner>/<repo>`, for example `alex/paranoid`.

## 2. Sign up for AWS

1. On [aws.amazon.com](https://aws.amazon.com), click **Create an AWS account**.
2. Enter your email address and an account name, for example `paranoid`. AWS emails you a code: enter it. Then choose a strong password for the root user.
3. Choose a plan:
   - **Free plan:** up to 6 months, or until your credits are used up, whichever comes first. You get **$100 of credits** at once, and up to **$100 more** for trying some services, $20 each, for example launching an EC2 instance or setting up a budget (both of which this guide does). AWS takes the cost of what you use from the credits, and can't charge you more. At the end, AWS **closes the account** unless you upgrade it to the Paid plan: you lose access, AWS keeps your data for 90 days and then deletes the account. The Free plan also can't use some AWS services.
   - **Paid plan:** you pay for what you use, after the same credits. Choose it if you want the account to keep working after 6 months.
   - You can upgrade from Free to Paid at any time in the console. See [AWS Free Tier](https://aws.amazon.com/free/) and its [FAQ](https://aws.amazon.com/free/free-tier-faqs/).
4. Fill in your contact details.
5. **Payment method:** AWS says most new customers don't need one on the Free plan, but it may ask for a card to check your identity. The Paid plan needs one. AWS may make a small temporary charge on the card to check it.
6. **Identity check:** AWS may ask for your phone number and send a code by text message or call.
7. Choose the free **Basic support** plan, and finish.

You should be able to sign in to the [console](https://console.aws.amazon.com) as the root user. A new account can take a few minutes, and sometimes a few hours, before it can start instances: see [Troubleshooting](#troubleshooting) if the first deploy says the account is being verified.

## 3. Prepare the account

The root user can do everything, so give it a second factor before anything else:

1. In the console, click your account name at the top right → **Security credentials**.
2. Under **Multi-factor authentication (MFA)**, click **Assign MFA device**, and follow the steps for a passkey, a security key or an authenticator app.
3. On the same page, under **Access keys**, there should be none. Don't create one: nothing in this guide needs one.

## 4. Run the one-time setup

The script [`deploy/aws/bootstrap.sh`](../../deploy/aws/bootstrap.sh) creates everything the workflows need, in one region. Nothing it creates costs anything while no server runs. You run it in CloudShell, so you don't install anything.

1. In the console, choose the region **Europe (Stockholm) eu-north-1** at the top right.
2. Click the **CloudShell** icon (a square with `>_`) in the top bar, or search for CloudShell. Wait until you see a prompt, which takes a minute the first time.
3. Copy your fork and run the script, with your fork's name and the email address for budget alerts:

   ```bash
   git clone https://github.com/<owner>/<repo>.git paranoid
   ```

   ```bash
   cd paranoid && AWS_REGION=eu-north-1 bash deploy/aws/bootstrap.sh <owner>/<repo> <your-email>
   ```

   For another region, change `AWS_REGION` to `eu-central-1` (Frankfurt) or `eu-west-1` (Ireland).

4. The script says what it created, and ends with the commands for the next step: first the two environments, then the IDs in them, like these with your account's values, then the region and the log retention:

   ```text
   gh variable set AWS_ROLE_ARN --env aws --repo <owner>/<repo> --body arn:aws:iam::<account-id>:role/paranoid-deploy
   gh variable set AWS_SCHEDULER_ROLE_ARN --env aws --repo <owner>/<repo> --body arn:aws:iam::<account-id>:role/paranoid-scheduler
   gh variable set AWS_SECURITY_GROUP_ID --env aws --repo <owner>/<repo> --body sg-<id>
   gh variable set AWS_ROLE_ARN --env aws-cleanup --repo <owner>/<repo> --body arn:aws:iam::<account-id>:role/paranoid-cleanup
   ```

   Keep it all for the next step. None of it is a secret.

5. AWS Budgets emails you to confirm the alert address only if it's new to AWS. Check your inbox.

Running the script again is safe: it fixes anything that's different and creates only what's missing. Run it again after you rename your fork, or to change the region or the budget (`BUDGET_USD=10` before `bash`, default 5).

What it created, all named `paranoid`, is listed in [The credentials](#the-credentials).

## 5. Connect your fork to AWS

Your fork is public, so everyone can see its workflow runs and their logs, and anyone with write access to it could start a workflow. Three settings keep that safe:

- **Deploys wait for you.** The `aws` environment has you as its required reviewer, so every deploy waits until you approve it, even one someone else started. Only `main` may use it, and the `paranoid-deploy` role trusts only jobs in it, so nothing else can start a server in your AWS account.
- **Stopping and cleaning up don't wait.** **Stop AWS** and the hourly **Clean up AWS** use a second environment, `aws-cleanup`, with no reviewer, so they work at once, even when you're away. Its role, `paranoid-cleanup`, can only list and terminate Paranoid's servers, so it can't cost you anything.
- **Logs go after a day.** Run logs show the server's URL and IP address, and your AWS account ID in the role names. None of that is secret, but there's no reason to keep it public, so the logs are deleted after 1 day, the shortest GitHub allows.

Keep your fork public, as step 1 says. GitHub offers required reviewers only on public repositories, unless you pay for GitHub Enterprise. A private copy on GitHub Pro or Team can still limit the environments to `main`, but deploys then don't wait for anyone's approval. On GitHub Free, a private repository has no environments at all, so neither protection works. See [Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

With [`gh`](https://cli.github.com) signed in to your GitHub account on your own computer, you can run the commands the setup script printed, in the order it printed them. Or follow the clicks below in GitHub's website. Either way, the environments come first, because the IDs go in them.

### The environments

With `gh`: the four `gh api` commands. The first one makes you the `aws` environment's required reviewer: `gh api user --jq .id` looks up your GitHub user ID.

In GitHub's website:

1. **The `aws` environment:** in your fork, go to **Settings** → **Environments** → **New environment**, name it `aws` and click **Configure environment**. Then:
   1. Tick **Required reviewers**, type your own GitHub username in the box and choose yourself.
   2. Leave **Prevent self-review** unticked. Ticked, it would stop you approving the deploys you start yourself, and you're the only reviewer.
   3. Click **Save protection rules**.
   4. Under **Deployment branches and tags**, choose **Selected branches and tags**, click **Add deployment branch or tag rule**, enter `main` and click **Add rule**.
2. **The `aws-cleanup` environment:** go back to **Settings** → **Environments** → **New environment**, name it `aws-cleanup` and click **Configure environment**. Leave **Required reviewers** unticked. Under **Deployment branches and tags**, choose **Selected branches and tags** and add the rule `main`, as above.

### The IDs in them

AWS needs no secret, only the IDs of what the setup script created. Each goes in the environment whose jobs use it, so no other job can read it. `AWS_ROLE_ARN` has a different value in each: the deploy role in `aws`, and the cleanup role, which can only delete, in `aws-cleanup`.

With `gh`: the four `gh variable set … --env` commands, then `gh variable set AWS_REGION`.

In GitHub's website:

1. In **Settings** → **Environments** → **aws**, under **Environment variables**, click **Add environment variable** for each of `AWS_ROLE_ARN`, `AWS_SCHEDULER_ROLE_ARN` and `AWS_SECURITY_GROUP_ID`, with the value after `--body` in the commands for `--env aws`, and click **Add variable**.
2. In **Settings** → **Environments** → **aws-cleanup**, add `AWS_ROLE_ARN` the same way, with the value from the command for `--env aws-cleanup`: the cleanup role.
3. In **Settings** → **Secrets and variables** → **Actions** → **Variables** tab, click **New repository variable** and add `AWS_REGION`, with the region the script printed.

### Log retention

With `gh`: the last `gh api` command, `artifact-and-log-retention`.

In GitHub's website: go to **Settings** → **Actions** → **General**. Under **Check, workflow run, status, artifact and log retention**, enter `1` and click **Save**.

### What you should see

- **Settings** → **Environments** → **aws**: **Required reviewers** with your username, the branch rule `main`, and three environment variables;
- **Settings** → **Environments** → **aws-cleanup**: the branch rule `main`, no reviewers, and one environment variable, `AWS_ROLE_ARN`;
- **Settings** → **Secrets and variables** → **Actions** → **Variables**: the repository variable `AWS_REGION`;
- **Settings** → **Actions** → **General**: a retention of 1 day.

There are no secrets to add.

## 6. Optional settings

Everything works with the defaults. The number of invites, the lifetime, the outbound limit and the cost limit are the [shared repository variables](README.md#shared-repository-variables), the same for every provider. AWS outbound traffic costs money, so a higher `MAX_EGRESS_MBIT` makes each deploy's worst case more expensive; see [Costs](#costs).

AWS's own two, set the same way, in **Settings** → **Secrets and variables** → **Actions** → **Variables**, or with `gh`, for example:

```bash
gh variable set AWS_INSTANCE_TYPE --body t4g.small --repo <owner>/<repo>
```

| Name                | Default      | What it does                                                                                                                                            |
| ------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AWS_INSTANCE_TYPE` | `t4g.micro`  | Instance type: `t4g.micro` or `t4g.small` (Arm), `t3.micro` or `t3.small` (Intel). `t4g.nano` isn't allowed: it has too little memory to build the app. |
| `AWS_REGION`        | `eu-north-1` | Set by the setup script. To change it, run the script again with the new `AWS_REGION`, and set the variable to the same region.                         |

The **Deploy to AWS** workflow's inputs win over the variables, and the variables over the defaults.

Never put a password, key or token in a variable: variables are shown in logs and to anyone with access to the repository. The workflows need none.

The app uses Google's STUN servers unless `VITE_ICE_SERVERS` in [`packages/client-app/.env`](../../packages/client-app/.env) says otherwise. To use your own, change it in your fork and commit it. It isn't a secret: it's built into the app that every visitor downloads.

## 7. Start a server

1. In your fork, go to **Actions** → **Deploy to AWS** → **Run workflow**.
2. Keep **Use workflow from** on `main`. Optionally fill in the number of invites and the lifetime. Click **Run workflow**.
3. Click the run that appears. It shows **Waiting** and "This workflow is waiting for review". Click **Review deployments**, tick **aws** and click **Approve and deploy**. Nothing runs, and nothing in AWS changes, until you do.
4. The step **Check the worst-case cost** shows the most this deploy can cost. Setting up the server takes a few minutes, because it installs and builds the app itself.
5. When the run is green, its **Summary** shows the URL, `https://<ip-with-dashes>.sslip.io`, and when the server shuts down at the latest.

Or start it with `gh`, then approve it on the run's page as in step 3:

```bash
gh workflow run deploy-aws.yml --ref main --repo <owner>/<repo> -f max_invites=5 -f lifetime_minutes=60
```

Open the URL, create an invite and open it in a second browser or on another device, such as your phone. The chat starts once both are connected.

Anyone who has the URL can create invites, which use up `max_invites`. In a public fork, anyone can read the run summary and logs until they're deleted after a day.

## 8. Stop it, and how it's cleaned up

- **Stop it now:** **Actions** → **Stop AWS** → **Run workflow** on `main` terminates every Paranoid server right away. Chats that have started keep working. It doesn't wait for an approval. Or: `gh workflow run stop-aws.yml --ref main --repo <owner>/<repo>`.
- **On its own:** the server powers off once the last invite is finished, or at the end of its lifetime, and AWS terminates it when it does. Its disk and IP address go with it.
- **The backstop:** each deploy also creates a one-time EventBridge Scheduler schedule that terminates the server 5 minutes after its lifetime ends, even if the server never powered itself off. The schedule deletes itself afterwards.
- **Clean up AWS** runs every hour and terminates any Paranoid server that's past its lifetime, in case both of the above failed. It doesn't wait for an approval either. You can also run it by hand from the Actions tab. GitHub can delay scheduled workflows and turns them off in a repository that has had no activity for 60 days, which is why it isn't the only safeguard.

Starting **Deploy to AWS** again first terminates any Paranoid server that's left, so there's only ever one.

## Costs

Checked on 2026-11-20 in AWS's price lists, the data behind its [EC2 pricing](https://aws.amazon.com/ec2/pricing/on-demand/), [VPC pricing](https://aws.amazon.com/vpc/pricing/) (public IPv4) and [EBS pricing](https://aws.amazon.com/ebs/pricing/) pages, for Stockholm. The deploy uses the same prices, from [`deploy/aws/prices.json`](../../deploy/aws/prices.json). Prices are in US dollars, before VAT.

| What                                   | Price                               | Per hour with the defaults          |
| -------------------------------------- | ----------------------------------- | ----------------------------------- |
| `t4g.micro` instance, the default      | $0.0086 an hour                     | $0.0086                             |
| `t4g.small` / `t3.micro` / `t3.small`  | $0.0172 / $0.0108 / $0.0216 an hour |                                     |
| Public IPv4 address                    | $0.005 an hour                      | $0.005                              |
| 8 GB gp3 disk                          | $0.0836 per GB a month              | $0.0009                             |
| Outbound traffic to the internet       | $0.09 per GB                        | $0.081 at most (0.9 GB at 2 Mbit/s) |
| Inbound traffic                        | Free                                |                                     |
| EventBridge Scheduler                  | 14 million calls a month free       | $0                                  |
| Security group, IAM, OIDC, AWS Budgets | Free                                | $0                                  |

- **Billed by the second** for the instance, with a minute at least. The disk and the IP address go with the instance, so nothing is billed after it terminates.
- **The first 100 GB of outbound traffic each month are free**, across your whole account. A chat's messages don't go through the server, so a deploy usually sends a few megabytes: the app's files, once per visitor.
- **The worst case for one deploy** is the lifetime plus the 5 minutes before the backstop, rounded up to whole hours, with the server sending at `MAX_EGRESS_MBIT` the whole time and nothing free. The deploy computes it before it starts anything and refuses if it's above `MAX_DEPLOY_COST_USD`:
  - 60 minutes, the default: **$0.12**;
  - 10 hours: $0.98;
  - 24 hours, the most: $2.31, so it needs `MAX_DEPLOY_COST_USD` of at least 2.32, or a lower `MAX_EGRESS_MBIT`.
- **A typical deploy** of an hour costs about $0.02, which your credits cover.
- **The worst case for a month:** only you can start a server, and only one runs at a time, for at most 24 hours. If you kept restarting it all month and it sent at 2 Mbit/s nonstop, it would cost about $60. Each deploy says its own worst case before it starts, and the budget alert warns you.
- **CPU:** the instance runs in **standard** CPU credit mode, so using a lot of CPU slows it down rather than costing extra.
- **Credits:** on the Free plan, AWS takes all of this from your credits and can't charge you. AWS's pages say credits expire 6 months after you open the account, or 12 months after it on the Paid plan; check **Billing and Cost Management** → **Credits** for yours.

### Budget alert

The setup script created a budget called `paranoid` of $5 a month. AWS emails you when the month's costs pass 80% of it, or are forecast to pass 100%. It covers your whole account. It's a late warning only: AWS updates costs a few times a day, so an alert can come hours after the cost. To change the amount, run the setup script again with `BUDGET_USD=<dollars>` before `bash`. See it in the console under **Billing and Cost Management** → **Budgets**.

### Where to see the bill

In the console, search for **Billing and Cost Management**:

- **Home** shows this month's costs so far, and **Bills** lists them by service and region.
- **Free Tier** and **Credits** show your remaining credits and when they expire.
- **Cost Explorer** charts costs by day and service. It's free to view in the console.

## Checking nothing is left

In the console, with the region set to the one you deployed in (Stockholm by default), check:

- **EC2** → **Instances:** no instance named `paranoid-<number>` that's running or stopped. A terminated one stays in the list, greyed out, for about an hour. It isn't billed.
- **EC2** → **Volumes:** no volume tagged `app: paranoid`.
- **EC2** → **Elastic IPs:** nothing. The deploy never creates any: the IP address goes with the instance.
- **Amazon EventBridge** → **Scheduler** → **Schedules**, schedule group `paranoid`: no schedule for a server that's gone. A leftover one costs nothing and deletes itself once its time has passed.

To search every region at once, open **Resource Groups & Tag Editor** → **Tag Editor**, choose **All regions** and **All supported resource types**, enter the tag key `app` and value `paranoid`, and click **Search resources**. Between deploys, it should find only the security group and, if your account shows them, the roles, schedule group and OIDC provider, which cost nothing.

**Billing and Cost Management** → **Bills** shows what each service cost. With nothing running, EC2 adds nothing more.

If a server is left, run **Stop AWS**, or select it in **EC2** → **Instances** and choose **Instance state** → **Terminate (delete) instance**.

## The credentials

There's no secret: nothing in your fork, its environments or its variables can give anyone access to your AWS account.

- **No access keys, no secrets.** GitHub Actions gets an OIDC token for each job, which says which repository and environment the job is for. AWS checks it and gives the job credentials for a role that last for one hour at most. They're never stored.
- **Only your fork, only `main`, only with your approval.** The `paranoid-deploy` role trusts only jobs of your fork that use the `aws` environment, which only `main` may use and which waits for you to approve each run. The `paranoid-cleanup` role trusts only jobs in `aws-cleanup`, which only `main` may use too. A pull request, another branch or another repository can't use either. The trust uses your GitHub account's and repository's numeric IDs (for repositories created from 15 July 2026, and both IDs and names for older ones), so someone who later takes your username can't use it either.
- **Only Paranoid's servers.** The `paranoid-deploy` role can only:
  - start instances that are tagged `app=paranoid`, from Debian's own images, of the small instance types above, with IMDSv2 required, in the default network with the `paranoid` security group;
  - terminate instances tagged `app=paranoid`;
  - list instances, images and subnets (AWS doesn't allow limiting these);
  - read the name of Debian's latest image;
  - create and delete the backstop schedules, and let EventBridge Scheduler use its own role.
    It can't change the security group, create roles, read anything else or touch any other resource.
- **The `paranoid-cleanup` role**, for Stop AWS and Clean up AWS, can only list instances, terminate those tagged `app=paranoid` and delete their backstop schedules. It can't start anything.
- **The `paranoid-scheduler` role** can only terminate instances tagged `app=paranoid`, and only EventBridge Scheduler, for schedules in the `paranoid` group of your account, can use it.
- **The IDs are environment variables.** The role ARNs, the security group and the scheduler's role are in the environments that use them, not repository variables, so a workflow outside them can't even read them. They aren't secrets: an ARN alone lets no one in.
- **The server has no credentials at all:** no role, and no secret in its setup data. It powers itself off, and that terminates it.
- **Public logs hold nothing secret.** There's no secret for a workflow to print. The logs show the server's URL and IP address, instance IDs, and your AWS account ID inside the role names, which AWS doesn't treat as secret either. They're deleted after a day.

The setup script created, in the region you chose: the security group `paranoid` (inbound TCP 80 and 443 only; no SSH), the schedule group `paranoid`; and for the whole account: the roles `paranoid-deploy`, `paranoid-cleanup` and `paranoid-scheduler`, the OIDC provider `token.actions.githubusercontent.com` (unless your account had one already) and the budget `paranoid`.

**If something looks wrong,** for example an instance you didn't start: run **Stop AWS**, then in your fork delete the `aws` environment, which stops every workflow from using the deploy role, and check [Checking nothing is left](#checking-nothing-is-left). The root user's password and MFA are the keys to the account, so keep those safe.

## Troubleshooting

The run's log says which step failed and why. There's no SSH, so you can't log in to a server to look.

| What you see                                                                                                  | What to do                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The **Preflight** step lists something missing or wrong, such as "The variable AWS_ROLE_ARN isn't set in aws" | Each line links the step of this guide that fixes it. The IDs are **environment** variables of `aws` or `aws-cleanup`, not repository variables or secrets, and `AWS_ROLE_ARN` has the cleanup role in `aws-cleanup`. The preflight checks only the value a job sees, so a variable set for the whole repository by mistake still passes: check that it's under the environment. |
| "Not authorized to perform sts:AssumeRoleWithWebIdentity"                                                     | The role doesn't trust this run. Check that you started the workflow on `main`, that the environment is called exactly `aws`, and that each environment's `AWS_ROLE_ARN` is from the same AWS account: the deploy role in `aws`, the cleanup role in `aws-cleanup`. If you renamed or transferred your fork, run the setup script again.                                         |
| "No OpenIDConnect provider found"                                                                             | The setup script hasn't run in this account, or `teardown.sh` removed it. Run the setup script.                                                                                                                                                                                                                                                                                  |
| A deploy shows **Waiting** and "This workflow is waiting for review"                                          | That's the approval: click **Review deployments**, tick **aws** and click **Approve and deploy**. If you don't see the button, you aren't the environment's required reviewer: add yourself as in [step 5](#5-connect-your-fork-to-aws).                                                                                                                                         |
| You can't approve your own deploy                                                                             | **Prevent self-review** is ticked on the `aws` environment. Untick it and click **Save protection rules**.                                                                                                                                                                                                                                                                       |
| "… started this run, but only someone with admin permission on the repository may"                            | Only you, as the repository's admin, may deploy or stop: a collaborator with write access can't. Start the run yourself.                                                                                                                                                                                                                                                         |
| Stop AWS or Clean up AWS waits for review                                                                     | The `aws-cleanup` environment has a required reviewer. Remove it, so they never wait.                                                                                                                                                                                                                                                                                            |
| "Branch is not allowed to deploy to aws" (or `aws-cleanup`)                                                   | You started the workflow on another branch. Start it on `main`. Check the environment's deployment branch rule says `main`.                                                                                                                                                                                                                                                      |
| "The worst case … is more than the limit"                                                                     | The deploy refused before starting anything. The message says the longest lifetime that fits. Choose a shorter lifetime or a lower `MAX_EGRESS_MBIT`, or raise `MAX_DEPLOY_COST_USD`.                                                                                                                                                                                            |
| The preflight says `AWS_REGION` or `AWS_INSTANCE_TYPE` "doesn't match"                                        | Only the regions and types in [step 6](#6-optional-settings) work. They're the ones with prices in `deploy/aws/prices.json`, so the cost check always has a price, and the deploy role allows only those types.                                                                                                                                                                  |
| `UnauthorizedOperation` when starting the instance                                                            | The role's permissions are for another region, security group or instance type. Run the setup script again with the same `AWS_REGION` as the variable, and set the variables it prints.                                                                                                                                                                                          |
| "Your request for accessing resources in this region is being validated", `PendingVerification` or `Blocked`  | A new account can take up to a few hours before it can start instances. Wait and run Deploy again. If it lasts more than a day, ask AWS Support (the free Basic plan can open account and billing cases).                                                                                                                                                                        |
| An error saying the Free plan can't use a service, or that a subscription is needed                           | Upgrade the account to the Paid plan in **Billing and Cost Management**. Your credits stay.                                                                                                                                                                                                                                                                                      |
| `InsufficientInstanceCapacity` in every zone                                                                  | AWS has no free `t4g.micro` in the region right now. Try again later, or set `AWS_INSTANCE_TYPE` to another type.                                                                                                                                                                                                                                                                |
| "The app didn't come up in time"                                                                              | The server took too long to set up, or its setup failed. The deploy terminated it. The message gives the last reason, for example "Couldn't connect", which means the server never got as far as starting its web server. Run Deploy again.                                                                                                                                      |
| "HTTPS certificate problem"                                                                                   | Let's Encrypt didn't give a certificate for the hostname. It allows only 5 certificates a week for the same hostname, which can happen if you get the same IP address again. Run Deploy again to get another address.                                                                                                                                                            |
| The setup script says "This needs version 2 of the aws CLI" or "isn't signed in"                              | Run it in CloudShell, which has both.                                                                                                                                                                                                                                                                                                                                            |
| The setup script says "Couldn't look up … on GitHub"                                                          | Check the `<owner>/<repo>` you gave it, and that the fork is public.                                                                                                                                                                                                                                                                                                             |
| A server is left after its lifetime                                                                           | The backstop schedule or the server's own timer failed, and Clean up AWS hasn't run: GitHub delays scheduled runs, and turns them off after 60 days without activity. Run **Stop AWS**, and check **Actions** → **Clean up AWS** is enabled.                                                                                                                                     |

## Removing everything

1. Run **Stop AWS**, then [check nothing is left](#checking-nothing-is-left).
2. In CloudShell, in the same region as before, run the teardown script. It terminates anything that's left and deletes everything the setup script created, and only that:

   ```bash
   cd paranoid && bash deploy/aws/teardown.sh
   ```

   It asks before it deletes anything. If the `paranoid` folder is gone, clone your fork again as in [step 4](#4-run-the-one-time-setup). It keeps an OIDC provider that was there before the setup script ran, in case something else uses it.

3. In your fork, delete the `aws` and `aws-cleanup` environments (**Settings** → **Environments** → the environment → **Delete environment**), which deletes their variables too, and the repository variables starting with `AWS_` (**Settings** → **Secrets and variables** → **Actions** → **Variables**).
4. To close the AWS account too: click your account name at the top right → **Account** → **Close account**, at the bottom. Anything you used that month is still billed. For 90 days you can sign in to reopen it, and then AWS deletes it for good. See [Closing an account](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-closing.html).

## Privacy

The server keeps no access logs. Its own logs hold only connections and errors, in memory, and go when it's terminated. Nothing is stored anywhere else, and terminating the server deletes its disk. The deploy turns on no extra logging: no VPC Flow Logs, no CloudWatch agent, no CloudTrail trail or data events.

What remains visible to others:

- **AWS**, as the network provider, can see which IP addresses connect to the server, but not message contents, which are end-to-end encrypted and don't even pass through the server.
- **CloudTrail** records AWS API calls, such as starting and terminating an instance, in its event history for 90 days. It can't be turned off, it's free, and it doesn't record your users' traffic. AWS also keeps basic metrics for every instance, such as CPU use and bytes sent, without any content.
- **Google's STUN servers**, the default, see your users' IP addresses when their browsers find a way to connect. `VITE_ICE_SERVERS` can point to another one.
- **sslip.io** turns the hostname into the IP address, so it sees the lookups. It and **Let's Encrypt's public Certificate Transparency logs** reveal the server's IP-based hostname, but not who uses it.
- **GitHub**: in a public fork, anyone can read the runs' summaries and logs, with the server's URL and IP address, until they're deleted after 1 day.

## What a deploy does

[`deploy-aws.yml`](../../.github/workflows/deploy-aws.yml):

1. Runs the [deploy preflight](../../.github/actions/deploy-preflight/README.md) without the environment, with [`requirements.json`](../../deploy/aws/requirements.json): it fails a run that someone without admin permission on your fork started, or one with a wrong repository variable, before you're asked to approve it.
2. Waits for you to approve it, as the `aws` environment's required reviewer.
3. Runs the preflight again, inside the `aws` environment: the environments exist, are limited to `main` and have the right reviewers, and its variables are set and look right. Then [`settings.sh`](../../deploy/aws/settings.sh) checks the workflow's two inputs and, again, the format of every setting the deploy uses: what goes into the server's setup data and tags, its region and size, the cost limit and the roles. All before anything changes.
4. Computes the worst-case cost with [`packages/deploy`](../../packages/deploy/src/cli.ts) and the prices in [`prices.json`](../../deploy/aws/prices.json), and refuses if it's above `MAX_DEPLOY_COST_USD`.
5. Installs AWS CLI 2.42.1 ([`setup-aws-cli`](../../.github/actions/setup-aws-cli/action.yml)), after checking its pinned SHA-256 and AWS's signature, rather than using whatever the runner image has.
6. Signs in to AWS with the job's OIDC token, as `paranoid-deploy`, the `aws` environment's `AWS_ROLE_ARN`.
7. Terminates any existing Paranoid instance ([`delete-servers.sh`](../../deploy/aws/delete-servers.sh)).
8. Starts an instance named `paranoid-<run id>` ([`create-server.sh`](../../deploy/aws/create-server.sh)), from Debian 13's latest image from Debian's own AWS account, tagged `app=paranoid` with its `run`, and its `created` and `expires` times in Unix seconds, as on every provider. Powering off terminates it, its disk is deleted with it, it requires IMDSv2, and it has no key pair and no role. Its setup data is [`deploy/server/cloud-init.yaml`](../../deploy/server/cloud-init.yaml), plus [`public-host.yaml`](../../deploy/aws/public-host.yaml), which asks AWS's metadata service for the server's public IP address, because the server itself only sees a private one.
9. Creates the backstop schedule, which terminates the instance 5 minutes after its lifetime.
10. Waits up to 10 minutes for `https://<host>/healthz` and a socket.io handshake. If they don't come up, it terminates the instance and fails, with the reason from the last attempt.

On the server, cloud-init turns off SSH, locks root's password and sets a timer that powers off at the end of the lifetime. It then fetches exactly the deployed commit from the public repository with `git`, which checks every file against its hash, so the server needs no credentials. [`deploy/server/setup.sh`](../../deploy/server/setup.sh) from that commit does the rest:

- installs Node.js 24 and Caddy from pinned releases, after checking their checksums;
- runs `pnpm install --frozen-lockfile` and builds the app with `VITE_SIGNALING_SERVER=/`, as a user of its own, with a temporary swap file on a 1 GB server;
- starts the signaling server as a locked-down systemd service on `127.0.0.1` only, with `MAX_INVITES`. When it exits because its last invite is finished, the server powers off;
- starts Caddy, which gets a Let's Encrypt certificate for `<ip-with-dashes>.sslip.io`, serves the app and passes `/socket.io/` and `/healthz` to the signaling server;
- limits all outbound traffic to `MAX_EGRESS_MBIT` with `tc`.

[`cleanup-aws.yml`](../../.github/workflows/cleanup-aws.yml) runs every hour on the default branch, which can't use the `aws` environment, so it starts itself on `main`, which can. [`stop-aws.yml`](../../.github/workflows/stop-aws.yml) terminates every Paranoid instance right away. Both sign in as `paranoid-cleanup`, in the `aws-cleanup` environment, so they never wait for an approval. Both start with the preflight too; Clean up's skips the check of who started it, because its scheduled runs are started on `main` by `github-actions[bot]`. Deploy AWS and Stop AWS share a concurrency group: two deploys never overlap, and Stop AWS cancels a deploy that's in progress or waiting for your approval, which then terminates its own instance if it started one. Clean up AWS has a group of its own, so it never waits behind a deploy that's waiting for approval. It only terminates servers that are stopped or past their lifetime, so it can't touch a new one.
