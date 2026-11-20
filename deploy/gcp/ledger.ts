// The monthly spending limit for Google Cloud deployments. Google Cloud has
// no hard cap, and its budgets only send alerts from billing data that lags
// by hours, so the limit is kept here: every deployment's worst-case cost is
// known before it starts, and one that doesn't fit what's left of the
// month's limit isn't started.
//
// The worst case is packages/deploy's worstCaseCost, from prices.json: the
// VM, its IPv4 address and its disk for the whole lifetime, egress at the
// VM's outbound limit for all of it, and the disk until cleanup. Google
// Cloud deletes the VM at the end of its lifetime itself
// (--max-run-duration), so it can't run longer.
//
// The ledger records each deployment's reserved worst case. When its VM is
// deleted, the cost is settled from the VM's actual running and stopped
// time, still with egress at the limit, because the VM has no credentials to
// report its traffic. Until then, the full worst case counts. So a missing
// report only makes the total too high, never too low.

import type { DeploymentPrices } from "deploy/src/prices.ts";
import worstCaseCost, {
  longestFittingLifetimeMinutes,
  roundUpUsd,
  type WorstCaseInput,
} from "deploy/src/worst-case-cost.ts";

/**
 * What a deployment's cost is worked out from. It's kept with the
 * deployment, so it's settled with the prices it was reserved with.
 */
export interface Pricing {
  pricesChecked: string;
  hourlyUsd: number;
  stoppedHourlyUsd: number;
  egressUsdPerGb: number;
  egressCapMbit: number;
  wholeHours: boolean;
  cleanupDelayHours: number;
  fixedUsd: Record<string, number>;
}

/** One deployment in the ledger */
interface Deployment {
  lifetimeMinutes: number;
  pricing: Pricing;
  /** The worst case, reserved before the VM was created */
  reservedUsd: number;
  /** The cost once the VM is gone, from its actual time */
  settledUsd?: number;
  runningHours?: number;
  stoppedHours?: number;
}

/**
 * One month's deployments, keyed by deployment (the workflow run's ID and
 * attempt). Totals only: nothing about who used a server or when chats
 * happened.
 */
export interface Ledger {
  month: string;
  deployments: Record<string, Deployment>;
}

export function pricing(
  prices: DeploymentPrices,
  egressCapMbit: number,
): Pricing {
  return {
    pricesChecked: prices.checked,
    hourlyUsd: prices.hourlyUsd,
    stoppedHourlyUsd: prices.stoppedHourlyUsd,
    egressUsdPerGb: prices.egressUsdPerGb,
    egressCapMbit,
    wholeHours: prices.wholeHours,
    cleanupDelayHours: prices.cleanupDelayHours,
    fixedUsd: prices.fixedUsd,
  };
}

/** worstCaseCost's input for a lifetime, without the limit */
function costInput(
  deploymentPricing: Pricing,
): Omit<WorstCaseInput, "lifetimeHours" | "limitUsd"> {
  const { pricesChecked: _checked, ...input } = deploymentPricing;
  return input;
}

export function worstCase(deploymentPricing: Pricing, lifetimeMinutes: number) {
  return worstCaseCost({
    ...costInput(deploymentPricing),
    lifetimeHours: lifetimeMinutes / 60,
    limitUsd: 0,
  }).totalUsd;
}

export function emptyLedger(month: string): Ledger {
  return { month, deployments: {} };
}

/** What a deployment counts against the limit */
function counted(deployment: Deployment): number {
  return deployment.settledUsd ?? deployment.reservedUsd;
}

export function spent(ledger: Ledger): number {
  return roundUpUsd(
    Object.values(ledger.deployments).reduce(
      (sum, deployment) => sum + counted(deployment),
      0,
    ),
  );
}

export type Decision =
  | { fits: true; costUsd: number; spentUsd: number; remainingUsd: number }
  | {
      fits: false;
      costUsd: number;
      spentUsd: number;
      remainingUsd: number;
      /** The longest lifetime that would fit, 0 if none does */
      fittingMinutes: number;
    };

/** Whether a deployment's worst case fits in what's left of the limit */
export function decide(
  ledger: Ledger,
  budgetUsd: number,
  deploymentPricing: Pricing,
  lifetimeMinutes: number,
): Decision {
  const spentUsd = spent(ledger);
  // Rounded down, so the float noise of a subtraction never adds to it
  const remainingUsd = Math.max(
    0,
    Math.floor((budgetUsd - spentUsd) * 10_000 + 1e-6) / 10_000,
  );
  const { totalUsd: costUsd, withinLimit } = worstCaseCost({
    ...costInput(deploymentPricing),
    lifetimeHours: lifetimeMinutes / 60,
    limitUsd: remainingUsd,
  });
  if (withinLimit) {
    return { fits: true, costUsd, spentUsd, remainingUsd };
  }
  return {
    fits: false,
    costUsd,
    spentUsd,
    remainingUsd,
    fittingMinutes: longestFittingLifetimeMinutes(
      costInput(deploymentPricing),
      remainingUsd,
    ),
  };
}

/** Records a deployment's worst case, before its VM is created */
export function reserve(
  ledger: Ledger,
  id: string,
  deploymentPricing: Pricing,
  lifetimeMinutes: number,
): Ledger {
  if (ledger.deployments[id]) {
    throw new Error(`Deployment ${id} is already in the ledger.`);
  }
  return {
    ...ledger,
    deployments: {
      ...ledger.deployments,
      [id]: {
        lifetimeMinutes,
        pricing: deploymentPricing,
        reservedUsd: worstCase(deploymentPricing, lifetimeMinutes),
      },
    },
  };
}

/** A VM's times, from Google Cloud, as ISO 8601 timestamps */
export interface VmTimes {
  created: string;
  /** When it powered off, if it did */
  stopped?: string;
  deleted: string;
}

function hoursBetween(from: string, to: string): number {
  const ms = Date.parse(to) - Date.parse(from);
  if (Number.isNaN(ms)) {
    throw new Error(`Not a timestamp: '${from}' or '${to}'`);
  }
  return Math.max(0, ms / 3_600_000);
}

/**
 * Replaces a deployment's reservation with its cost, once its VM is deleted:
 * worstCaseCost with the time it actually ran and was off. A deployment
 * that isn't in the ledger is left out.
 */
export function settle(ledger: Ledger, id: string, times: VmTimes): Ledger {
  const deployment = ledger.deployments[id];
  if (!deployment) {
    return ledger;
  }
  const runningHours = hoursBetween(
    times.created,
    times.stopped || times.deleted,
  );
  const stoppedHours = times.stopped
    ? hoursBetween(times.stopped, times.deleted)
    : 0;
  const settledUsd = worstCaseCost({
    ...costInput(deployment.pricing),
    lifetimeHours: runningHours,
    cleanupDelayHours: stoppedHours,
    limitUsd: 0,
  }).totalUsd;
  return {
    ...ledger,
    deployments: {
      ...ledger.deployments,
      // A second settlement, after a retried deletion, can only add to it.
      [id]: {
        ...deployment,
        settledUsd: Math.max(settledUsd, deployment.settledUsd ?? 0),
        runningHours: Math.max(runningHours, deployment.runningHours ?? 0),
        stoppedHours: Math.max(stoppedHours, deployment.stoppedHours ?? 0),
      },
    },
  };
}
