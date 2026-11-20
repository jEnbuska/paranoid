import worstCaseCost from "../worst-case-cost.ts";

const input = {
  lifetimeHours: 1,
  hourlyUsd: 0.0145,
  egressCapMbit: 2,
  egressUsdPerGb: 0.09,
  limitUsd: 1,
};

describe("worstCaseCost", () => {
  it("bills every started hour", () => {
    expect(worstCaseCost(input).billedHours).toBe(1);
    expect(
      worstCaseCost({ ...input, lifetimeHours: 65 / 60 }).billedHours,
    ).toBe(2);
    expect(worstCaseCost({ ...input, lifetimeHours: 0.01 }).billedHours).toBe(
      1,
    );
  });

  it("sends at the cap for the whole lifetime", () => {
    // 2 Mbit/s is 250,000 bytes a second, 0.9 GB an hour
    expect(worstCaseCost(input).egressGb).toBeCloseTo(0.9);
    expect(worstCaseCost({ ...input, lifetimeHours: 24 }).egressGb).toBeCloseTo(
      21.6,
    );
  });

  it("bills the cleanup delay by the hour, without traffic", () => {
    const cost = worstCaseCost({ ...input, cleanupDelayHours: 1 });
    expect(cost.billedHours).toBe(2);
    expect(cost.hourlyCostUsd).toBeCloseTo(0.029);
    expect(cost.egressGb).toBeCloseTo(0.9);
  });

  it("adds up hourly costs, traffic and fixed extras", () => {
    const cost = worstCaseCost({
      ...input,
      fixedUsd: { "static IP": 0.01, setup: 0.02 },
    });
    expect(cost.hourlyCostUsd).toBeCloseTo(0.0145);
    expect(cost.egressCostUsd).toBeCloseTo(0.081);
    expect(cost.fixedCostUsd).toBeCloseTo(0.03);
    expect(cost.totalUsd).toBeCloseTo(0.0145 + 0.081 + 0.03);
  });

  it("compares the total with the limit", () => {
    expect(worstCaseCost(input).withinLimit).toBe(true);
    const day = worstCaseCost({ ...input, lifetimeHours: 24 });
    // 24 h × $0.0145 + 21.6 GB × $0.09
    expect(day.totalUsd).toBeCloseTo(2.292);
    expect(day.withinLimit).toBe(false);
    const { totalUsd } = worstCaseCost(input);
    expect(worstCaseCost({ ...input, limitUsd: totalUsd }).withinLimit).toBe(
      true,
    );
  });

  it("refuses a negative or missing number", () => {
    expect(() => worstCaseCost({ ...input, egressCapMbit: -1 })).toThrow(
      "egressCapMbit",
    );
    expect(() =>
      worstCaseCost({ ...input, egressUsdPerGb: Number.NaN }),
    ).toThrow("egressUsdPerGb");
    expect(() =>
      worstCaseCost({
        ...input,
        fixedUsd: { setup: Number.POSITIVE_INFINITY },
      }),
    ).toThrow('fixedUsd["setup"]');
  });
});
