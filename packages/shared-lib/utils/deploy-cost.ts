// The most one deployment can cost, for the deploy workflows to check before
// they start a server. Provider-neutral: each provider passes its own prices.

type DeployCostArgs = {
  /** The server's lifetime, after which it powers off at the latest */
  lifetimeMinutes: number;
  /**
   * How long a server that has powered off can stay until the cleanup deletes
   * it. Where a stopped server is still billed, it costs as much as a running
   * one.
   */
  cleanupDelayMinutes: number;
  /** The server's limit on outbound traffic, in Mbit/s */
  maxEgressMbit: number;
  /** USD per hour for everything the server is made of: VM, disk, address */
  hourlyUsd: number;
  /** USD per GB (10^9 bytes) of outbound traffic */
  egressUsdPerGb: number;
};

/**
 * The worst case in USD: every started hour of the lifetime and the cleanup
 * delay at the hourly price, plus outbound traffic at its limit for the whole
 * lifetime. Free allowances aren't counted, since other use may have taken
 * them.
 */
export function worstCaseDeployCost(args: DeployCostArgs): number {
  for (const [name, value] of Object.entries(args)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be a number from 0 up, not ${value}`);
    }
  }
  const hours = Math.ceil(
    (args.lifetimeMinutes + args.cleanupDelayMinutes) / 60,
  );
  // Mbit/s × seconds = Mbit, / 8 = MB, / 1000 = GB
  const egressGb = (args.maxEgressMbit * args.lifetimeMinutes * 60) / 8 / 1000;
  return hours * args.hourlyUsd + egressGb * args.egressUsdPerGb;
}

/**
 * Whether a deployment's worst case is within `limitUsd`, with a message for
 * the job's log either way.
 */
export function checkDeployCost(args: DeployCostArgs & { limitUsd: number }): {
  ok: boolean;
  costUsd: number;
  message: string;
} {
  const { limitUsd, ...costArgs } = args;
  if (!Number.isFinite(limitUsd) || limitUsd < 0) {
    throw new Error(`limitUsd must be a number from 0 up, not ${limitUsd}`);
  }
  const costUsd = worstCaseDeployCost(costArgs);
  const cost = `$${costUsd.toFixed(2)}`;
  const limit = `$${limitUsd.toFixed(2)}`;
  return costUsd <= limitUsd
    ? {
        ok: true,
        costUsd,
        message: `This deployment costs at most ${cost}, within the limit of ${limit}.`,
      }
    : {
        ok: false,
        costUsd,
        message: `This deployment could cost up to ${cost}, more than the limit of ${limit}. Shorten lifetime_minutes, lower MAX_EGRESS_MBIT or raise MAX_DEPLOY_COST_USD.`,
      };
}
