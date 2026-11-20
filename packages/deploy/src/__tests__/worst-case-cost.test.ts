import worstCaseCost, {
  longestFittingLifetimeMinutes,
  roundUpUsd,
} from "../worst-case-cost.ts";

const input = {
  lifetimeHours: 1,
  hourlyUsd: 0.0145,
  egressCapMbit: 2,
  egressUsdPerGb: 0.09,
  limitUsd: 1,
};

// Azure (#90): swedencentral, Standard_B2ats_v2 at $0.00972 an hour, a public
// IP at $0.005 an hour, a disk at $2.40 a month (÷ 730), the whole VM billed
// for an hour of cleanup delay after it powers off, and egress at $0.087 per
// GB.
const azure = {
  hourlyUsd: 0.00972 + 0.005 + 2.4 / 730,
  cleanupDelayHours: 1,
  egressCapMbit: 2,
  egressUsdPerGb: 0.087,
  limitUsd: 1,
};

describe("roundUpUsd", () => {
  it("rounds up to $0.0001, never down", () => {
    expect(roundUpUsd(0.11431)).toBe(0.1144);
    expect(roundUpUsd(0.1144)).toBe(0.1144);
    expect(roundUpUsd(0.07000000000000001)).toBe(0.07);
    expect(roundUpUsd(0.00001)).toBe(0.0001);
    expect(roundUpUsd(0)).toBe(0);
    expect(Object.is(roundUpUsd(0), -0)).toBe(false);
  });
});

describe("worstCaseCost", () => {
  it("gives Azure's results for 60 and 1440 minutes", () => {
    // 2 h × $0.01800767 + 0.9 GB × $0.087 = $0.11431534, about $0.114
    const hour = worstCaseCost({ ...azure, lifetimeHours: 1 });
    expect(hour.billedHours).toBe(2);
    expect(hour.totalUsd).toBe(0.1144);
    // 25 h × $0.01800767 + 21.6 GB × $0.087 = $2.32939, about $2.33
    const day = worstCaseCost({ ...azure, lifetimeHours: 24 });
    expect(day.billedHours).toBe(25);
    expect(day.totalUsd).toBe(2.3294);
    expect(day.withinLimit).toBe(false);
  });

  it("bills every started hour, running and stopped together", () => {
    expect(worstCaseCost(input).billedHours).toBe(1);
    expect(
      worstCaseCost({ ...input, lifetimeHours: 65 / 60 }).billedRunningHours,
    ).toBe(2);
    // 30 minutes running and 30 stopped are one started hour, at the running
    // rate
    const half = worstCaseCost({
      ...input,
      lifetimeHours: 0.5,
      cleanupDelayHours: 0.5,
    });
    expect(half.billedRunningHours).toBe(1);
    expect(half.billedStoppedHours).toBe(0);
    // Float noise doesn't add an hour
    expect(
      worstCaseCost({ ...input, lifetimeHours: (60 + 60) / 60 }).billedHours,
    ).toBe(2);
  });

  it("bills exact time for providers that bill by the second", () => {
    const cost = worstCaseCost({
      ...input,
      lifetimeHours: 1.5,
      cleanupDelayHours: 0.25,
      wholeHours: false,
    });
    expect(cost.billedRunningHours).toBe(1.5);
    expect(cost.billedStoppedHours).toBe(0.25);
  });

  it("prices stopped time at its own rate", () => {
    // GCP bills only the disk while a VM is stopped
    const cost = worstCaseCost({
      ...input,
      cleanupDelayHours: 2,
      stoppedHourlyUsd: 0.0006,
    });
    expect(cost.billedStoppedHours).toBe(2);
    expect(cost.stoppedCostUsd).toBe(0.0012);
    // Without its own rate, stopped time costs as much as running
    expect(
      worstCaseCost({ ...input, cleanupDelayHours: 2 }).stoppedCostUsd,
    ).toBe(0.029);
  });

  it("sends at the cap while it runs, extra running time included", () => {
    // 2 Mbit/s is 250,000 bytes a second, 0.9 GB an hour
    expect(worstCaseCost(input).egressGb).toBeCloseTo(0.9);
    const backstop = worstCaseCost({ ...input, extraRunningHours: 5 / 60 });
    expect(backstop.egressGb).toBeCloseTo(0.975);
    expect(backstop.billedRunningHours).toBe(2);
    // No traffic while stopped
    expect(
      worstCaseCost({ ...input, cleanupDelayHours: 1 }).egressGb,
    ).toBeCloseTo(0.9);
  });

  it("adds up hourly costs, traffic and fixed extras", () => {
    const cost = worstCaseCost({
      ...input,
      fixedUsd: { "static IP": 0.01, setup: 0.02 },
    });
    expect(cost.hourlyCostUsd).toBe(0.0145);
    expect(cost.egressCostUsd).toBe(0.081);
    expect(cost.fixedCostUsd).toBe(0.03);
    expect(cost.totalUsd).toBe(0.1255);
  });

  it("compares the total with the limit", () => {
    const { totalUsd } = worstCaseCost(input);
    expect(worstCaseCost({ ...input, limitUsd: totalUsd }).withinLimit).toBe(
      true,
    );
    expect(
      worstCaseCost({ ...input, limitUsd: totalUsd - 0.0001 }).withinLimit,
    ).toBe(false);
  });

  it("refuses a negative or missing number", () => {
    expect(() => worstCaseCost({ ...input, egressCapMbit: -1 })).toThrow(
      "egressCapMbit",
    );
    expect(() =>
      worstCaseCost({ ...input, egressUsdPerGb: Number.NaN }),
    ).toThrow("egressUsdPerGb");
    expect(() => worstCaseCost({ ...input, stoppedHourlyUsd: -0.1 })).toThrow(
      "stoppedHourlyUsd",
    );
    expect(() =>
      worstCaseCost({
        ...input,
        fixedUsd: { setup: Number.POSITIVE_INFINITY },
      }),
    ).toThrow('fixedUsd["setup"]');
  });
});

describe("longestFittingLifetimeMinutes", () => {
  it("finds the longest lifetime whose worst case fits", () => {
    const minutes = longestFittingLifetimeMinutes(azure, 1);
    expect(minutes).toBeGreaterThan(0);
    const fits = worstCaseCost({ ...azure, lifetimeHours: minutes / 60 });
    const tooLong = worstCaseCost({
      ...azure,
      lifetimeHours: (minutes + 1) / 60,
    });
    expect(fits.totalUsd).toBeLessThanOrEqual(1);
    expect(tooLong.totalUsd).toBeGreaterThan(1);
  });

  it("stops at the most minutes allowed", () => {
    expect(longestFittingLifetimeMinutes(azure, 100)).toBe(1440);
    expect(longestFittingLifetimeMinutes(azure, 100, 90)).toBe(90);
  });

  it("is 0 when not even a minute fits", () => {
    expect(longestFittingLifetimeMinutes(azure, 0.01)).toBe(0);
    expect(longestFittingLifetimeMinutes(azure, 1, 0)).toBe(0);
  });
});
