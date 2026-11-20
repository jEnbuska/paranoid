import { checkDeployCost, worstCaseDeployCost } from "../deploy-cost.ts";

const args = {
  lifetimeMinutes: 60,
  cleanupDelayMinutes: 60,
  maxEgressMbit: 2,
  hourlyUsd: 0.1,
  egressUsdPerGb: 0.1,
};

describe("worstCaseDeployCost", () => {
  it("adds the hours and the outbound traffic at its limit", () => {
    // 2 hours × $0.1, and 2 Mbit/s for 3600 s = 0.9 GB × $0.1
    expect(worstCaseDeployCost(args)).toBeCloseTo(0.2 + 0.09, 10);
  });

  it("bills every started hour", () => {
    expect(
      worstCaseDeployCost({ ...args, lifetimeMinutes: 1, maxEgressMbit: 0 }),
    ).toBeCloseTo(0.2, 10);
    expect(
      worstCaseDeployCost({
        ...args,
        lifetimeMinutes: 1,
        cleanupDelayMinutes: 0,
        maxEgressMbit: 0,
      }),
    ).toBeCloseTo(0.1, 10);
  });

  it("counts outbound traffic for the lifetime only", () => {
    const withoutCleanup = worstCaseDeployCost({
      ...args,
      hourlyUsd: 0,
      cleanupDelayMinutes: 0,
    });
    expect(worstCaseDeployCost({ ...args, hourlyUsd: 0 })).toBe(withoutCleanup);
  });

  it("is 0 for a free server", () => {
    expect(
      worstCaseDeployCost({ ...args, hourlyUsd: 0, egressUsdPerGb: 0 }),
    ).toBe(0);
  });

  it("throws on a negative or missing number", () => {
    expect(() => worstCaseDeployCost({ ...args, hourlyUsd: -1 })).toThrow(
      "hourlyUsd",
    );
    expect(() =>
      worstCaseDeployCost({ ...args, egressUsdPerGb: Number.NaN }),
    ).toThrow("egressUsdPerGb");
  });
});

describe("checkDeployCost", () => {
  it("allows a deployment within the limit", () => {
    const result = checkDeployCost({ ...args, limitUsd: 1 });
    expect(result.ok).toBe(true);
    expect(result.message).toBe(
      "This deployment costs at most $0.29, within the limit of $1.00.",
    );
  });

  it("allows a deployment exactly at the limit", () => {
    expect(
      checkDeployCost({ ...args, maxEgressMbit: 0, limitUsd: 0.2 }).ok,
    ).toBe(true);
  });

  it("refuses a deployment above the limit", () => {
    const result = checkDeployCost({
      ...args,
      lifetimeMinutes: 1440,
      limitUsd: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.costUsd).toBeGreaterThan(1);
    expect(result.message).toMatch(/^This deployment could cost up to \$/);
  });

  it("throws on a negative limit", () => {
    expect(() => checkDeployCost({ ...args, limitUsd: -1 })).toThrow(
      "limitUsd",
    );
  });
});
