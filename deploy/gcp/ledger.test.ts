import { readFileSync } from "node:fs";
import deploymentPrices from "deploy/src/prices.ts";
import { roundUpUsd } from "deploy/src/worst-case-cost.ts";
import { describe, expect, it } from "vitest";
import {
  decide,
  emptyLedger,
  pricing,
  reserve,
  settle,
  spent,
  worstCase,
  type Pricing,
} from "./ledger.ts";

// Round numbers, so the expected values can be worked out by hand
const testPricing: Pricing = {
  pricesChecked: "2026-01-01",
  hourlyUsd: 0.02,
  stoppedHourlyUsd: 0.001,
  egressUsdPerGb: 0.1,
  egressCapMbit: 2,
  wholeHours: false,
  cleanupDelayHours: 0,
  fixedUsd: {},
};
// 2 Mbit/s for an hour is 0.9 GB, so 0.09 at 0.1 per GB
const runningPerHour = 0.02 + 0.09;

const gcpPrices = JSON.parse(
  readFileSync(new URL("prices.json", import.meta.url), "utf8"),
) as unknown;

describe("prices.json", () => {
  for (const region of [
    "europe-north1",
    "europe-west1",
    "us-central1",
    "us-east1",
    "us-west1",
  ]) {
    it(`has valid prices for ${region}`, () => {
      expect(() =>
        deploymentPrices(gcpPrices, region, "e2-micro"),
      ).not.toThrow();
    });
  }

  it("makes the default deployment cost about 9 cents an hour at worst", () => {
    const prices = deploymentPrices(gcpPrices, "europe-north1", "e2-micro");
    // Running: the VM, its address and its disk. Stopped: only the disk.
    expect(prices.hourlyUsd).toBeCloseTo(0.009222195 + 0.005 + 0.00060274, 9);
    expect(prices.stoppedHourlyUsd).toBeCloseTo(0.00060274, 9);
    const cost = worstCase(pricing(prices, 2), 60);
    expect(cost).toBeGreaterThan(0.08);
    expect(cost).toBeLessThan(0.1);
  });

  it("refuses a region without prices", () => {
    expect(() =>
      deploymentPrices(gcpPrices, "mars-north1", "e2-micro"),
    ).toThrow(/no prices for mars-north1/);
  });
});

describe("worstCase", () => {
  it("is the running rate for the whole lifetime, by the second", () => {
    expect(worstCase(testPricing, 60)).toBe(roundUpUsd(runningPerHour));
    expect(worstCase(testPricing, 30)).toBe(roundUpUsd(runningPerHour / 2));
  });

  it("adds the disk until cleanup", () => {
    const withCleanup = { ...testPricing, cleanupDelayHours: 2 };
    expect(worstCase(withCleanup, 60)).toBe(roundUpUsd(runningPerHour + 0.002));
  });
});

describe("decide", () => {
  const hourly = worstCase(testPricing, 60);

  it("lets a deployment that fits start", () => {
    expect(decide(emptyLedger("2026-11"), 5, testPricing, 60)).toEqual({
      fits: true,
      costUsd: hourly,
      spentUsd: 0,
      remainingUsd: 5,
    });
  });

  it("lets a deployment that uses exactly what's left start", () => {
    expect(decide(emptyLedger("2026-11"), hourly, testPricing, 60).fits).toBe(
      true,
    );
  });

  it("refuses one that doesn't fit, and says what lifetime would", () => {
    const ledger = reserve(emptyLedger("2026-11"), "1-1", testPricing, 60);
    const decision = decide(ledger, hourly * 1.5, testPricing, 60);
    expect(decision.fits).toBe(false);
    if (decision.fits) return;
    expect(decision.remainingUsd).toBeCloseTo(hourly / 2, 4);
    expect(decision.fittingMinutes).toBeGreaterThanOrEqual(29);
    expect(decision.fittingMinutes).toBeLessThanOrEqual(30);
    expect(worstCase(testPricing, decision.fittingMinutes)).toBeLessThanOrEqual(
      decision.remainingUsd,
    );
    expect(worstCase(testPricing, decision.fittingMinutes + 1)).toBeGreaterThan(
      decision.remainingUsd,
    );
  });

  it("refuses everything once the limit is used up", () => {
    const ledger = reserve(emptyLedger("2026-11"), "1-1", testPricing, 600);
    expect(decide(ledger, 0.5, testPricing, 1)).toMatchObject({
      fits: false,
      remainingUsd: 0,
      fittingMinutes: 0,
    });
  });
});

describe("reserve", () => {
  it("counts the worst case until the deployment is settled", () => {
    const ledger = reserve(emptyLedger("2026-11"), "1-1", testPricing, 120);
    expect(ledger.deployments["1-1"].reservedUsd).toBe(
      worstCase(testPricing, 120),
    );
    expect(spent(ledger)).toBe(worstCase(testPricing, 120));
  });

  it("doesn't reserve the same deployment twice", () => {
    const ledger = reserve(emptyLedger("2026-11"), "1-1", testPricing, 60);
    expect(() => reserve(ledger, "1-1", testPricing, 60)).toThrow(/already/);
  });

  it("doesn't change the ledger it's given", () => {
    const ledger = emptyLedger("2026-11");
    reserve(ledger, "1-1", testPricing, 60);
    expect(ledger.deployments).toEqual({});
  });
});

describe("settle", () => {
  const reserved = reserve(emptyLedger("2026-11"), "1-1", testPricing, 120);

  it("replaces the reservation with the cost of the time the VM ran", () => {
    const ledger = settle(reserved, "1-1", {
      created: "2026-11-20T10:00:00Z",
      deleted: "2026-11-20T10:30:00Z",
    });
    expect(ledger.deployments["1-1"]).toMatchObject({
      runningHours: 0.5,
      stoppedHours: 0,
      settledUsd: roundUpUsd(runningPerHour / 2),
    });
    expect(spent(ledger)).toBe(roundUpUsd(runningPerHour / 2));
  });

  it("counts only the stopped rate after the VM powered off", () => {
    const ledger = settle(reserved, "1-1", {
      created: "2026-11-20T10:00:00.000-08:00",
      stopped: "2026-11-20T11:00:00.000-08:00",
      deleted: "2026-11-20T21:00:00Z",
    });
    expect(ledger.deployments["1-1"]).toMatchObject({
      runningHours: 1,
      stoppedHours: 2,
      settledUsd: roundUpUsd(runningPerHour + 2 * 0.001),
    });
  });

  it("releases the whole reservation of a VM that was never created", () => {
    const now = "2026-11-20T10:00:00Z";
    expect(spent(settle(reserved, "1-1", { created: now, deleted: now }))).toBe(
      0,
    );
  });

  it("keeps the full worst case counted while a report is missing", () => {
    let ledger = reserve(reserved, "2-1", testPricing, 60);
    ledger = settle(ledger, "2-1", {
      created: "2026-11-20T10:00:00Z",
      deleted: "2026-11-20T10:00:00Z",
    });
    expect(spent(ledger)).toBe(worstCase(testPricing, 120));
  });

  it("uses the prices the deployment was reserved with", () => {
    const ledger = settle(reserved, "1-1", {
      created: "2026-11-20T10:00:00Z",
      deleted: "2026-11-20T11:00:00Z",
    });
    expect(ledger.deployments["1-1"].settledUsd).toBe(
      roundUpUsd(runningPerHour),
    );
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
