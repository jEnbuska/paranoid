// Refuses a deployment whose worst case is above MAX_DEPLOY_COST_USD, before
// deploy-azure.yml starts anything. Prices come from prices.json, next to
// this file. Run by Node directly: node deploy/azure/check-cost.mts
//
// Reads REGION, VM_SIZE, LIFETIME_MINUTES and MAX_EGRESS_MBIT, as settings.sh
// checked them, and MAX_DEPLOY_COST_USD.
import { readFileSync } from "node:fs";
import { checkDeployCost } from "../../packages/shared-lib/utils/deploy-cost.ts";

type RegionPrices = {
  vmPerHour: Record<string, number>;
  publicIpPerHour: number;
  diskPerMonth: number;
  egressPerGb: number;
};
type Prices = {
  checked: string;
  cleanupDelayMinutes: number;
  regions: Record<string, RegionPrices>;
};

// Azure bills managed disks by the month, prorated by the hour, over 730
// hours.
const HOURS_PER_MONTH = 730;

function fail(message: string): never {
  console.log(`::error::${message}`);
  process.exit(1);
}

const env = (name: string) => process.env[name] ?? "";
const region = env("REGION");
const size = env("VM_SIZE");
const limit = env("MAX_DEPLOY_COST_USD") || "1";
if (!/^\d{1,4}(\.\d{1,2})?$/.test(limit)) {
  fail(
    `MAX_DEPLOY_COST_USD must be an amount in USD such as 1 or 2.50, not '${limit}'`,
  );
}

const prices: Prices = JSON.parse(
  readFileSync(new URL("prices.json", import.meta.url), "utf8"),
);
const regionPrices = Object.hasOwn(prices.regions, region)
  ? prices.regions[region]
  : undefined;
const vmPerHour =
  regionPrices && Object.hasOwn(regionPrices.vmPerHour, size)
    ? regionPrices.vmPerHour[size]
    : undefined;
if (!regionPrices || vmPerHour === undefined) {
  fail(
    `deploy/azure/prices.json has no price for ${size} in ${region}, so the worst case can't be worked out. Add it from https://azure.microsoft.com/pricing/details/virtual-machines/linux/ or deploy/azure/fetch-prices.sh.`,
  );
}

const hourlyUsd =
  vmPerHour +
  regionPrices.publicIpPerHour +
  regionPrices.diskPerMonth / HOURS_PER_MONTH;
const result = checkDeployCost({
  lifetimeMinutes: Number(env("LIFETIME_MINUTES")),
  cleanupDelayMinutes: prices.cleanupDelayMinutes,
  maxEgressMbit: Number(env("MAX_EGRESS_MBIT")),
  hourlyUsd,
  egressUsdPerGb: regionPrices.egressPerGb,
  limitUsd: Number(limit),
});

console.log(
  `Prices from ${prices.checked}: ${size} in ${region} with its disk and address $${hourlyUsd.toFixed(4)} an hour, outbound traffic $${regionPrices.egressPerGb} per GB, cleanup within ${prices.cleanupDelayMinutes} minutes.`,
);
if (!result.ok) {
  fail(result.message);
}
console.log(result.message);
