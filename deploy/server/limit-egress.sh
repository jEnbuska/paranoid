#!/usr/bin/env bash
# Limits all outbound traffic of the server to MAX_EGRESS_MBIT Mbit/s, with a
# token bucket on the interface of the default route, IPv4 and IPv6 alike.
# paranoid-egress.service runs it at every boot. Incoming traffic, such as
# downloads, isn't limited.
set -euo pipefail

: "${MAX_EGRESS_MBIT:?}"
dev=$(ip -4 route show default | awk '{ for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit } }')
if [ -z "$dev" ]; then
  echo "No default route" >&2
  exit 1
fi
# The burst lets a page's first packets go out at line speed, and the latency
# caps how long a packet may wait in the queue before it's dropped.
tc qdisc replace dev "$dev" root tbf rate "${MAX_EGRESS_MBIT}mbit" burst 64kb latency 200ms
echo "Outbound traffic on $dev limited to $MAX_EGRESS_MBIT Mbit/s"
