import deploymentPrices from "../prices.ts";

const file = {
  checked: "2026-11-20",
  cleanupDelayMinutes: 60,
  regions: {
    "eu-test-1": {
      name: "Test",
      servers: { small: 0.01, large: 0.02 },
      items: [
        { name: "public IPv4 address", usdPerHour: 0.005 },
        { name: "monthly disk", usdPerMonth: 7.3 },
        {
          name: "10 GiB disk",
          usdPerGibHour: 0.0001,
          gib: 10,
          billedWhileStopped: true,
        },
        {
          name: "address while stopped",
          usdPerHour: 0.004,
          billedWhileStopped: false,
        },
        { name: "setup", usdPerDeployment: 0.02 },
      ],
      egress: { usdPerGb: 0.09 },
    },
  },
};

describe("deploymentPrices", () => {
  it("adds up the hourly items, the server first", () => {
    const prices = deploymentPrices(file, "eu-test-1", "small");
    expect(prices.checked).toBe("2026-11-20");
    expect(prices.regionName).toBe("Test");
    expect(prices.lines.map((line) => line.name)).toEqual([
      "small",
      "public IPv4 address",
      "monthly disk",
      "10 GiB disk",
      "address while stopped",
    ]);
    // A month is 730 hours, and a disk per GiB-hour is times its size
    expect(prices.lines[2].runningUsdPerHour).toBeCloseTo(0.01);
    expect(prices.lines[3].runningUsdPerHour).toBeCloseTo(0.001);
    expect(prices.hourlyUsd).toBeCloseTo(0.01 + 0.005 + 0.01 + 0.001 + 0.004);
    expect(prices.fixedUsd).toEqual({ setup: 0.02 });
    expect(prices.cleanupDelayHours).toBe(1);
    expect(prices.wholeHours).toBe(true);
  });

  it("bills what's billed while stopped", () => {
    const prices = deploymentPrices(file, "eu-test-1", "small");
    expect(prices.stoppedHourlyUsd).toBeCloseTo(0.01 + 0.005 + 0.01 + 0.001);
    // GCP: only the disk while stopped
    const gcp = deploymentPrices(
      {
        ...file,
        regions: {
          "eu-test-1": {
            ...file.regions["eu-test-1"],
            serverBilledWhileStopped: false,
            items: [
              { name: "IPv4", usdPerHour: 0.005, billedWhileStopped: false },
              { name: "disk", usdPerGibHour: 0.00006, gib: 10 },
            ],
          },
        },
      },
      "eu-test-1",
      "small",
    );
    expect(gcp.stoppedHourlyUsd).toBeCloseTo(0.0006);
  });

  it("converts a price per GiB to a price per GB", () => {
    const prices = deploymentPrices(
      {
        ...file,
        regions: {
          "eu-test-1": {
            ...file.regions["eu-test-1"],
            egress: { usdPerGib: 0.085 },
          },
        },
      },
      "eu-test-1",
      "small",
    );
    expect(prices.egressUsdPerGb).toBeCloseTo(0.085 / 1.073741824, 10);
  });

  it("fails closed on a missing region or server type", () => {
    expect(() => deploymentPrices(file, "us-test-1", "small")).toThrow(
      "has no prices for us-test-1. It has eu-test-1.",
    );
    expect(() => deploymentPrices(file, "eu-test-1", "huge")).toThrow(
      "has no price for huge. It has small, large.",
    );
  });

  it("fails closed on anything malformed", () => {
    const region = file.regions["eu-test-1"];
    const withRegion = (changes: object) => ({
      ...file,
      regions: { "eu-test-1": { ...region, ...changes } },
    });
    const cases: [unknown, string][] = [
      [{ ...file, checked: "today" }, "checked"],
      [{ ...file, extra: 1 }, 'unknown key "extra"'],
      [withRegion({ egress: undefined }), "egress"],
      [
        withRegion({ egress: { usdPerGb: 0.09, usdPerGib: 0.09 } }),
        "exactly one",
      ],
      [withRegion({ items: [{ name: "x" }] }), "exactly one of"],
      [
        withRegion({ items: [{ name: "x", usdPerHour: 1, usdPerMonth: 1 }] }),
        "exactly one of",
      ],
      [withRegion({ items: [{ name: "x", usdPerGibHour: 1 }] }), "gib"],
      [
        withRegion({ items: [{ name: "x", usdPerHour: 1, gib: 1 }] }),
        '"gib" goes only',
      ],
      [withRegion({ items: [{ name: "x", usdPerHour: -1 }] }), "at least 0"],
      [
        withRegion({ items: [{ name: "x", usdPrHour: 1 }] }),
        'unknown key "usdPrHour"',
      ],
      [withRegion({ servers: { small: "0.01" } }), "at least 0"],
    ];
    for (const [bad, message] of cases) {
      expect(() => deploymentPrices(bad, "eu-test-1", "small")).toThrow(
        message,
      );
    }
  });
});
