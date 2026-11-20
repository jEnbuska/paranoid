// The most one deployment can cost, for the deploy workflows of providers
// that bill by time and charge for outbound traffic. Each provider's
// workflow checks it against a limit before it starts a server.
//
// It's a worst case: the server is billed for its whole lifetime, any time
// it can keep running after that until a backstop removes it, and any time
// it stays billed while stopped until cleanup deletes it. It sends at its
// outbound cap the whole time it runs. Free allowances and credits aren't
// subtracted, and every cost is rounded up, never down, to $0.0001.
//
// Units: US dollars, hours, Mbit/s (10^6 bits a second) and GB (10^9 bytes).
// A provider that prices traffic per GiB (2^30 bytes) converts its price,
// for example with prices.ts: per-GB price = per-GiB price / 1.073741824.

export type WorstCaseInput = {
  /** Hours the server can run, and send, at most. */
  lifetimeHours: number;
  /**
   * Hours it can keep running, and sending, after its lifetime, for example
   * until a backstop terminates it. Default 0.
   */
  extraRunningHours?: number;
  /**
   * Hours it can stay billed after it stops running, without sending, for
   * example a powered-off server until cleanup deletes it. Default 0.
   */
  cleanupDelayHours?: number;
  /** Everything billed per hour while the server runs: server, address, disk. */
  hourlyUsd: number;
  /** What's billed per hour while it's stopped. Default hourlyUsd. */
  stoppedHourlyUsd?: number;
  /**
   * Whether every started hour is billed in full. Default true. False bills
   * time exactly, for providers that bill by the second.
   */
  wholeHours?: boolean;
  /** The server's outbound cap, in Mbit/s. */
  egressCapMbit: number;
  /** Outbound traffic to the internet, per GB. */
  egressUsdPerGb: number;
  /** One-off costs per deployment, by name. Default none. */
  fixedUsd?: Record<string, number>;
  /** The most a deployment may cost. */
  limitUsd: number;
};

export type WorstCase = {
  /** Running hours billed: the lifetime and extra running time */
  billedRunningHours: number;
  /** Stopped hours billed: the cleanup delay */
  billedStoppedHours: number;
  /** Both together */
  billedHours: number;
  /** The most the server can send, in GB */
  egressGb: number;
  runningCostUsd: number;
  stoppedCostUsd: number;
  /** Running and stopped together */
  hourlyCostUsd: number;
  egressCostUsd: number;
  fixedCostUsd: number;
  totalUsd: number;
  /** Whether totalUsd is at most limitUsd */
  withinLimit: boolean;
};

/** Rounds up to a hundredth of a cent, so rounding never lowers a cost. */
export function roundUpUsd(usd: number): number {
  // The small offset keeps a float such as 0.07000000000000001 at 0.07, and
  // Math.max turns the -0 it gives for 0 into 0.
  return Math.max(0, Math.ceil(usd * 10_000 - 1e-6) / 10_000);
}

/** Rounds hours up to whole hours, ignoring float noise such as 2.0000000001 */
function wholeHoursUp(hours: number): number {
  return Math.ceil(hours - 1e-9);
}

function check(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a number of at least 0, not ${value}`);
  }
}

export default function worstCaseCost(input: WorstCaseInput): WorstCase {
  const {
    lifetimeHours,
    extraRunningHours = 0,
    cleanupDelayHours = 0,
    hourlyUsd,
    stoppedHourlyUsd = hourlyUsd,
    wholeHours = true,
    egressCapMbit,
    egressUsdPerGb,
    fixedUsd = {},
    limitUsd,
  } = input;
  const numbers = {
    lifetimeHours,
    extraRunningHours,
    cleanupDelayHours,
    hourlyUsd,
    stoppedHourlyUsd,
    egressCapMbit,
    egressUsdPerGb,
    limitUsd,
  };
  for (const [name, value] of Object.entries(numbers)) {
    check(name, value);
  }
  for (const [name, value] of Object.entries(fixedUsd)) {
    check(`fixedUsd["${name}"]`, value);
  }

  const runningHours = lifetimeHours + extraRunningHours;
  let billedRunningHours = runningHours;
  let billedStoppedHours = cleanupDelayHours;
  if (wholeHours) {
    // A provider billing whole hours bills the running and stopped time
    // together, so they're rounded up together. Any hour that's partly
    // running counts at the running rate.
    const billed = wholeHoursUp(runningHours + cleanupDelayHours);
    billedRunningHours = Math.min(billed, wholeHoursUp(runningHours));
    billedStoppedHours = billed - billedRunningHours;
  }
  // The cap, in bytes a second, for every second it runs, in GB
  const egressGb = (((egressCapMbit * 1e6) / 8) * runningHours * 3600) / 1e9;

  const running = billedRunningHours * hourlyUsd;
  const stopped = billedStoppedHours * stoppedHourlyUsd;
  const egress = egressGb * egressUsdPerGb;
  const fixed = Object.values(fixedUsd).reduce((a, b) => a + b, 0);
  const totalUsd = roundUpUsd(running + stopped + egress + fixed);
  return {
    billedRunningHours,
    billedStoppedHours,
    billedHours: billedRunningHours + billedStoppedHours,
    egressGb,
    runningCostUsd: roundUpUsd(running),
    stoppedCostUsd: roundUpUsd(stopped),
    hourlyCostUsd: roundUpUsd(running + stopped),
    egressCostUsd: roundUpUsd(egress),
    fixedCostUsd: roundUpUsd(fixed),
    totalUsd,
    withinLimit: totalUsd <= limitUsd,
  };
}

/**
 * The longest whole number of lifetime minutes, up to maxMinutes, whose
 * worst case costs at most remainingUsd, for a refusal message. 0 if not
 * even one minute fits. The rest of the input is as for worstCaseCost.
 */
export function longestFittingLifetimeMinutes(
  input: Omit<WorstCaseInput, "lifetimeHours" | "limitUsd">,
  remainingUsd: number,
  maxMinutes = 1440,
): number {
  check("remainingUsd", remainingUsd);
  check("maxMinutes", maxMinutes);
  const costOf = (minutes: number) =>
    worstCaseCost({
      ...input,
      lifetimeHours: minutes / 60,
      limitUsd: remainingUsd,
    }).totalUsd;
  // The cost only grows with the lifetime, so a binary search finds it:
  // `fits` always fits (0 counts as fitting), and `tooLong` never does.
  let fits = 0;
  let tooLong = Math.floor(maxMinutes) + 1;
  while (tooLong - fits > 1) {
    const middle = Math.floor((fits + tooLong) / 2);
    if (costOf(middle) <= remainingUsd) {
      fits = middle;
    } else {
      tooLong = middle;
    }
  }
  return fits;
}
