// Refuses a deployment whose worst case costs more than a limit, before the
// deploy workflow starts a server. Node.js runs it from TypeScript, like the
// signaling server:
//
//   node packages/deploy/src/cli.ts --prices deploy/<provider>/prices.json \
//     --region <region> --server <server type> --lifetime-minutes <n> \
//     [--extra-running-minutes <n>] [--cleanup-delay-minutes <n>] \
//     --egress-mbit <n> --limit-usd <amount>
//
// - --extra-running-minutes: how long the server can keep running after its
//   lifetime, for example until a backstop removes it. Default 0.
// - --cleanup-delay-minutes: how long it stays billed after it stops, until
//   cleanup deletes it. Default: the price file's cleanupDelayMinutes, or 0.
//
// It prints the worst case, adds WORST_CASE_USD to GITHUB_ENV when that's
// set, and exits with code 1 if the worst case is above the limit, saying
// the longest lifetime that would fit. The price file's format is in
// prices.ts.
import { appendFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import deploymentPrices from "./prices.ts";
import worstCaseCost, {
  longestFittingLifetimeMinutes,
  roundUpUsd,
} from "./worst-case-cost.ts";

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
    "extra-running-minutes": { type: "string", default: "0" },
    "cleanup-delay-minutes": { type: "string" },
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
const region = option("region");
const server = option("server");
const lifetimeMinutes = amount("lifetime-minutes");
const extraRunningMinutes = amount("extra-running-minutes");
const egressCapMbit = amount("egress-mbit");
const limitUsd = amount("limit-usd");

let prices;
try {
  prices = deploymentPrices(
    JSON.parse(readFileSync(pricesPath, "utf8")),
    region,
    server,
  );
} catch (error) {
  fail(`${pricesPath}: ${(error as Error).message}`);
}
const cleanupDelayHours =
  values["cleanup-delay-minutes"] === undefined
    ? prices.cleanupDelayHours
    : amount("cleanup-delay-minutes") / 60;

const input = {
  extraRunningHours: extraRunningMinutes / 60,
  cleanupDelayHours,
  hourlyUsd: prices.hourlyUsd,
  stoppedHourlyUsd: prices.stoppedHourlyUsd,
  wholeHours: prices.wholeHours,
  egressCapMbit,
  egressUsdPerGb: prices.egressUsdPerGb,
  fixedUsd: prices.fixedUsd,
};
const cost = worstCaseCost({
  ...input,
  lifetimeHours: lifetimeMinutes / 60,
  limitUsd,
});

const usd = (value: number) => `$${roundUpUsd(value).toFixed(4)}`;
const hours = (value: number) => `${Number(value.toFixed(2))} h`;
const running = cost.billedRunningHours;
const stopped = cost.billedStoppedHours;
const runningMinutes = lifetimeMinutes + extraRunningMinutes;
const lines = [
  `Worst case for this deployment, with ${region} (${prices.regionName}) prices checked on ${prices.checked}:`,
  ...prices.lines.flatMap(({ name, runningUsdPerHour, stoppedUsdPerHour }) => [
    `- ${name}, running, for ${hours(running)}: ${usd(runningUsdPerHour * running)}`,
    ...(stopped > 0 && stoppedUsdPerHour > 0
      ? [
          `- ${name}, stopped, for ${hours(stopped)}: ${usd(stoppedUsdPerHour * stopped)}`,
        ]
      : []),
  ]),
  `- outbound traffic, ${cost.egressGb.toFixed(2)} GB at most (${egressCapMbit} Mbit/s for ${runningMinutes} min): ${usd(cost.egressCostUsd)}`,
  ...Object.entries(prices.fixedUsd).map(
    ([name, price]) => `- ${name}: ${usd(price)}`,
  ),
  `- total: ${usd(cost.totalUsd)}, limit: $${limitUsd.toFixed(2)}`,
];
console.log(lines.join("\n"));

const githubEnv = process.env.GITHUB_ENV;
if (githubEnv) {
  appendFileSync(githubEnv, `WORST_CASE_USD=${cost.totalUsd.toFixed(4)}\n`);
}

if (!cost.withinLimit) {
  const fitting = longestFittingLifetimeMinutes(input, limitUsd);
  fail(
    `The worst case, ${usd(cost.totalUsd)}, is more than the limit, $${limitUsd.toFixed(2)}. ` +
      (fitting > 0
        ? `The longest lifetime that fits is ${fitting} minutes. `
        : "Not even a 1-minute lifetime fits. ") +
      "Choose a shorter lifetime or a lower outbound limit, or raise the limit. No server was started.",
  );
}
