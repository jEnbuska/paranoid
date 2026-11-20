#!/usr/bin/env bash
# Waits until https://<host>/healthz answers `ok` and a socket.io handshake
# works, checking every 10 seconds. Fails with the reason from the last
# attempt once <timeout-seconds> have passed.
#
# Usage: wait-for-app.sh <host> <timeout-seconds>
set -euo pipefail

host=$1
deadline=$(($(date +%s) + $2))
body=$(mktemp)
trap 'rm -f "$body"' EXIT

# get <path>: the HTTP status, with the body in $body and curl's exit code in
# $code
get() {
  code=0
  status=$(curl -sS --max-time 10 -o "$body" -w '%{http_code}' "https://$host$1" 2>/dev/null) || code=$?
}

while :; do
  get /healthz
  if [ "$code" = 0 ] && [ "$status" = 200 ] && [ "$(cat "$body")" = ok ]; then
    get '/socket.io/?EIO=4&transport=polling'
    if [ "$code" = 0 ] && [ "$status" = 200 ] && grep -q '^0{"sid":' "$body"; then
      echo "https://$host is up, and its signaling server answers."
      exit 0
    fi
    reason="The health check passed, but the socket.io handshake didn't (curl exit code $code, HTTP $status)."
  else
    case "$code" in
      0) reason="https://$host/healthz answered HTTP $status. 502 means Caddy is up but the signaling server isn't." ;;
      6) reason="Couldn't resolve $host. Is sslip.io down?" ;;
      7) reason="Couldn't connect to $host. The server is still being set up, or its setup failed before Caddy started." ;;
      28) reason="$host timed out." ;;
      35 | 51 | 53 | 54 | 58 | 59 | 60 | 64 | 66 | 77 | 80 | 82 | 83 | 90 | 91)
        reason="HTTPS certificate problem (curl exit code $code): Caddy doesn't have a valid certificate for $host. Let's Encrypt may be rate limiting this hostname or sslip.io, or couldn't reach the server on port 80."
        ;;
      *) reason="curl failed with exit code $code." ;;
    esac
  fi

  if (($(date +%s) >= deadline)); then
    echo "::error::The app didn't come up in time. $reason"
    exit 1
  fi
  echo "Waiting: $reason"
  sleep 10
done
