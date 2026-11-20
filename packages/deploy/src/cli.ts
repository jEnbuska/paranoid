// Refuses a deployment whose worst case costs more than a limit, before the
// deploy workflow starts a server. Node.js runs it from TypeScript, like the
// signaling server:
//
//   node packages/deploy/src/cli.ts --prices deploy/<provider>/prices.json \
//     --region <region> --server <server type> --lifetime-minutes <n> \
//     [--cleanup-delay-minutes <n>] --egress-mbit <n> --limit-usd <amount>
//
// It prints the worst case, adds WORST_CASE_USD to GITHUB_ENV when that's
// set, and exits with code 1 if the worst case is above the limit.
//
// The price file is the provider's, with the date its prices were checked:
//
//   {
//     "checked": "2026-11-20",
//     "regions": {
//       "<region>": {
//         "name": "Stockholm",
//         "servers": { "<server type>": <USD an hour> },
//         "hourlyUsd": { "<what>": <USD an hour> },   (optional)
//         "fixedUsd": { "<what>": <USD a deployment> }, (optional)
//         "egressUsdPerGb": <USD per GB, 10^9 bytes>
//       }
//     }
//   }
import { appendFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import worstCaseCost from "./worst-case-cost.ts";

type RegionPrices = {
  name: string;
  servers: Record<string, number>;
  hourlyUsd?: Record<string, number>;
  fixedUsd?: Record<string, number>;
  egressUsdPerGb: number;
};
type PriceFile = { checked: string; regions: Record<string, RegionPrices> };

function fail(message: string): never {
  console.log(`::error::${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    prices: { type: "string" },
    region: { type: "string" },
    server: { type: "string" },
    "lifetime-minutes": { type: "string" },
    "cleanup-delay-minutes": { type: "string", default: "0" },
    "egress-mbit": { type: "string" },
    "limit-usd": { type: "string" },
  },
  strict: true,
});

function option(name: keyof typeof values): string {
  const value = values[name];
  if (value === undefined || value === "") {
    fail(`--${name} is missing`);
  }
  return value;
}

function amount(name: keyof typeof values): number {
  const value = Number(option(name));
  if (!Number.isFinite(value) || value < 0) {
    fail(`--${name} must be a number of at least 0, not '${values[name]}'`);
  }
  return value;
}

const pricesPath = option("prices");
const regionCode = option("region");
const server = option("server");
const lifetimeMinutes = amount("lifetime-minutes");
const cleanupDelayMinutes = amount("cleanup-delay-minutes");
const egressCapMbit = amount("egress-mbit");
const limitUsd = amount("limit-usd");

const file = JSON.parse(readFileSync(pricesPath, "utf8")) as PriceFile;
const region = file.regions?.[regionCode];
const serverUsd = region?.servers?.[server];
if (region === undefined || serverUsd === undefined) {
  fail(`${pricesPath} has no price for ${server} in ${regionCode}`);
}
const hourly = { [server]: serverUsd, ...region.hourlyUsd };

const cost = worstCaseCost({
  lifetimeHours: lifetimeMinutes / 60,
  cleanupDelayHours: cleanupDelayMinutes / 60,
  hourlyUsd: Object.values(hourly).reduce((a, b) => a + b, 0),
  egressCapMbit,
  egressUsdPerGb: region.egressUsdPerGb,
  fixedUsd: region.fixedUsd,
  limitUsd,
});

const usd = (value: number) => `$${value.toFixed(4)}`;
const lines = [
  `Worst case for this deployment, with ${regionCode} (${region.name}) prices checked on ${file.checked}:`,
  ...Object.entries(hourly).map(
    ([what, price]) =>
      `- ${what} for ${cost.billedHours} h: ${usd(price * cost.billedHours)}`,
  ),
  `- outbound traffic, ${cost.egressGb.toFixed(2)} GB at most (${egressCapMbit} Mbit/s for ${lifetimeMinutes} min): ${usd(cost.egressCostUsd)}`,
  ...Object.entries(region.fixedUsd ?? {}).map(
    ([what, price]) => `- ${what}: ${usd(price)}`,
  ),
  `- total: ${usd(cost.totalUsd)}, limit: $${limitUsd.toFixed(2)}`,
];
console.log(lines.join("\n"));

const githubEnv = process.env.GITHUB_ENV;
if (githubEnv) {
  appendFileSync(githubEnv, `WORST_CASE_USD=${cost.totalUsd.toFixed(2)}\n`);
}

if (!cost.withinLimit) {
  fail(
    `The worst case, ${usd(cost.totalUsd)}, is more than the limit, $${limitUsd.toFixed(2)}. ` +
      "Choose a shorter lifetime or a lower outbound limit, or raise the limit. No server was started.",
  );
}
