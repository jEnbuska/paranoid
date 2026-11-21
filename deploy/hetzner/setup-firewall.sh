#!/usr/bin/env bash
# Creates the `paranoid` firewall on Hetzner Cloud if it's missing, and sets
# its rules from firewall-rules.json every time, so a rule added by hand
# doesn't stay. Inbound traffic that no rule allows is dropped, so only TCP 80
# and 443 get in, and port 22 is closed. Firewalls cost nothing. hcloud reads
# HCLOUD_TOKEN from the environment.
set -euo pipefail

here=$(dirname "$0")
if ! hcloud firewall describe paranoid >/dev/null 2>&1; then
  echo "Creating the paranoid firewall"
  hcloud firewall create --name paranoid --label app=paranoid >/dev/null
fi
hcloud firewall replace-rules paranoid --rules-file "$here/firewall-rules.json" >/dev/null
echo "The paranoid firewall allows only inbound TCP 80 and 443"
