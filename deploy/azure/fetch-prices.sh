#!/usr/bin/env bash
# Prints a new deploy/azure/prices.json from Microsoft's retail prices API,
# which is public and needs no sign-in: pay-as-you-go prices in USD, without
# VAT. Review the difference before committing it.
#
# Usage: deploy/azure/fetch-prices.sh [region ...] > deploy/azure/prices.json
# Needs curl and jq. The VM sizes are the ones below.
set -euo pipefail

regions=("$@")
[ ${#regions[@]} -gt 0 ] || regions=(swedencentral germanywestcentral northeurope westeurope)
sizes=(Standard_B1s Standard_B2ats_v2 Standard_B2pts_v2)
api=https://prices.azure.com/api/retail/prices

# price <OData filter>: the one pay-as-you-go price that matches, or fails
price() {
  local items
  items=$(curl -fsS -G "$api" --data-urlencode "\$filter=priceType eq 'Consumption' and $1" |
    jq '[.Items[] | select(.productName | test("Windows|Cloud Services") | not)
        | select(.meterName | test("Spot|Low Priority") | not)]')
  if [ "$(jq length <<<"$items")" != 1 ]; then
    echo "Expected one price for: $1" >&2
    jq -c '.[] | {productName, meterName, retailPrice}' <<<"$items" >&2
    exit 1
  fi
  jq '.[0].retailPrice' <<<"$items"
}

result=$(jq -n --arg checked "$(date -u +%F)" '{
  checked: $checked,
  source: "Microsoft'"'"'s retail prices API, https://prices.azure.com/api/retail/prices: pay-as-you-go, USD, without VAT. Refresh with deploy/azure/fetch-prices.sh.",
  cleanupDelayMinutes: 60,
  regions: {}
}')
for region in "${regions[@]}"; do
  echo "Fetching $region" >&2
  where="armRegionName eq '$region'"
  vms='{}'
  for size in "${sizes[@]}"; do
    vm=$(price "$where and serviceName eq 'Virtual Machines' and armSkuName eq '$size'")
    vms=$(jq --arg size "$size" --argjson price "$vm" '.[$size] = $price' <<<"$vms")
  done
  ip=$(price "$where and meterName eq 'Standard IPv4 Static Public IP'")
  disk=$(price "$where and skuName eq 'E4 LRS' and meterName eq 'E4 LRS Disk'")
  # The first 100 GB a month are free, but other use may have taken them, so
  # the price after them counts.
  egress=$(price "$where and serviceName eq 'Bandwidth' and productName eq 'Rtn Preference: MGN' and meterName eq 'Standard Data Transfer Out' and tierMinimumUnits eq 100")
  result=$(jq --arg region "$region" --argjson vms "$vms" --argjson ip "$ip" \
    --argjson disk "$disk" --argjson egress "$egress" \
    '.regions[$region] = {vmPerHour: $vms, publicIpPerHour: $ip, diskPerMonth: $disk, egressPerGb: $egress}' <<<"$result")
done
echo "$result"
