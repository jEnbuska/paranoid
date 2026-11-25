#!/usr/bin/env bash
# Sets the firewall rules of a Paranoid server on UpCloud. The firewall costs
# nothing, and create-server.sh creates the server with it on. upctl reads
# UPCLOUD_TOKEN from the environment.
#
# UpCloud's server firewall is stateless: it doesn't know which packets answer
# a connection the server made. So besides new connections to TCP 80 and 443,
# it accepts only the answers the server needs while it sets itself up and
# runs: DNS from UpCloud's resolvers, and HTTP, HTTPS and NTP answers to
# Linux's ephemeral ports (32768-60999), where nothing listens. Everything else
# coming in is dropped, port 22 included. Everything going out is accepted.
#
# Usage: firewall-rules.sh <server-uuid>
set -euo pipefail

uuid=$1
[[ $uuid =~ ^[0-9a-f-]{36}$ ]] || {
  echo "Usage: $0 <server-uuid>" >&2
  exit 2
}

rule() {
  upctl server firewall create "$uuid" "$@" >/dev/null
}

# New connections from browsers, and from Let's Encrypt on port 80
for port in 80 443; do
  rule --direction in --action accept --family IPv4 --protocol tcp \
    --destination-port-start "$port" --destination-port-end "$port" \
    --comment "Paranoid: TCP $port"
done

# DNS answers from UpCloud's resolvers, which the server gets over DHCP. They
# are the same in every zone.
for resolver in 94.237.127.9 94.237.40.9; do
  for protocol in udp tcp; do
    rule --direction in --action accept --family IPv4 --protocol "$protocol" \
      --src-ipaddress-block "$resolver/32" \
      --source-port-start 53 --source-port-end 53 \
      --comment "Paranoid: DNS answers"
  done
done

# Answers to the server's own HTTP and HTTPS requests (Debian packages,
# GitHub, Node.js, npm, Caddy, Let's Encrypt, the metadata service) and NTP
for answer in tcp:80 tcp:443 udp:123; do
  rule --direction in --action accept --family IPv4 --protocol "${answer%:*}" \
    --source-port-start "${answer#*:}" --source-port-end "${answer#*:}" \
    --destination-port-start 32768 --destination-port-end 60999 \
    --comment "Paranoid: answers from ${answer#*:}"
done

# Destination unreachable, which includes "fragmentation needed", so path MTU
# discovery works
rule --direction in --action accept --family IPv4 --protocol icmp --icmp-type 3 \
  --comment "Paranoid: ICMP unreachable"

# The catch-all rules, taking effect when no rule above matches. They come
# last, as UpCloud requires.
rule --direction in --action drop --comment "Paranoid: drop everything else"
rule --direction out --action accept --comment "Paranoid: accept outbound"
echo "The firewall of $uuid accepts new connections only on TCP 80 and 443"
