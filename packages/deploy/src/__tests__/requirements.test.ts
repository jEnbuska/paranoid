import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import requirements, { valueProblem } from "../requirements.ts";

const root = new URL("../../../../", import.meta.url).pathname;

function provider(json: Record<string, unknown>) {
  return requirements(
    "provider",
    {
      guide: "docs/deploy/test.md",
      environments: { test: { reviewers: "required", step: "#4-env" } },
      ...json,
    },
    { shared: false },
  );
}

describe("requirements", () => {
  it("reads the shared file in the repository", () => {
    const path = join(root, "deploy/requirements.json");
    const shared = requirements(
      "deploy/requirements.json",
      JSON.parse(readFileSync(path, "utf8")),
      { shared: true },
    );
    expect([...shared.variables.keys()]).toEqual([
      "MAX_INVITES",
      "LIFETIME_MINUTES",
      "MAX_EGRESS_MBIT",
      "MAX_DEPLOY_COST_USD",
    ]);
  });

  it("reads every provider's file in the repository", () => {
    const deploy = join(root, "deploy");
    for (const name of readdirSync(deploy)) {
      const path = join(deploy, name, "requirements.json");
      if (!existsSync(path)) continue;
      // A provider's list can land before its guide does, so the guide
      // isn't required to exist yet.
      expect(() =>
        requirements(path, JSON.parse(readFileSync(path, "utf8")), {
          shared: false,
        }),
      ).not.toThrow();
    }
  });

  it("refuses a misspelled key, so no check is skipped by mistake", () => {
    expect(() =>
      provider({
        variables: { TEST_REGION: { requird: true, step: "#5-connect" } },
      }),
    ).toThrow('provider.variables.TEST_REGION: unknown key "requird"');
  });

  it("refuses an example for a secret", () => {
    expect(() =>
      provider({
        environments: {
          test: {
            reviewers: "required",
            step: "#4-env",
            secrets: { TEST_TOKEN: { example: "x", step: "#3-token" } },
          },
        },
      }),
    ).toThrow('unknown key "example"');
  });

  it("refuses an unanchored pattern, and an example that breaks its rule", () => {
    expect(() =>
      provider({ variables: { TEST_ZONE: { pattern: "[a-z]+", step: "#6" } } }),
    ).toThrow("TEST_ZONE.pattern");
    expect(() =>
      provider({
        variables: {
          TEST_ZONE: { pattern: "^[a-z]+$", example: "Zone 1", step: "#6" },
        },
      }),
    ).toThrow("TEST_ZONE.example: isn't allowed");
  });

  it("refuses names GitHub or the preflight use", () => {
    expect(() =>
      provider({ variables: { GITHUB_TOKEN: { step: "#5" } } }),
    ).toThrow("GITHUB_TOKEN");
  });

  it("refuses a repository variable for an environment it doesn't list", () => {
    expect(() =>
      provider({
        variables: { TEST_ROLE: { environments: ["prod"], step: "#5" } },
      }),
    ).toThrow("\"prod\" isn't one of this file's environments");
  });

  it("refuses environments in the shared file", () => {
    expect(() =>
      requirements(
        "shared",
        { guide: "docs/deploy/README.md", environments: {} },
        { shared: true },
      ),
    ).toThrow('unknown key "environments"');
  });

  it("checks numbers against their range", () => {
    const rule = { required: false, minimum: 1, maximum: 50, step: "#x" };
    expect(valueProblem(rule, "50")).toBeUndefined();
    expect(valueProblem(rule, "51")).toBe("isn't from 1 to 50");
    expect(valueProblem(rule, "two")).toBe("isn't a number");
    expect(valueProblem({ ...rule, maximum: undefined }, "0")).toBe(
      "is less than 1",
    );
  });
});
