#!/usr/bin/env bash
# Starts the Paranoid instance on EC2 and its backstop schedule, and writes
# its ID, host, URL and expiry time to GITHUB_OUTPUT.
#
# Reads REPOSITORY and COMMIT (what the instance fetches), RUN_ID, the
# inputs settings.sh checked, and the variables the deploy preflight checked
# (deploy/aws/requirements.json). The aws CLI has the deploy role's short-lived
# credentials from the job's OIDC token. The instance gets no credentials:
# it has no role, and its user data holds no secret.
set -euo pipefail

here=$(dirname "$0")
# shellcheck source=deploy/aws/names.sh
. "$here/names.sh"

fail() {
  echo "::error::$1"
  exit 1
}

[[ $REPOSITORY =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail "Unexpected repository name: $REPOSITORY"
[[ $COMMIT =~ ^[0-9a-f]{40}$ ]] || fail "Unexpected commit: $COMMIT"
[[ $RUN_ID =~ ^[0-9]+$ ]] || fail "Unexpected run ID: $RUN_ID"

name="paranoid-$RUN_ID"
created=$(date +%s)
expires=$((created + LIFETIME_MINUTES * 60))
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

bash "$here/user-data.sh" >"$work/user-data"

# The latest Debian 13 image for the instance type's processor, from Debian's
# own account. The deploy role can't launch any other account's images.
case "$INSTANCE_TYPE" in
  t4g.*) arch=arm64 ;;
  *) arch=amd64 ;;
esac
ami=$(aws ssm get-parameter --name "$DEBIAN_AMI_PARAMETERS/$arch" --query Parameter.Value --output text)
[[ $ami =~ ^ami-[0-9a-f]{8,17}$ ]] || fail "Couldn't find Debian 13's image for $arch."
read -r owner root_device image_name < <(aws ec2 describe-images --image-ids "$ami" \
  --query 'Images[0].[OwnerId, RootDeviceName, Name]' --output text)
[ "$owner" = "$DEBIAN_ACCOUNT" ] || fail "$ami doesn't belong to Debian's account."
[[ $root_device =~ ^/dev/[a-z0-9]+$ ]] || fail "$ami has no root device."

# A subnet of the default VPC, one per availability zone. If a zone has no
# room for the instance type, the next one is tried.
subnets=$(aws ec2 describe-subnets --filters Name=default-for-az,Values=true \
  --query 'Subnets[].SubnetId' --output text)
[ -n "$subnets" ] || fail "$REGION's default VPC has no default subnets."

# app=paranoid, run, created and expires, the times in Unix seconds, as on
# every provider. Name is what the EC2 console shows.
tags="{Key=$TAG_KEY,Value=$TAG_VALUE},{Key=Name,Value=$name},{Key=run,Value=$RUN_ID},{Key=created,Value=$created},{Key=expires,Value=$expires}"
id=
for subnet in $subnets; do
  echo "Starting $name, a $INSTANCE_TYPE instance from $image_name, in $subnet"
  # - Powering itself off terminates it, which deletes its disk too.
  # - IMDSv2 only, and the metadata service can't be reached from containers
  #   or forwarded packets (hop limit 1). Tags aren't in the metadata.
  # - A public IPv4 address, no IPv6, and only the paranoid security group.
  # - No key pair, so nobody can log in, and no instance profile, so the
  #   instance has no AWS credentials.
  # - Standard CPU credits: a t-class instance can't run up extra charges
  #   for using more CPU than its baseline.
  if id=$(aws ec2 run-instances \
    --image-id "$ami" --instance-type "$INSTANCE_TYPE" --count 1 \
    --instance-initiated-shutdown-behavior terminate \
    --credit-specification CpuCredits=standard \
    --metadata-options HttpTokens=required,HttpEndpoint=enabled,HttpPutResponseHopLimit=1,InstanceMetadataTags=disabled \
    --network-interfaces "DeviceIndex=0,SubnetId=$subnet,Groups=$SECURITY_GROUP_ID,AssociatePublicIpAddress=true,DeleteOnTermination=true" \
    --block-device-mappings "DeviceName=$root_device,Ebs={DeleteOnTermination=true,VolumeType=gp3,VolumeSize=$ROOT_VOLUME_GB}" \
    --tag-specifications "ResourceType=instance,Tags=[$tags]" "ResourceType=volume,Tags=[$tags]" \
    "ResourceType=network-interface,Tags=[$tags]" \
    --user-data "file://$work/user-data" \
    --query 'Instances[0].InstanceId' --output text 2>"$work/error"); then
    break
  fi
  id=
  cat "$work/error" >&2
  grep -qE 'InsufficientInstanceCapacity|Unsupported' "$work/error" || fail "Couldn't start the instance."
done
[[ $id =~ ^i-[0-9a-f]{8,17}$ ]] || fail "No availability zone in $REGION had room for a $INSTANCE_TYPE instance."
echo "instance=$id" >>"$GITHUB_OUTPUT"

# The backstop: at the end of the lifetime, plus a few minutes for the
# instance to power itself off first, EventBridge Scheduler terminates it,
# even if its own timer never ran. The schedule deletes itself afterwards.
backstop=$((expires + BACKSTOP_GRACE_MINUTES * 60))
target=$(jq -cn --arg role "$SCHEDULER_ROLE_ARN" --arg id "$id" '{
  Arn: "arn:aws:scheduler:::aws-sdk:ec2:terminateInstances",
  RoleArn: $role,
  Input: ({InstanceIds: [$id]} | tojson)
}')
aws scheduler create-schedule --group-name "$SCHEDULE_GROUP" --name "paranoid-$id" \
  --description "Terminates $name at the end of its lifetime" \
  --schedule-expression "at($(date -u -d "@$backstop" '+%Y-%m-%dT%H:%M:%S'))" \
  --schedule-expression-timezone UTC \
  --flexible-time-window Mode=OFF \
  --action-after-completion DELETE \
  --target "$target" >/dev/null
echo "The backstop terminates $id at $(date -u -d "@$backstop" '+%H:%M UTC') at the latest."

aws ec2 wait instance-running --instance-ids "$id"
ip=$(aws ec2 describe-instances --instance-ids "$id" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
[[ $ip =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || fail "$name has no public IPv4 address."
host="${ip//./-}.sslip.io"
echo "Started $name ($id), a $INSTANCE_TYPE instance in $REGION: https://$host"
{
  echo "host=$host"
  echo "url=https://$host"
  echo "expires=$expires"
} >>"$GITHUB_OUTPUT"
