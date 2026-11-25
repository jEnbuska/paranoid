#!/usr/bin/env bash
# One-time setup of an AWS account for Paranoid's deploy workflows. Run it in
# AWS CloudShell or anywhere the aws CLI (version 2) is signed in to the
# account, from a checkout of the fork. Running it again updates everything to
# what it should be and creates only what's missing.
#
# Usage: deploy/aws/bootstrap.sh <owner>/<repo> <email-for-budget-alerts>
#
# Environment (all optional):
#   AWS_REGION   the region the servers run in (default eu-north-1, Stockholm)
#   BUDGET_USD   monthly budget the alerts compare against (default 5)
#
# It creates, all named or tagged paranoid:
#   - the IAM OpenID Connect provider for GitHub Actions, unless the account
#     has one already;
#   - the role paranoid-deploy, which only GitHub Actions jobs of
#     <owner>/<repo> in its `aws` environment can assume, and which can only
#     start, list and terminate the app's instances;
#   - the role paranoid-cleanup, which only jobs in its `aws-cleanup`
#     environment can assume, and which can only list and terminate the
#     app's instances;
#   - the role paranoid-scheduler, which EventBridge Scheduler uses to
#     terminate an instance when its lifetime is over;
#   - the schedule group paranoid, for those one-time schedules;
#   - the security group paranoid in the region's default VPC, which lets in
#     TCP 80 and 443 only;
#   - the budget paranoid, which emails when the month's cost passes 80% of
#     BUDGET_USD, or is forecast to pass 100%.
# None of these cost anything while no instance runs. Nothing here creates an
# access key or any other secret.
#
# deploy/aws/teardown.sh deletes all of it.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=deploy/aws/names.sh
. "$here/names.sh"

usage() {
  echo "Usage: $0 <owner>/<repo> <email-for-budget-alerts>" >&2
  exit 2
}
[ $# = 2 ] || usage
repository=$1
email=$2
region=${AWS_REGION:-eu-north-1}
budget=${BUDGET_USD:-5}

fail() {
  echo "Error: $1" >&2
  exit 1
}

[[ $repository =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || usage
[[ $email =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || fail "'$email' isn't an email address."
if ! [[ $budget =~ ^[0-9]{1,5}$ ]] || ((10#$budget == 0)); then
  fail "BUDGET_USD must be a whole number of dollars, not '$budget'."
fi
jq -e --arg r "$region" '.regions | has($r)' "$here/prices.json" >/dev/null ||
  fail "AWS_REGION must be one of $(jq -r '.regions | keys | join(", ")' "$here/prices.json"), not '$region'."
command -v aws >/dev/null || fail "The aws CLI isn't installed. Use AWS CloudShell, which has it."
aws --version 2>&1 | grep -q '^aws-cli/2\.' || fail "This needs version 2 of the aws CLI."
export AWS_REGION=$region AWS_PAGER=""

account=$(aws sts get-caller-identity --query Account --output text) ||
  fail "The aws CLI isn't signed in. Use AWS CloudShell, or see docs/deploy/aws.md."
echo "Setting up AWS account $account in $region for $repository"

# GitHub's OIDC tokens name the job's repository in their subject. A
# repository created after 2026-07-15 has an immutable subject that includes
# the owner's and the repository's IDs, so a deleted account's name can't be
# taken over. Older repositories use the names, unless they opted in, so for
# them both are accepted. The repository must be public, like forks of
# Paranoid, for this lookup to work without signing in to GitHub.
repo_json=$(curl -fsS -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$repository") ||
  fail "Couldn't look up $repository on GitHub. Is it the right name, and public?"
owner_name=$(jq -r .owner.login <<<"$repo_json")
repo_name=$(jq -r .name <<<"$repo_json")
owner_id=$(jq -r .owner.id <<<"$repo_json")
repo_id=$(jq -r .id <<<"$repo_json")
created=$(jq -r .created_at <<<"$repo_json")
[[ $owner_id =~ ^[0-9]+$ && $repo_id =~ ^[0-9]+$ ]] || fail "GitHub didn't return the IDs of $repository."
# subjects <environment>: the subjects of jobs in that environment
subjects() {
  jq -cn --arg immutable "repo:$owner_name@$owner_id/$repo_name@$repo_id:environment:$1" \
    --arg names "repo:$owner_name/$repo_name:environment:$1" --arg created "$created" '
    if $created >= "2026-07-15" then [$immutable] else [$immutable, $names] end'
}

# github_trust <environment>: a trust policy for jobs of this repository in
# that environment, which only `main` may use
github_trust() {
  jq -cn --arg provider "$provider_arn" --arg host "$OIDC_HOST" --argjson subjects "$(subjects "$1")" '{
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: {Federated: $provider},
      Action: "sts:AssumeRoleWithWebIdentity",
      Condition: {StringEquals: {($host + ":aud"): "sts.amazonaws.com", ($host + ":sub"): $subjects}}
    }]
  }'
}

tags="Key=$TAG_KEY,Value=$TAG_VALUE"

# 1. The OIDC provider. An account has at most one per URL, so one that's
# already there, for example for another project, is used as it is, apart
# from adding the audience. teardown.sh deletes it only if this script
# created it, which its tag shows.
provider_arn="arn:aws:iam::$account:oidc-provider/$OIDC_HOST"
if audiences=$(aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$provider_arn" \
  --query ClientIDList --output json 2>/dev/null); then
  echo "OIDC provider for GitHub Actions: already there"
  if ! jq -e 'index("sts.amazonaws.com")' <<<"$audiences" >/dev/null; then
    aws iam add-client-id-to-open-id-connect-provider \
      --open-id-connect-provider-arn "$provider_arn" --client-id sts.amazonaws.com
  fi
else
  # No thumbprint: IAM trusts GitHub's certificate authority itself.
  aws iam create-open-id-connect-provider --url "https://$OIDC_HOST" \
    --client-id-list sts.amazonaws.com --tags "$tags" >/dev/null
  echo "OIDC provider for GitHub Actions: created"
fi

# 2. The network: the region's default VPC, which every AWS account has
# unless someone deleted it, and its security group.
vpc=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
[[ $vpc =~ ^vpc- ]] || fail "$region has no default VPC. Create one with: aws ec2 create-default-vpc --region $region"
sg=$(aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$vpc" "Name=group-name,Values=$SECURITY_GROUP" \
  --query 'SecurityGroups[0].GroupId' --output text)
if [[ $sg =~ ^sg- ]]; then
  echo "Security group $SECURITY_GROUP: already there ($sg)"
else
  sg=$(aws ec2 create-security-group --vpc-id "$vpc" --group-name "$SECURITY_GROUP" \
    --description "Paranoid: HTTPS, and HTTP for Let's Encrypt, only" \
    --tag-specifications "ResourceType=security-group,Tags=[{$tags}]" \
    --query GroupId --output text)
  echo "Security group $SECURITY_GROUP: created ($sg)"
fi
# Inbound: TCP 80 (Let's Encrypt and the redirect to HTTPS) and 443 from
# anywhere, and nothing else. Any other inbound rule is removed. Outbound
# stays open, as a new group has it: the server downloads its code, Node.js,
# Caddy and the npm packages, and talks to Let's Encrypt.
rules=$(aws ec2 describe-security-group-rules --filters "Name=group-id,Values=$sg" --output json)
for port in 80 443; do
  if ! jq -e --argjson p "$port" '.SecurityGroupRules[] | select((.IsEgress | not) and .IpProtocol == "tcp"
    and .FromPort == $p and .ToPort == $p and .CidrIpv4 == "0.0.0.0/0")' <<<"$rules" >/dev/null; then
    aws ec2 authorize-security-group-ingress --group-id "$sg" \
      --ip-permissions "IpProtocol=tcp,FromPort=$port,ToPort=$port,IpRanges=[{CidrIp=0.0.0.0/0}]" >/dev/null
    echo "  allowed TCP $port in"
  fi
done
extra=$(jq -r '[.SecurityGroupRules[] | select((.IsEgress | not) and ((.IpProtocol == "tcp"
  and (.FromPort == 80 or .FromPort == 443) and .FromPort == .ToPort and .CidrIpv4 == "0.0.0.0/0") | not))
  | .SecurityGroupRuleId] | join(" ")' <<<"$rules")
if [ -n "$extra" ]; then
  # shellcheck disable=SC2086 # one argument per rule ID
  aws ec2 revoke-security-group-ingress --group-id "$sg" --security-group-rule-ids $extra >/dev/null
  echo "  removed other inbound rules: $extra"
fi

# 3. The schedule group for the backstop schedules
if aws scheduler get-schedule-group --name "$SCHEDULE_GROUP" >/dev/null 2>&1; then
  echo "Schedule group $SCHEDULE_GROUP: already there"
else
  aws scheduler create-schedule-group --name "$SCHEDULE_GROUP" --tags "$tags" >/dev/null
  echo "Schedule group $SCHEDULE_GROUP: created"
fi
group_arn="arn:aws:scheduler:$region:$account:schedule-group/$SCHEDULE_GROUP"

instances="arn:aws:ec2:$region:$account:instance/*"

# ensure_role <name> <description> <trust policy> <permissions policy>
# Creates the role or updates its trust policy, and sets its one inline
# policy. The region tag tells teardown.sh where the rest is.
ensure_role() {
  local name=$1 description=$2 trust=$3 permissions=$4
  if aws iam get-role --role-name "$name" >/dev/null 2>&1; then
    aws iam update-assume-role-policy --role-name "$name" --policy-document "$trust"
    aws iam tag-role --role-name "$name" --tags "$tags" "Key=region,Value=$region"
    echo "Role $name: updated"
  else
    aws iam create-role --role-name "$name" --description "$description" \
      --assume-role-policy-document "$trust" --max-session-duration 3600 \
      --tags "$tags" "Key=region,Value=$region" >/dev/null
    echo "Role $name: created"
  fi
  aws iam put-role-policy --role-name "$name" --policy-name "$name" --policy-document "$permissions"
}

# 4. The scheduler's role: EventBridge Scheduler, for schedules in the
# paranoid group of this account only, may terminate the app's instances and
# nothing else.
scheduler_trust=$(jq -cn --arg account "$account" --arg group "$group_arn" '{
  Version: "2012-10-17",
  Statement: [{
    Effect: "Allow",
    Principal: {Service: "scheduler.amazonaws.com"},
    Action: "sts:AssumeRole",
    Condition: {StringEquals: {"aws:SourceAccount": $account, "aws:SourceArn": $group}}
  }]
}')
scheduler_permissions=$(jq -cn --arg instances "$instances" --arg key "$TAG_KEY" --arg value "$TAG_VALUE" '{
  Version: "2012-10-17",
  Statement: [{
    Sid: "TerminateTheAppsInstances",
    Effect: "Allow",
    Action: "ec2:TerminateInstances",
    Resource: $instances,
    Condition: {StringEquals: {("aws:ResourceTag/" + $key): $value}}
  }]
}')
ensure_role "$SCHEDULER_ROLE" "Paranoid: terminates an instance when its lifetime is over" \
  "$scheduler_trust" "$scheduler_permissions"
scheduler_role_arn="arn:aws:iam::$account:role/$SCHEDULER_ROLE"

# 5. The deploy role. Only jobs of this repository that use its `aws`
# environment, which only `main` may use and whose jobs wait for the owner's
# approval, can assume it.
deploy_trust=$(github_trust "$ENVIRONMENT")
# Every permission is limited to this region, and to the app's resources
# wherever EC2 can tell them apart. See the PR that added this file for why
# each one is needed.
deploy_permissions=$(jq -cn \
  --arg region "$region" --arg account "$account" --arg vpc "arn:aws:ec2:$region:$account:vpc/$vpc" \
  --arg sg "arn:aws:ec2:$region:$account:security-group/$sg" --arg instances "$instances" \
  --arg key "$TAG_KEY" --arg value "$TAG_VALUE" --arg debian "$DEBIAN_ACCOUNT" \
  --arg ami_parameters "arn:aws:ssm:$region::parameter$DEBIAN_AMI_PARAMETERS/*" \
  --arg schedules "arn:aws:scheduler:$region:$account:schedule/$SCHEDULE_GROUP/*" \
  --arg scheduler_role "$scheduler_role_arn" \
  --argjson types "$(jq -c --arg r "$region" '.regions[$r].servers | keys' "$here/prices.json")" '
  {("aws:ResourceTag/" + $key): $value} as $tagged
  | {("aws:RequestTag/" + $key): $value} as $tagging
  | "arn:aws:ec2:\($region):\($account)" as $ec2
  | {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "LaunchOnlyTaggedSmallInstancesWithIMDSv2",
        Effect: "Allow",
        Action: "ec2:RunInstances",
        Resource: $instances,
        Condition: {StringEquals: ($tagging + {"ec2:MetadataHttpTokens": "required", "ec2:InstanceType": $types})}
      },
      {
        Sid: "LaunchOnlyTaggedVolumes",
        Effect: "Allow",
        Action: "ec2:RunInstances",
        Resource: "\($ec2):volume/*",
        Condition: {StringEquals: $tagging}
      },
      {
        Sid: "LaunchInTheDefaultVpc",
        Effect: "Allow",
        Action: "ec2:RunInstances",
        Resource: ["\($ec2):subnet/*", "\($ec2):network-interface/*"],
        Condition: {StringEquals: {"ec2:Vpc": $vpc}}
      },
      {
        Sid: "LaunchWithTheSecurityGroup",
        Effect: "Allow",
        Action: "ec2:RunInstances",
        Resource: $sg
      },
      {
        Sid: "LaunchOnlyDebianImages",
        Effect: "Allow",
        Action: "ec2:RunInstances",
        Resource: "arn:aws:ec2:\($region)::image/*",
        Condition: {StringEquals: {"ec2:Owner": $debian}}
      },
      {
        Sid: "TagOnlyWhileLaunching",
        Effect: "Allow",
        Action: "ec2:CreateTags",
        Resource: [$instances, "\($ec2):volume/*", "\($ec2):network-interface/*"],
        Condition: {StringEquals: {"ec2:CreateAction": "RunInstances"}}
      },
      {
        Sid: "TerminateOnlyTheAppsInstances",
        Effect: "Allow",
        Action: "ec2:TerminateInstances",
        Resource: $instances,
        Condition: {StringEquals: $tagged}
      },
      {
        Sid: "DescribeHasNoResourceLevelPermissions",
        Effect: "Allow",
        Action: ["ec2:DescribeInstances", "ec2:DescribeImages", "ec2:DescribeSubnets"],
        Resource: "*",
        Condition: {StringEquals: {"aws:RequestedRegion": $region}}
      },
      {
        Sid: "FindTheLatestDebianImage",
        Effect: "Allow",
        Action: "ssm:GetParameter",
        Resource: $ami_parameters
      },
      {
        Sid: "CreateAndDeleteTheBackstopSchedules",
        Effect: "Allow",
        Action: ["scheduler:CreateSchedule", "scheduler:DeleteSchedule"],
        Resource: $schedules
      },
      {
        Sid: "LetTheSchedulerUseItsRole",
        Effect: "Allow",
        Action: "iam:PassRole",
        Resource: $scheduler_role,
        Condition: {StringEquals: {"iam:PassedToService": "scheduler.amazonaws.com"}}
      }
    ]
  }')
ensure_role "$DEPLOY_ROLE" "Paranoid: GitHub Actions starts and terminates the app's instances" \
  "$deploy_trust" "$deploy_permissions"
deploy_role_arn="arn:aws:iam::$account:role/$DEPLOY_ROLE"

# 6. The cleanup role, for Stop AWS and Clean up AWS. Only jobs in the
# `aws-cleanup` environment, which only `main` may use and which has no
# reviewer so they never wait, can assume it. It can only list instances,
# terminate the app's, and delete their backstop schedules: nothing that
# starts a server or costs money.
cleanup_permissions=$(jq -cn --arg region "$region" --arg instances "$instances" \
  --arg key "$TAG_KEY" --arg value "$TAG_VALUE" \
  --arg schedules "arn:aws:scheduler:$region:$account:schedule/$SCHEDULE_GROUP/*" '{
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "TerminateOnlyTheAppsInstances",
      Effect: "Allow",
      Action: "ec2:TerminateInstances",
      Resource: $instances,
      Condition: {StringEquals: {("aws:ResourceTag/" + $key): $value}}
    },
    {
      Sid: "DescribeHasNoResourceLevelPermissions",
      Effect: "Allow",
      Action: "ec2:DescribeInstances",
      Resource: "*",
      Condition: {StringEquals: {"aws:RequestedRegion": $region}}
    },
    {
      Sid: "DeleteTheBackstopSchedules",
      Effect: "Allow",
      Action: "scheduler:DeleteSchedule",
      Resource: $schedules
    }
  ]
}')
ensure_role "$CLEANUP_ROLE" "Paranoid: GitHub Actions terminates the app's instances" \
  "$(github_trust "$CLEANUP_ENVIRONMENT")" "$cleanup_permissions"
cleanup_role_arn="arn:aws:iam::$account:role/$CLEANUP_ROLE"

# 7. The budget, a late warning only: AWS checks costs a few times a day, so
# an alert can come hours after the cost. It covers the whole account.
# Budgets are global, and their API is in us-east-1.
budget_json=$(jq -cn --arg name "$BUDGET" --arg amount "$budget" '{
  BudgetName: $name, BudgetType: "COST", TimeUnit: "MONTHLY",
  BudgetLimit: {Amount: $amount, Unit: "USD"}
}')
if aws budgets describe-budget --region us-east-1 --account-id "$account" --budget-name "$BUDGET" >/dev/null 2>&1; then
  aws budgets update-budget --region us-east-1 --account-id "$account" --new-budget "$budget_json"
  echo "Budget $BUDGET: updated to $budget USD a month"
else
  aws budgets create-budget --region us-east-1 --account-id "$account" --budget "$budget_json"
  echo "Budget $BUDGET: created, $budget USD a month"
fi
for alert in ACTUAL:80 FORECASTED:100; do
  notification="NotificationType=${alert%%:*},ComparisonOperator=GREATER_THAN,Threshold=${alert#*:},ThresholdType=PERCENTAGE"
  subscriber="SubscriptionType=EMAIL,Address=$email"
  if ! subscribers=$(aws budgets describe-subscribers-for-notification --region us-east-1 \
    --account-id "$account" --budget-name "$BUDGET" --notification "$notification" \
    --query 'Subscribers[].Address' --output json 2>/dev/null); then
    aws budgets create-notification --region us-east-1 --account-id "$account" --budget-name "$BUDGET" \
      --notification "$notification" --subscribers "$subscriber"
  elif ! jq -e --arg e "$email" 'index($e)' <<<"$subscribers" >/dev/null; then
    aws budgets create-subscriber --region us-east-1 --account-id "$account" --budget-name "$BUDGET" \
      --notification "$notification" --subscriber "$subscriber"
  fi
done
echo "  alerts to $email at 80% of the actual cost and 100% of the forecast"

cat <<EOF

Done. None of these values is a secret. Run these commands with the GitHub
CLI, signed in to your GitHub account, in this order.

First the two environments, both limited to main. Deploys wait for your
approval (you're the required reviewer, and may approve your own runs);
Stop and Clean up don't wait:

printf '{"prevent_self_review":false,"reviewers":[{"type":"User","id":%s}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' "\$(gh api user --jq .id)" | gh api --method PUT repos/$repository/environments/$ENVIRONMENT --input -
gh api --method POST repos/$repository/environments/$ENVIRONMENT/deployment-branch-policies -f name=main -f type=branch
gh api --method PUT repos/$repository/environments/$CLEANUP_ENVIRONMENT -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api --method POST repos/$repository/environments/$CLEANUP_ENVIRONMENT/deployment-branch-policies -f name=main -f type=branch

Then the IDs, in the environments that use them. AWS_ROLE_ARN is the deploy
role in $ENVIRONMENT and the cleanup role in $CLEANUP_ENVIRONMENT:

gh variable set AWS_ROLE_ARN --env $ENVIRONMENT --repo $repository --body $deploy_role_arn
gh variable set AWS_SCHEDULER_ROLE_ARN --env $ENVIRONMENT --repo $repository --body $scheduler_role_arn
gh variable set AWS_SECURITY_GROUP_ID --env $ENVIRONMENT --repo $repository --body $sg
gh variable set AWS_ROLE_ARN --env $CLEANUP_ENVIRONMENT --repo $repository --body $cleanup_role_arn

The region, as a repository variable, which every workflow reads:

gh variable set AWS_REGION --repo $repository --body $region

And keep the public run logs for 1 day only:

gh api --method PUT repos/$repository/actions/permissions/artifact-and-log-retention -F days=1
EOF
