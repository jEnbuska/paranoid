// The monthly spending limit for Google Cloud deployments. Google Cloud has
// no hard cap, and its budgets only send alerts from billing data that lags
// by hours, so the limit is kept here: every deployment's worst-case cost is
// known before it starts, and a deployment that doesn't fit what's left of
// the month's limit isn't started.
//
// The worst case is the VM, its IPv4 address and its disk for the whole
// lifetime, plus egress at the VM's outbound limit (deploy/server's `tc`
// limit) for all of it. Google Cloud deletes the VM at the end of its
// lifetime itself (--max-run-duration), so it can't run longer.
//
// The ledger records each deployment's reserved worst case. When its VM is
// deleted, the cost is settled from the VM's actual running and stopped time,
// still with egress at the limit, because the VM has no credentials to report
// its traffic. Until then, the full worst case counts. So a missing report
// only makes the total too high, never too low.

import type { Prices } from "./prices.ts";

const BYTES_PER_GIB = 2 ** 30;

/** What a deployment costs per hour, at worst */
export interface Rates {
  /** While the VM runs: the VM, its IPv4 address, its disk and egress */
  runningPerHour: number;
  /** While it's stopped (powered off) but not yet deleted: only its disk */
  stoppedPerHour: number;
}

/** One deployment in the ledger */
interface Deployment {
  lifetimeMinutes: number;
  rates: Rates;
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

/** GiB the VM can send in an hour at a limit of `mbit` Mbit/s */
export function egressGibPerHour(mbit: number): number {
  return (((mbit * 1_000_000) / 8) * 3600) / BYTES_PER_GIB;
}

export function rates(
  prices: Prices,
  region: string,
  egressMbit: number,
  diskGib: number,
): Rates {
  const regionPrices = prices.regions[region];
  if (!regionPrices) {
    throw new Error(
      `deploy/gcp/prices.ts has no prices for ${region}, so its cost can't be limited. It has ${Object.keys(prices.regions).join(", ")}.`,
    );
  }
  const disk = regionPrices.diskPerGibHour * diskGib;
  return {
    runningPerHour:
      regionPrices.vmPerHour +
      prices.ipv4PerHour +
      disk +
      egressGibPerHour(egressMbit) * prices.egressPerGib,
    stoppedPerHour: disk,
  };
}

/** Rounds up to a hundredth of a cent, so rounding never lowers a cost */
export function roundUp(usd: number): number {
  // The small offset keeps a float such as 0.07000000000000001 at 0.07, and
  // Math.max turns the -0 it gives for 0 into 0.
  return Math.max(0, Math.ceil(usd * 10_000 - 1e-6) / 10_000);
}

export function worstCase(deploymentRates: Rates, lifetimeMinutes: number) {
  return roundUp((deploymentRates.runningPerHour * lifetimeMinutes) / 60);
}

export function emptyLedger(month: string): Ledger {
  return { month, deployments: {} };
}

/** What a deployment counts against the limit */
function counted(deployment: Deployment): number {
  return deployment.settledUsd ?? deployment.reservedUsd;
}

export function spent(ledger: Ledger): number {
  return roundUp(
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
  deploymentRates: Rates,
  lifetimeMinutes: number,
): Decision {
  const costUsd = worstCase(deploymentRates, lifetimeMinutes);
  const spentUsd = spent(ledger);
  const remainingUsd = Math.max(0, roundUp(budgetUsd - spentUsd));
  if (costUsd <= remainingUsd) {
    return { fits: true, costUsd, spentUsd, remainingUsd };
  }
  let fittingMinutes = Math.floor(
    (remainingUsd / deploymentRates.runningPerHour) * 60,
  );
  // Rounding up the cost can push the last minute over.
  while (
    fittingMinutes > 0 &&
    worstCase(deploymentRates, fittingMinutes) > remainingUsd
  ) {
    fittingMinutes--;
  }
  return { fits: false, costUsd, spentUsd, remainingUsd, fittingMinutes };
}

/** Records a deployment's worst case, before its VM is created */
export function reserve(
  ledger: Ledger,
  id: string,
  deploymentRates: Rates,
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
        rates: deploymentRates,
        reservedUsd: worstCase(deploymentRates, lifetimeMinutes),
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
 * Replaces a deployment's reservation with its cost, once its VM is deleted.
 * A deployment that isn't in the ledger is left out.
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
  const settledUsd = roundUp(
    runningHours * deployment.rates.runningPerHour +
      stoppedHours * deployment.rates.stoppedPerHour,
  );
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
