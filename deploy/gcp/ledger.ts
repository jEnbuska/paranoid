// Updates a local copy of a month's ledger (see budget.ts). ledger.sh
// downloads it from the bucket, runs this and uploads the result, so this
// file never talks to Google Cloud.
//
// node deploy/gcp/ledger.ts reserve <file>
//   Fails, without changing the file, if the deployment doesn't fit.
//   Environment: MONTH, DEPLOYMENT, REGION, LIFETIME_MINUTES,
//   MAX_EGRESS_MBIT, DISK_GIB, MONTHLY_BUDGET_USD
// node deploy/gcp/ledger.ts settle <file>
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
import {
  decide,
  emptyLedger,
  rates,
  reserve,
  settle,
  spent,
  type Ledger,
} from "./budget.ts";
import { prices } from "./prices.ts";

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
  console.error("Usage: node deploy/gcp/ledger.ts reserve|settle <file>");
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
  const budgetUsd = number("MONTHLY_BUDGET_USD");
  const lifetimeMinutes = number("LIFETIME_MINUTES");
  const deploymentRates = rates(
    prices,
    env("REGION"),
    number("MAX_EGRESS_MBIT"),
    number("DISK_GIB"),
  );
  const decision = decide(ledger, budgetUsd, deploymentRates, lifetimeMinutes);
  console.log(
    `Worst case for ${lifetimeMinutes} minutes: ${usd(decision.costUsd)} (${usd(deploymentRates.runningPerHour)} an hour, prices from ${prices.checked}). Counted in ${month} so far: ${usd(decision.spentUsd)} of ${usd(budgetUsd)}.`,
  );
  if (!decision.fits) {
    const fitting =
      decision.fittingMinutes > 0
        ? `A lifetime of up to ${decision.fittingMinutes} minutes would fit.`
        : "No deployment fits until next month, unless MONTHLY_BUDGET_USD is raised.";
    console.log(
      `::error::This deployment could cost up to ${usd(decision.costUsd)}, but only ${usd(decision.remainingUsd)} of this month's ${usd(budgetUsd)} limit is left, so it wasn't started. ${fitting}`,
    );
    process.exit(1);
  }
  writeFileSync(
    file,
    `${JSON.stringify(reserve(ledger, id, deploymentRates, lifetimeMinutes), null, 2)}\n`,
  );
  output("worst_case_usd", decision.costUsd.toFixed(4));
  output(
    "remaining_usd",
    (decision.remainingUsd - decision.costUsd).toFixed(4),
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
