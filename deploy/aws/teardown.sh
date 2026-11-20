#!/usr/bin/env bash
# Deletes everything deploy/aws/bootstrap.sh created, and terminates any
# Paranoid instance that's left. Run it like bootstrap.sh, in AWS CloudShell
# or wherever the aws CLI is signed in to the account. Running it again, or on
# an account with only part of the setup, deletes whatever is still there.
#
# Usage: deploy/aws/teardown.sh [--yes]
#
# The region comes from the deploy role's region tag, which bootstrap.sh sets,
# or else from AWS_REGION (default eu-north-1).
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=deploy/aws/names.sh
. "$here/names.sh"

fail() {
  echo "Error: $1" >&2
  exit 1
}

command -v aws >/dev/null || fail "The aws CLI isn't installed. Use AWS CloudShell, which has it."
export AWS_PAGER=""
account=$(aws sts get-caller-identity --query Account --output text) ||
  fail "The aws CLI isn't signed in. Use AWS CloudShell, or see docs/deploy/aws.md."

region_tag() {
  aws iam list-role-tags --role-name "$1" --query "Tags[?Key=='region'].Value | [0]" --output text 2>/dev/null
}
region=$(region_tag "$DEPLOY_ROLE" || true)
[[ $region =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]] || region=$(region_tag "$SCHEDULER_ROLE" || true)
[[ $region =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]] || region=${AWS_REGION:-eu-north-1}
export AWS_REGION=$region

if [ "${1:-}" != --yes ]; then
  echo "This deletes Paranoid's AWS setup in account $account ($region), and terminates its instances."
  read -r -p "Continue? [y/N] " answer
  [[ $answer =~ ^[Yy] ]] || exit 1
fi

# 1. Instances first: the security group can't be deleted while one uses it.
ids=$(aws ec2 describe-instances \
  --filters "Name=tag:$TAG_KEY,Values=$TAG_VALUE" "Name=instance-state-name,Values=pending,running,stopping,stopped,shutting-down" \
  --query 'Reservations[].Instances[].InstanceId' --output text)
if [ -n "$ids" ]; then
  echo "Terminating $ids"
  # shellcheck disable=SC2086 # one argument per instance ID
  aws ec2 terminate-instances --instance-ids $ids >/dev/null
  # shellcheck disable=SC2086
  aws ec2 wait instance-terminated --instance-ids $ids
fi

# 2. The schedule group, with any schedules still in it
if aws scheduler get-schedule-group --name "$SCHEDULE_GROUP" >/dev/null 2>&1; then
  aws scheduler delete-schedule-group --name "$SCHEDULE_GROUP"
  echo "Deleted the schedule group $SCHEDULE_GROUP"
fi

# 3. The security group, if bootstrap.sh created it (its tag says so). A
# terminated instance's network interface can take a minute to go, and the
# group can't be deleted until it has.
sg=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$SECURITY_GROUP" "Name=tag:$TAG_KEY,Values=$TAG_VALUE" \
  --query 'SecurityGroups[0].GroupId' --output text)
if [[ $sg =~ ^sg- ]]; then
  attempt=1
  until aws ec2 delete-security-group --group-id "$sg" 2>/dev/null; do
    ((attempt < 30)) || fail "Couldn't delete the security group $sg. Is something else using it?"
    attempt=$((attempt + 1))
    sleep 10
  done
  echo "Deleted the security group $sg"
fi

# 4. The roles, with their inline policies
for role in "$DEPLOY_ROLE" "$SCHEDULER_ROLE"; do
  aws iam get-role --role-name "$role" >/dev/null 2>&1 || continue
  for policy in $(aws iam list-role-policies --role-name "$role" --query 'PolicyNames[]' --output text); do
    aws iam delete-role-policy --role-name "$role" --policy-name "$policy"
  done
  for policy in $(aws iam list-attached-role-policies --role-name "$role" --query 'AttachedPolicies[].PolicyArn' --output text); do
    aws iam detach-role-policy --role-name "$role" --policy-arn "$policy"
  done
  aws iam delete-role --role-name "$role"
  echo "Deleted the role $role"
done

# 5. The OIDC provider, only if bootstrap.sh created it. One that was there
# before may be used by something else.
provider_arn="arn:aws:iam::$account:oidc-provider/$OIDC_HOST"
if tag=$(aws iam list-open-id-connect-provider-tags --open-id-connect-provider-arn "$provider_arn" \
  --query "Tags[?Key=='$TAG_KEY'].Value | [0]" --output text 2>/dev/null); then
  if [ "$tag" = "$TAG_VALUE" ]; then
    aws iam delete-open-id-connect-provider --open-id-connect-provider-arn "$provider_arn"
    echo "Deleted the OIDC provider for GitHub Actions"
  else
    echo "Kept the OIDC provider for GitHub Actions: bootstrap.sh didn't create it, so something else may use it."
  fi
fi

# 6. The budget
if aws budgets describe-budget --region us-east-1 --account-id "$account" --budget-name "$BUDGET" >/dev/null 2>&1; then
  aws budgets delete-budget --region us-east-1 --account-id "$account" --budget-name "$BUDGET"
  echo "Deleted the budget $BUDGET"
fi

echo "Done: nothing of Paranoid's setup is left in $account ($region)."
