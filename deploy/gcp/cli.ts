// Updates a local copy of a month's ledger (see ledger.ts). ledger.sh
// downloads it from the bucket, runs this and uploads the result, so this
// file never talks to Google Cloud.
//
// node deploy/gcp/cli.ts reserve <file>
//   Fails, without changing the file, if the deployment doesn't fit.
//   Environment: MONTH, DEPLOYMENT, REGION, LIFETIME_MINUTES,
//   MAX_EGRESS_MBIT, GCP_MONTHLY_BUDGET_USD
// node deploy/gcp/cli.ts settle <file>
//   Environment: MONTH, DEPLOYMENT, CREATED, STOPPED (empty if it didn't
//   power off), DELETED
//
// A file that doesn't exist is an empty ledger.

import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import deploymentPrices from "deploy/src/prices.ts";
import {
  decide,
  emptyLedger,
  pricing,
  reserve,
  settle,
  spent,
  type Ledger,
} from "./ledger.ts";

/** The only machine type the prices and the VM use */
const MACHINE_TYPE = "e2-micro";

function env(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} isn't set`);
  }
  return value;
}

function number(name: string): number {
  const value = Number(env(name));
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} isn't a number: '${env(name)}'`);
  }
  return value;
}

function usd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function output(name: string, value: string) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) {
    appendFileSync(file, `${name}=${value}\n`);
  }
}

const [command, file] = process.argv.slice(2);
if (!file || (command !== "reserve" && command !== "settle")) {
  console.error("Usage: node deploy/gcp/cli.ts reserve|settle <file>");
  process.exit(2);
}

const month = env("MONTH");
const ledger: Ledger = existsSync(file)
  ? (JSON.parse(readFileSync(file, "utf8")) as Ledger)
  : emptyLedger(month);
if (ledger.month !== month) {
  throw new Error(`${file} is the ledger for ${ledger.month}, not ${month}`);
}
const id = env("DEPLOYMENT");

if (command === "reserve") {
  const budgetUsd = number("GCP_MONTHLY_BUDGET_USD");
  const lifetimeMinutes = number("LIFETIME_MINUTES");
  const prices = deploymentPrices(
    JSON.parse(
      readFileSync(new URL("prices.json", import.meta.url), "utf8"),
    ) as unknown,
    env("REGION"),
    MACHINE_TYPE,
  );
  const deploymentPricing = pricing(prices, number("MAX_EGRESS_MBIT"));
  const decision = decide(
    ledger,
    budgetUsd,
    deploymentPricing,
    lifetimeMinutes,
  );
  console.log(
    `Worst case for ${lifetimeMinutes} minutes in ${prices.regionName}: ${usd(decision.costUsd)} (prices from ${prices.checked}). Counted in ${month} so far: ${usd(decision.spentUsd)} of ${usd(budgetUsd)}.`,
  );
  if (!decision.fits) {
    const fitting =
      decision.fittingMinutes > 0
        ? `A lifetime of up to ${decision.fittingMinutes} minutes would fit.`
        : "No deployment fits until next month, unless GCP_MONTHLY_BUDGET_USD is raised.";
    console.log(
      `::error::This deployment could cost up to ${usd(decision.costUsd)}, but only ${usd(decision.remainingUsd)} of this month's ${usd(budgetUsd)} limit is left, so it wasn't started. ${fitting}`,
    );
    process.exit(1);
  }
  writeFileSync(
    file,
    `${JSON.stringify(reserve(ledger, id, deploymentPricing, lifetimeMinutes), null, 2)}\n`,
  );
  output("worst_case_usd", decision.costUsd.toFixed(4));
  output(
    "remaining_usd",
    Math.max(0, decision.remainingUsd - decision.costUsd).toFixed(4),
  );
} else {
  if (!ledger.deployments[id]) {
    console.log(
      `::warning::Deployment ${id} isn't in the ${month} ledger, so there's nothing to settle.`,
    );
  } else {
    const settled = settle(ledger, id, {
      created: env("CREATED"),
      stopped: process.env.STOPPED || undefined,
      deleted: env("DELETED"),
    });
    writeFileSync(file, `${JSON.stringify(settled, null, 2)}\n`);
    const deployment = settled.deployments[id];
    console.log(
      `Deployment ${id} cost at most ${usd(deployment.settledUsd ?? 0)}, of ${usd(deployment.reservedUsd)} reserved. Counted in ${month} now: ${usd(spent(settled))}.`,
    );
  }
}
