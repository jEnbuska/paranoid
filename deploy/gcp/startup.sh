#!/usr/bin/env bash
# The startup script of a Paranoid VM on Google Cloud, passed as its
# startup-script metadata by create-vm.sh. Google's guest agent runs it as
# root at every boot.
#
# Google's Debian images have no cloud-init, so this does what
# deploy/server/cloud-init.yaml does on other clouds, and then runs the same
# provider-neutral deploy/server/setup.sh. Keep the two in step. The lifetime
# limit isn't here: Google Cloud deletes the VM itself (create-vm.sh).
#
# The VM is behind Google's NAT and only sees its private address, so this
# reads its external address from the metadata server and passes the
# hostname to setup.sh as PARANOID_HOST.
#
# The VM's metadata holds no secret, and the VM has no service account, so
# the metadata server has no credentials to hand out.
set -euo pipefail

# Set up once. A VM that powered off is deleted, not started again.
if [ -e /var/lib/paranoid-started ]; then
  exit 0
fi
touch /var/lib/paranoid-started

# No SSH at all, and no password login. The firewall closes port 22 too.
systemctl mask --now ssh.service ssh.socket || true
passwd --lock root

metadata() {
  curl -fsS --retry 5 -H 'Metadata-Flavor: Google' \
    "http://metadata.google.internal/computeMetadata/v1/instance/$1"
}

repository=$(metadata attributes/paranoid-repository)
commit=$(metadata attributes/paranoid-commit)
max_invites=$(metadata attributes/paranoid-max-invites)
max_egress_mbit=$(metadata attributes/paranoid-max-egress-mbit)
ip=$(metadata network-interfaces/0/access-configs/0/external-ip)

[[ $repository =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]]
[[ $commit =~ ^[0-9a-f]{40}$ ]]
[[ $max_invites =~ ^[1-9][0-9]*$ ]]
[[ $max_egress_mbit =~ ^[1-9][0-9]*$ ]]
[[ $ip =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]

install -d -m 0755 /etc/paranoid
cat >/etc/paranoid/deploy.env <<EOF
MAX_INVITES=$max_invites
MAX_EGRESS_MBIT=$max_egress_mbit
PARANOID_HOST=${ip//./-}.sslip.io
EOF
chmod 0644 /etc/paranoid/deploy.env

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl git

# Fetches exactly the deployed commit. git checks every object against its
# hash, so the code is that commit's, whatever the network does.
git init -q /opt/paranoid/app
cd /opt/paranoid/app
git fetch -q --depth 1 "https://github.com/$repository.git" "$commit"
git checkout -q --detach FETCH_HEAD
test "$(git rev-parse HEAD)" = "$commit"
exec bash deploy/server/setup.sh
