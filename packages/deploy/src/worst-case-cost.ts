// The most one deployment can cost, for the deploy workflows of providers
// that bill by the hour and charge for outbound traffic. Each provider's
// workflow checks it against a limit before it starts a server.
//
// It's a worst case: the server is billed for its whole lifetime and any
// cleanup delay, rounded up to whole hours, and sends at its outbound cap for
// the whole lifetime. Free allowances and credits aren't subtracted.
//
// Units: US dollars, hours, Mbit/s (10^6 bits a second) and GB (10^9 bytes).
// A provider that prices traffic per GiB (2^30 bytes) converts its price to
// per GB in its price file: per-GB price = per-GiB price / 1.073741824.

export type WorstCaseInput = {
  /** Hours the server can run, and send, at most. */
  lifetimeHours: number;
  /**
   * Hours it can stay billed after its lifetime without sending, for example
   * a powered-off server until cleanup deletes it. Default 0.
   */
  cleanupDelayHours?: number;
  /** Everything billed per hour while the server exists: server, address, disk. */
  hourlyUsd: number;
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
  /** The lifetime and cleanup delay, rounded up to whole hours */
  billedHours: number;
  /** The most the server can send, in GB */
  egressGb: number;
  hourlyCostUsd: number;
  egressCostUsd: number;
  fixedCostUsd: number;
  totalUsd: number;
  /** Whether totalUsd is at most limitUsd */
  withinLimit: boolean;
};

function check(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a number of at least 0, not ${value}`);
  }
}

export default function worstCaseCost(input: WorstCaseInput): WorstCase {
  const {
    lifetimeHours,
    cleanupDelayHours = 0,
    hourlyUsd,
    egressCapMbit,
    egressUsdPerGb,
    fixedUsd = {},
    limitUsd,
  } = input;
  const numbers = {
    lifetimeHours,
    cleanupDelayHours,
    hourlyUsd,
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

  // Billing per started hour is the most any of them charges.
  const billedHours = Math.ceil(lifetimeHours + cleanupDelayHours);
  // The cap, in bytes a second, for every second of the lifetime, in GB
  const egressGb = (((egressCapMbit * 1e6) / 8) * lifetimeHours * 3600) / 1e9;

  const hourlyCostUsd = billedHours * hourlyUsd;
  const egressCostUsd = egressGb * egressUsdPerGb;
  const fixedCostUsd = Object.values(fixedUsd).reduce((a, b) => a + b, 0);
  const totalUsd = hourlyCostUsd + egressCostUsd + fixedCostUsd;
  return {
    billedHours,
    egressGb,
    hourlyCostUsd,
    egressCostUsd,
    fixedCostUsd,
    totalUsd,
    withinLimit: totalUsd <= limitUsd,
  };
}
