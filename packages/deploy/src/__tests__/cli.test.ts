import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cli = new URL("../cli.ts", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "deploy-cli-"));
const prices = join(dir, "prices.json");
writeFileSync(
  prices,
  JSON.stringify({
    checked: "2026-11-20",
    regions: {
      "eu-test-1": {
        name: "Test",
        servers: { small: 0.0086, medium: 0.03 },
        items: [{ name: "public IPv4 address", usdPerHour: 0.005 }],
        egress: { usdPerGb: 0.09 },
      },
    },
  }),
);

function run(...args: string[]) {
  const githubEnv = join(dir, `env-${Math.random()}`);
  writeFileSync(githubEnv, "");
  const result = spawnSync(
    process.execPath,
    [cli, "--prices", prices, "--region", "eu-test-1", ...args],
    { encoding: "utf8", env: { ...process.env, GITHUB_ENV: githubEnv } },
  );
  return { ...result, githubEnv: readFileSync(githubEnv, "utf8") };
}

describe("cli", () => {
  it("passes a deployment within the limit, and writes its worst case", () => {
    const result = run(
      "--server",
      "small",
      "--lifetime-minutes",
      "60",
      "--egress-mbit",
      "2",
      "--limit-usd",
      "1",
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("- small, running, for 1 h: $0.0086");
    expect(result.stdout).toContain(
      "- public IPv4 address, running, for 1 h: $0.0050",
    );
    expect(result.stdout).toContain("0.90 GB at most");
    expect(result.githubEnv).toBe("WORST_CASE_USD=0.0946\n");
  });

  it("refuses a deployment above the limit", () => {
    const result = run(
      "--server",
      "small",
      "--lifetime-minutes",
      "1440",
      "--egress-mbit",
      "2",
      "--limit-usd",
      "1",
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("::error::The worst case");
    expect(result.stdout).toContain("The longest lifetime that fits is");
  });

  it("refuses a server type without a price", () => {
    const result = run(
      "--server",
      "large",
      "--lifetime-minutes",
      "60",
      "--egress-mbit",
      "2",
      "--limit-usd",
      "1",
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "has no price for large. It has small, medium.",
    );
  });

  describe("with several server types", () => {
    const several = (servers: string, limitUsd: string) =>
      run(
        "--server",
        servers,
        "--lifetime-minutes",
        "60",
        "--egress-mbit",
        "2",
        "--limit-usd",
        limitUsd,
      );

    it("checks each one and writes the highest worst case", () => {
      const result = several("medium,small", "1");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "Worst case for this deployment on small",
      );
      expect(result.stdout).toContain(
        "Worst case for this deployment on medium",
      );
      expect(result.stdout).toContain("- small, running, for 1 h: $0.0086");
      expect(result.stdout).toContain("- medium, running, for 1 h: $0.0300");
      expect(result.stdout).toContain(
        "The highest worst case is medium's, $0.1160.",
      );
      expect(result.githubEnv).toBe("WORST_CASE_USD=0.1160\n");
    });

    it("writes the same whatever the order", () => {
      expect(several("small,medium", "1").githubEnv).toBe(
        "WORST_CASE_USD=0.1160\n",
      );
    });

    it("refuses them if one is above the limit, with a lifetime that fits both", () => {
      // small's worst case for an hour is $0.0946, medium's $0.1160
      const result = several("small,medium", "0.10");
      expect(result.status).toBe(1);
      expect(result.githubEnv).toBe("WORST_CASE_USD=0.1160\n");
      expect(result.stdout).toContain(
        "::error::The worst case, $0.1160 on medium, is more than the limit, $0.10.",
      );
      const fitting =
        /The longest lifetime that fits every server type is (\d+) minutes/.exec(
          result.stdout,
        );
      expect(fitting).not.toBeNull();
      const minutes = Number(fitting?.[1]);
      expect(minutes).toBeGreaterThan(0);
      expect(minutes).toBeLessThan(60);
      expect(several("medium", "0.10").stdout).toContain(
        `The longest lifetime that fits is ${minutes} minutes.`,
      );
    });

    it("refuses one without a price", () => {
      const result = several("small,large", "1");
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("has no price for large.");
      expect(result.githubEnv).toBe("");
    });

    it.each([["small,"], [",small"], ["small,,medium"]])(
      "refuses an empty type in %s",
      (servers) => {
        const result = several(servers, "1");
        expect(result.status).toBe(1);
        expect(result.stdout).toContain(
          "::error::--server must be server types separated by commas",
        );
      },
    );

    it("refuses a type named twice", () => {
      const result = several("small,small", "1");
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        "::error::--server names a server type twice: 'small,small'",
      );
    });
  });
});
