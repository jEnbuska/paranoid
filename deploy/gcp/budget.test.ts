import { describe, expect, it } from "vitest";
import {
  decide,
  egressGibPerHour,
  emptyLedger,
  rates,
  reserve,
  roundUp,
  settle,
  spent,
  worstCase,
} from "./budget.ts";
import { prices, type Prices } from "./prices.ts";

// Round numbers, so the expected values can be worked out by hand
const testPrices: Prices = {
  checked: "2026-01-01",
  ipv4PerHour: 0.005,
  egressPerGib: 0.1,
  regions: { "test-region1": { vmPerHour: 0.01, diskPerGibHour: 0.0001 } },
};
const testRates = rates(testPrices, "test-region1", 2, 10);

describe("egressGibPerHour", () => {
  it("converts Mbit/s to GiB an hour", () => {
    // 2 Mbit/s = 250,000 bytes/s = 900,000,000 bytes an hour
    expect(egressGibPerHour(2)).toBeCloseTo(900_000_000 / 2 ** 30, 12);
  });
});

describe("rates", () => {
  it("adds the VM, IPv4, disk and egress at the limit while running", () => {
    const egress = egressGibPerHour(2) * 0.1;
    expect(testRates.runningPerHour).toBeCloseTo(
      0.01 + 0.005 + 0.001 + egress,
      12,
    );
  });

  it("counts only the disk while stopped", () => {
    expect(testRates.stoppedPerHour).toBeCloseTo(0.001, 12);
  });

  it("refuses a region without prices", () => {
    expect(() => rates(testPrices, "mars-north1", 2, 10)).toThrow(
      /no prices for mars-north1/,
    );
  });

  it("has prices for the default region", () => {
    const defaults = rates(prices, "europe-north1", 2, 10);
    // About 9 cents an hour at worst, mostly egress at the limit
    expect(defaults.runningPerHour).toBeGreaterThan(0.08);
    expect(defaults.runningPerHour).toBeLessThan(0.1);
  });
});

describe("worstCase", () => {
  it("is the running rate for the whole lifetime, rounded up", () => {
    expect(worstCase(testRates, 60)).toBe(roundUp(testRates.runningPerHour));
    expect(worstCase(testRates, 30)).toBeGreaterThanOrEqual(
      (testRates.runningPerHour * 30) / 60,
    );
  });

  it("never rounds down", () => {
    expect(roundUp(0.07)).toBe(0.07);
    expect(roundUp(0.070_01)).toBe(0.0701);
    expect(roundUp(0.1 + 0.2)).toBe(0.3);
  });
});

describe("decide", () => {
  const hourly = worstCase(testRates, 60);

  it("lets a deployment that fits start", () => {
    const decision = decide(emptyLedger("2026-11"), 5, testRates, 60);
    expect(decision).toEqual({
      fits: true,
      costUsd: hourly,
      spentUsd: 0,
      remainingUsd: 5,
    });
  });

  it("refuses one that doesn't, and says what lifetime would fit", () => {
    let ledger = emptyLedger("2026-11");
    ledger = reserve(ledger, "1-1", testRates, 60);
    const budget = hourly * 1.5;
    const decision = decide(ledger, budget, testRates, 60);
    expect(decision.fits).toBe(false);
    if (decision.fits) return;
    expect(decision.remainingUsd).toBeCloseTo(budget - hourly, 4);
    // About half an hour is left
    expect(decision.fittingMinutes).toBeGreaterThanOrEqual(29);
    expect(decision.fittingMinutes).toBeLessThanOrEqual(30);
    expect(worstCase(testRates, decision.fittingMinutes)).toBeLessThanOrEqual(
      decision.remainingUsd,
    );
    expect(worstCase(testRates, decision.fittingMinutes + 1)).toBeGreaterThan(
      decision.remainingUsd,
    );
  });

  it("refuses everything once the limit is used up", () => {
    const ledger = reserve(emptyLedger("2026-11"), "1-1", testRates, 600);
    const decision = decide(ledger, 0.5, testRates, 1);
    expect(decision).toMatchObject({ fits: false, fittingMinutes: 0 });
  });

  it("lets a deployment that uses exactly what's left start", () => {
    const decision = decide(emptyLedger("2026-11"), hourly, testRates, 60);
    expect(decision.fits).toBe(true);
  });
});

describe("reserve", () => {
  it("counts the worst case until the deployment is settled", () => {
    const ledger = reserve(emptyLedger("2026-11"), "1-1", testRates, 120);
    expect(ledger.deployments["1-1"].reservedUsd).toBe(
      worstCase(testRates, 120),
    );
    expect(spent(ledger)).toBe(worstCase(testRates, 120));
  });

  it("doesn't reserve the same deployment twice", () => {
    const ledger = reserve(emptyLedger("2026-11"), "1-1", testRates, 60);
    expect(() => reserve(ledger, "1-1", testRates, 60)).toThrow(/already/);
  });

  it("doesn't change the ledger it's given", () => {
    const ledger = emptyLedger("2026-11");
    reserve(ledger, "1-1", testRates, 60);
    expect(ledger.deployments).toEqual({});
  });
});

describe("settle", () => {
  const reserved = reserve(emptyLedger("2026-11"), "1-1", testRates, 120);

  it("replaces the reservation with the cost of the time the VM ran", () => {
    const ledger = settle(reserved, "1-1", {
      created: "2026-11-20T10:00:00Z",
      deleted: "2026-11-20T10:30:00Z",
    });
    expect(ledger.deployments["1-1"]).toMatchObject({
      runningHours: 0.5,
      stoppedHours: 0,
      settledUsd: roundUp(testRates.runningPerHour / 2),
    });
    expect(spent(ledger)).toBe(roundUp(testRates.runningPerHour / 2));
  });

  it("counts only the disk after the VM powered off", () => {
    const ledger = settle(reserved, "1-1", {
      created: "2026-11-20T10:00:00.000-08:00",
      stopped: "2026-11-20T11:00:00.000-08:00",
      deleted: "2026-11-20T21:00:00Z",
    });
    expect(ledger.deployments["1-1"]).toMatchObject({
      runningHours: 1,
      stoppedHours: 2,
      settledUsd: roundUp(
        testRates.runningPerHour + 2 * testRates.stoppedPerHour,
      ),
    });
  });

  it("releases the whole reservation of a VM that was never created", () => {
    const now = "2026-11-20T10:00:00Z";
    const ledger = settle(reserved, "1-1", { created: now, deleted: now });
    expect(spent(ledger)).toBe(0);
  });

  it("keeps the full worst case counted while a report is missing", () => {
    // Two deployments, only one of them settled
    let ledger = reserve(reserved, "2-1", testRates, 60);
    ledger = settle(ledger, "2-1", {
      created: "2026-11-20T10:00:00Z",
      deleted: "2026-11-20T10:00:00Z",
    });
    expect(spent(ledger)).toBe(worstCase(testRates, 120));
  });

  it("never lowers an earlier settlement", () => {
    const first = settle(reserved, "1-1", {
      created: "2026-11-20T10:00:00Z",
      deleted: "2026-11-20T11:00:00Z",
    });
    const second = settle(first, "1-1", {
      created: "2026-11-20T10:00:00Z",
      deleted: "2026-11-20T10:10:00Z",
    });
    expect(spent(second)).toBe(spent(first));
  });

  it("leaves a deployment that isn't in the ledger out", () => {
    const ledger = settle(reserved, "9-1", {
      created: "2026-11-20T10:00:00Z",
      deleted: "2026-11-20T11:00:00Z",
    });
    expect(ledger).toBe(reserved);
  });

  it("refuses a timestamp it can't read", () => {
    expect(() =>
      settle(reserved, "1-1", { created: "yesterday", deleted: "today" }),
    ).toThrow(/Not a timestamp/);
  });
});
