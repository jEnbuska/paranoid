// Runs the preflight CLI against deploy/azure/requirements.json, from the
// repository root as the composite action does, with a fake GitHub API on
// localhost. The names are the ones deploy-azure.yml, stop-azure.yml and
// cleanup-azure.yml read, and docs/deploy/azure.md lists.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rule } from "../requirements.ts";
import requirements from "../requirements.ts";

const cli = new URL("../preflight-cli.ts", import.meta.url).pathname;
const root = new URL("../../../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "azure-preflight-"));
const guide =
  "https://github.com/owner/paranoid/blob/abc123/docs/deploy/azure.md";

// Azure's IDs are GUIDs, not secrets. Low-entropy fakes, so nothing here
// looks like a real one.
const id = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;

/** Every Azure variable, set to an allowed value */
const ALL: Record<string, string> = {
  AZURE_CLIENT_ID: id(1),
  AZURE_CLEANUP_CLIENT_ID: id(2),
  AZURE_TENANT_ID: id(3),
  AZURE_SUBSCRIPTION_ID: id(4),
  AZURE_RESOURCE_GROUP: "paranoid",
  AZURE_REGION: "swedencentral",
  AZURE_VM_SIZE: "Standard_B2ats_v2",
  AZURE_IMAGE: "Debian:debian-13:13-gen2:latest",
};

const repo = "/repos/owner/paranoid";
const environment = (reviewers: number) => ({
  protection_rules: reviewers
    ? [
        {
          type: "required_reviewers",
          reviewers: [{ type: "User", reviewer: { login: "owner" } }],
        },
      ]
    : [],
  deployment_branch_policy: {
    protected_branches: false,
    custom_branch_policies: true,
  },
});
const mainOnly = { total_count: 1, branch_policies: [{ name: "main" }] };
const setUp: Record<string, unknown> = {
  [`${repo}/collaborators/owner/permission`]: { permission: "admin" },
  [`${repo}/environments/azure`]: environment(1),
  [`${repo}/environments/azure/deployment-branch-policies?per_page=100`]:
    mainOnly,
  [`${repo}/environments/azure-cleanup`]: environment(0),
  [`${repo}/environments/azure-cleanup/deployment-branch-policies?per_page=100`]:
    mainOnly,
};

/** What the fake API answers, by path; anything else is a 404 */
let routes = setUp;
let server: Server;
let api = "";

beforeAll(async () => {
  server = createServer((request, response) => {
    const body = routes[request.url ?? ""];
    response.writeHead(body === undefined ? 404 : 200, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify(body ?? { message: "Not Found" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address !== "object" || !address) throw new Error("no address");
  api = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server.close();
});

/** The jobs PR #93's workflows run the preflight in */
const JOBS = {
  "deploy-azure.yml, before the approval": {
    environment: "azure",
    inEnvironment: "false",
    ownerOnly: "true",
  },
  "deploy-azure.yml, in the azure environment": {
    environment: "azure",
    inEnvironment: "true",
    ownerOnly: "true",
  },
  "stop-azure.yml": {
    environment: "azure-cleanup",
    inEnvironment: "true",
    ownerOnly: "true",
  },
  "cleanup-azure.yml": {
    environment: "azure-cleanup",
    inEnvironment: "true",
    ownerOnly: "false",
  },
};
type Job = (typeof JOBS)[keyof typeof JOBS];

function run(
  job: Job,
  vars: Record<string, string>,
): Promise<{ status: number | null; output: string }> {
  const summary = join(dir, `summary-${Math.random()}`);
  writeFileSync(summary, "");
  const child = spawn(
    process.execPath,
    [
      cli,
      "--provider",
      "azure",
      "--environment",
      job.environment,
      "--in-environment",
      job.inEnvironment,
      "--owner-only",
      job.ownerOnly,
    ],
    {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        GITHUB_API_URL: api,
        GITHUB_REPOSITORY: "owner/paranoid",
        GITHUB_TOKEN: "<test-token>",
        GITHUB_ACTOR: "owner",
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_SHA: "abc123",
        GITHUB_STEP_SUMMARY: summary,
        PREFLIGHT_VARS: JSON.stringify(vars),
      },
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  return new Promise((resolve) =>
    child.on("close", (status) => resolve({ status, output })),
  );
}

// Whether a variable is a repository variable or an environment's own is
// read from the file, so moving one only changes the file. What each
// environment's jobs read is fixed below, by PR #93's workflows.
const path = join(root, "deploy/azure/requirements.json");
const azure = requirements(path, JSON.parse(readFileSync(path, "utf8")), {
  shared: false,
});

/** The variables each environment's jobs read in PR #93's workflows */
const READS = {
  azure: [
    "AZURE_CLIENT_ID",
    "AZURE_TENANT_ID",
    "AZURE_SUBSCRIPTION_ID",
    "AZURE_RESOURCE_GROUP",
    "AZURE_REGION",
    "AZURE_VM_SIZE",
    "AZURE_IMAGE",
  ],
  "azure-cleanup": [
    "AZURE_CLEANUP_CLIENT_ID",
    "AZURE_TENANT_ID",
    "AZURE_SUBSCRIPTION_ID",
    "AZURE_RESOURCE_GROUP",
  ],
};

/** A value each patterned variable must refuse */
const WRONG: Record<string, string> = {
  AZURE_CLIENT_ID: "paranoid-deployer",
  AZURE_CLEANUP_CLIENT_ID: `${id(2)}x`,
  AZURE_TENANT_ID: "contoso.onmicrosoft.com",
  AZURE_SUBSCRIPTION_ID: "Azure subscription 1",
  AZURE_RESOURCE_GROUP: "paranoid;rm -rf",
  AZURE_REGION: "Sweden Central",
  AZURE_VM_SIZE: "B2ats_v2",
  AZURE_IMAGE: "Debian:debian-13",
};

/** The variables the preflight checks in a job, and where it says each is */
function checked(job: Job): Map<string, { rule: Rule; where: string }> {
  const result = new Map<string, { rule: Rule; where: string }>();
  for (const [name, rule] of azure.variables) {
    if (!rule.environments || rule.environments.includes(job.environment)) {
      result.set(name, { rule, where: " in the repository" });
    }
  }
  if (job.inEnvironment === "true") {
    const own = azure.environments.get(job.environment)?.variables ?? [];
    for (const [name, rule] of own) {
      result.set(name, {
        rule,
        where: ` in the environment ${job.environment}`,
      });
    }
  }
  return result;
}

const required = (job: Job) =>
  [...checked(job)].filter(([, { rule }]) => rule.required);

describe("deploy/azure/requirements.json", () => {
  it("lists PR #93's environments and variables, and no secrets", () => {
    expect(azure.guide).toBe("docs/deploy/azure.md");
    expect(
      [...azure.environments].map(([name, { reviewers, step, secrets }]) => [
        name,
        reviewers,
        step,
        secrets.size,
      ]),
    ).toEqual([
      ["azure", "required", "#4-connect-your-fork-to-azure", 0],
      ["azure-cleanup", "none", "#4-connect-your-fork-to-azure", 0],
    ]);
    const names = [
      ...azure.variables.keys(),
      ...[...azure.environments.values()].flatMap(({ variables }) => [
        ...variables.keys(),
      ]),
    ];
    expect([...new Set(names)].toSorted()).toEqual(Object.keys(ALL).toSorted());
  });

  for (const environment of azure.environments.keys()) {
    const job = { environment, inEnvironment: "true", ownerOnly: "true" };

    it(`checks what ${environment}'s jobs read, and nothing else`, () => {
      expect([...checked(job).keys()].toSorted()).toEqual(
        READS[environment as keyof typeof READS].toSorted(),
      );
    });

    for (const [name, { rule, where }] of checked(job)) {
      if (!rule.pattern) continue;
      it(`fails ${environment}'s job on a wrong ${name}, naming it`, async () => {
        expect(WRONG[name]).toBeDefined();
        routes = setUp;
        const result = await run(job, { ...ALL, [name]: WRONG[name] });
        expect(result.status).toBe(1);
        const lines = result.output.trim().split("\n");
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain(
          `::error::The variable ${name}${where} is ${JSON.stringify(WRONG[name])}, which doesn't match `,
        );
        expect(lines[0]).toContain(` Fix: ${guide}${rule.step}`);
      });
    }
  }

  for (const [name, job] of Object.entries(JOBS)) {
    it(`passes ${name} when everything is set`, async () => {
      routes = setUp;
      const result = await run(job, ALL);
      expect(result.output).toContain("The preflight for azure passed");
      expect(result.status).toBe(0);
    });

    it(`passes ${name} with only the required variables, so the defaults apply`, async () => {
      routes = setUp;
      const vars = Object.fromEntries(
        required(job).map(([name]) => [name, ALL[name]]),
      );
      const result = await run(job, vars);
      expect(result.status).toBe(0);
    });

    for (const [missing, { rule, where }] of required(job)) {
      it(`fails ${name} without ${missing}, naming it`, async () => {
        routes = setUp;
        const { [missing]: _, ...vars } = ALL;
        const result = await run(job, vars);
        expect(result.status).toBe(1);
        expect(result.output).toBe(
          `::error::The variable ${missing} isn't set${where}. Fix: ${guide}${rule.step}\n`,
        );
      });
    }
  }

  it("leaves a variable only the deploy reads to the deploy", async () => {
    routes = setUp;
    const result = await run(JOBS["cleanup-azure.yml"], {
      ...ALL,
      AZURE_CLIENT_ID: "",
      AZURE_REGION: "Sweden Central",
    });
    expect(result.status).toBe(0);
  });

  it("fails on a missing environment, naming it", async () => {
    const { [`${repo}/environments/azure-cleanup`]: _, ...rest } = setUp;
    routes = rest;
    const result = await run(
      JOBS["deploy-azure.yml, before the approval"],
      ALL,
    );
    expect(result.status).toBe(1);
    expect(result.output).toBe(
      `::error::The environment azure-cleanup doesn't exist. Fix: ${guide}#4-connect-your-fork-to-azure\n`,
    );
  });

  it("fails when the deploy environment has no required reviewers", async () => {
    routes = { ...setUp, [`${repo}/environments/azure`]: environment(0) };
    const result = await run(
      JOBS["deploy-azure.yml, before the approval"],
      ALL,
    );
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "The environment azure has no required reviewers.",
    );
  });
});
