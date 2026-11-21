# shellcheck shell=bash
# shellcheck disable=SC2034 # the scripts that source this use them
# Names that bootstrap.sh, teardown.sh and the workflows' scripts share.
# Sourced, not run.

# Every instance, volume and network interface the deploy role creates has
# this tag, and the roles can only terminate instances that have it.
TAG_KEY=app
TAG_VALUE=paranoid

# The GitHub environments, which only main may use. Only deploy-aws.yml uses
# ENVIRONMENT, which has the owner as its required reviewer, so every deploy
# waits for their approval. Only jobs in it can assume the deploy role.
# stop-aws.yml and cleanup-aws.yml use CLEANUP_ENVIRONMENT, which has no
# reviewer, so they never wait, and its role can only remove servers.
ENVIRONMENT=aws
CLEANUP_ENVIRONMENT=aws-cleanup

OIDC_HOST=token.actions.githubusercontent.com
DEPLOY_ROLE=paranoid-deploy
CLEANUP_ROLE=paranoid-cleanup
SCHEDULER_ROLE=paranoid-scheduler
SCHEDULE_GROUP=paranoid
SECURITY_GROUP=paranoid
BUDGET=paranoid

# Debian's own AMIs: the account that publishes them, from
# https://wiki.debian.org/Cloud/AmazonEC2Image, and the public SSM parameters
# that name the latest one (…/arm64 and …/amd64).
DEBIAN_ACCOUNT=136693071363
DEBIAN_AMI_PARAMETERS=/aws/service/debian/release/13/latest


# The instance's disk, in GB: the size of Debian's image. prices.json's
# "8 GB gp3 disk" item is for this size, so change both together.
ROOT_VOLUME_GB=8

# Minutes after the end of an instance's lifetime that the backstop schedule
# terminates it, so that the instance can power itself off first. The cost
# check counts them as part of the lifetime.
BACKSTOP_GRACE_MINUTES=5
