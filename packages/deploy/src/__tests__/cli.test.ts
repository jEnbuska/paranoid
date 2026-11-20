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
        servers: { small: 0.0086 },
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
    expect(result.stdout).toContain("has no price for large. It has small.");
  });
});
