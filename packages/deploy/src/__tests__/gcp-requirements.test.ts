// Runs the preflight CLI against deploy/gcp/requirements.json, from the
// repository root as the composite action does, with a fake GitHub API on
// localhost. The names are the ones deploy-gcp.yml, stop-gcp.yml and
// cleanup-gcp.yml read, and docs/deploy/gcp.md lists. Google Cloud signs in
// with Workload Identity Federation, so there are no secrets.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import requirements from "../requirements.ts";

const cli = new URL("../preflight-cli.ts", import.meta.url).pathname;
const root = new URL("../../../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "gcp-preflight-"));
const guide =
  "https://github.com/owner/paranoid/blob/abc123/docs/deploy/gcp.md";
const settingsStep = `${guide}#6-give-github-the-settings`;

/** The repository variables, set as bootstrap.sh sets them */
const REPOSITORY: Record<string, string> = {
  GCP_PROJECT: "my-project-123",
  GCP_REGION: "europe-north1",
  GCP_ZONE: "europe-north1-a",
  GCP_BUCKET: "my-project-123-paranoid",
  GCP_WORKLOAD_IDENTITY_PROVIDER:
    "projects/123456789012/locations/global/workloadIdentityPools/paranoid-github/providers/github",
};

/** Each environment's own variables */
const ENVIRONMENT: Record<string, Record<string, string>> = {
  gcp: {
    GCP_SERVICE_ACCOUNT:
      "paranoid-deploy@my-project-123.iam.gserviceaccount.com",
    GCP_MONTHLY_BUDGET_USD: "5",
  },
  "gcp-cleanup": {
    GCP_SERVICE_ACCOUNT:
      "paranoid-cleanup@my-project-123.iam.gserviceaccount.com",
  },
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
  [`${repo}/environments/gcp`]: environment(1),
  [`${repo}/environments/gcp/deployment-branch-policies?per_page=100`]:
    mainOnly,
  [`${repo}/environments/gcp-cleanup`]: environment(0),
  [`${repo}/environments/gcp-cleanup/deployment-branch-policies?per_page=100`]:
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

type Job = {
  environment: "gcp" | "gcp-cleanup";
  inEnvironment: "true" | "false";
  ownerOnly: "true" | "false";
};

/** The jobs PR #92's workflows run the preflight in */
const JOBS: Record<string, Job> = {
  "deploy-gcp.yml, before the approval": {
    environment: "gcp",
    inEnvironment: "false",
    ownerOnly: "true",
  },
  "deploy-gcp.yml, in the gcp environment": {
    environment: "gcp",
    inEnvironment: "true",
    ownerOnly: "true",
  },
  "stop-gcp.yml": {
    environment: "gcp-cleanup",
    inEnvironment: "true",
    ownerOnly: "true",
  },
  "cleanup-gcp.yml": {
    environment: "gcp-cleanup",
    inEnvironment: "true",
    ownerOnly: "false",
  },
};

/** The `vars` context the job sees: the environment's own variables only
 * inside the environment's job */
function vars(job: Job): Record<string, string> {
  return {
    ...REPOSITORY,
    ...(job.inEnvironment === "true" ? ENVIRONMENT[job.environment] : {}),
  };
}

function run(
  job: Job,
  variables: Record<string, string>,
): Promise<{ status: number | null; output: string }> {
  const summary = join(dir, `summary-${Math.random()}`);
  writeFileSync(summary, "");
  const child = spawn(
    process.execPath,
    [
      cli,
      "--provider",
      "gcp",
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
        PREFLIGHT_VARS: JSON.stringify(variables),
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

/** Where a required variable is set, as the preflight names it */
function where(name: string, job: Job): string {
  return name in REPOSITORY
    ? "in the repository"
    : `in the environment ${job.environment}`;
}

/** The required variables each job checks */
function required(job: Job): string[] {
  return [
    ...Object.keys(REPOSITORY),
    ...(job.inEnvironment === "true" ? ["GCP_SERVICE_ACCOUNT"] : []),
  ];
}

/** A value each patterned variable must refuse, in the jobs that check it */
const WRONG: [string, string, Job["environment"][]][] = [
  ["GCP_PROJECT", "My Project", ["gcp", "gcp-cleanup"]],
  ["GCP_REGION", "europe-north", ["gcp", "gcp-cleanup"]],
  ["GCP_ZONE", "europe-north1", ["gcp", "gcp-cleanup"]],
  ["GCP_BUCKET", "gs://my-project-123-paranoid", ["gcp", "gcp-cleanup"]],
  [
    "GCP_WORKLOAD_IDENTITY_PROVIDER",
    "paranoid-github/providers/github",
    ["gcp", "gcp-cleanup"],
  ],
  // Each environment acts as its own service account, so the other one's
  // is refused.
  [
    "GCP_SERVICE_ACCOUNT",
    "paranoid-cleanup@my-project-123.iam.gserviceaccount.com",
    ["gcp"],
  ],
  [
    "GCP_SERVICE_ACCOUNT",
    "paranoid-deploy@my-project-123.iam.gserviceaccount.com",
    ["gcp-cleanup"],
  ],
  ["GCP_MONTHLY_BUDGET_USD", "$5", ["gcp"]],
];

describe("deploy/gcp/requirements.json", () => {
  it("lists PR #92's environments and variables, and no secrets", () => {
    const path = join(root, "deploy/gcp/requirements.json");
    const gcp = requirements(path, JSON.parse(readFileSync(path, "utf8")), {
      shared: false,
    });
    expect(gcp.guide).toBe("docs/deploy/gcp.md");
    expect(
      [...gcp.environments].map(([name, settings]) => ({
        name,
        reviewers: settings.reviewers,
        variables: [...settings.variables.keys()],
        secrets: [...settings.secrets.keys()],
      })),
    ).toEqual([
      {
        name: "gcp",
        reviewers: "required",
        variables: Object.keys(ENVIRONMENT.gcp),
        secrets: [],
      },
      {
        name: "gcp-cleanup",
        reviewers: "none",
        variables: Object.keys(ENVIRONMENT["gcp-cleanup"]),
        secrets: [],
      },
    ]);
    expect([...gcp.variables.keys()]).toEqual(Object.keys(REPOSITORY));
    // Every repository variable is read by all three workflows
    for (const rule of gcp.variables.values()) {
      expect(rule.environments).toBeUndefined();
    }
  });

  for (const [name, job] of Object.entries(JOBS)) {
    it(`passes ${name} when everything is set`, async () => {
      routes = setUp;
      const result = await run(job, vars(job));
      expect(result.output).toContain("The preflight for gcp passed");
      expect(result.status).toBe(0);
    });

    it(`passes ${name} without GCP_MONTHLY_BUDGET_USD, so its default applies`, async () => {
      routes = setUp;
      const { GCP_MONTHLY_BUDGET_USD: _, ...rest } = vars(job);
      const result = await run(job, rest);
      expect(result.status).toBe(0);
    });

    for (const missing of required(job)) {
      it(`fails ${name} without ${missing}, naming it`, async () => {
        routes = setUp;
        const { [missing]: _, ...rest } = vars(job);
        const result = await run(job, rest);
        expect(result.status).toBe(1);
        expect(result.output).toBe(
          `::error::The variable ${missing} isn't set ${where(missing, job)}. Fix: ${missing === "GCP_REGION" ? `${guide}#5-run-the-setup-script` : settingsStep}\n`,
        );
      });
    }
  }

  for (const [name, value, environments] of WRONG) {
    for (const environment of environments) {
      it(`fails ${environment}'s job on a wrong ${name}, naming it`, async () => {
        routes = setUp;
        const job: Job = {
          environment,
          inEnvironment: "true",
          ownerOnly: "true",
        };
        const result = await run(job, { ...vars(job), [name]: value });
        expect(result.status).toBe(1);
        const lines = result.output.trim().split("\n");
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain(
          `::error::The variable ${name} ${where(name, job)} is ${JSON.stringify(value)}, which doesn't match `,
        );
      });
    }
  }

  it("fails on a missing environment, naming it", async () => {
    const { [`${repo}/environments/gcp-cleanup`]: _, ...rest } = setUp;
    routes = rest;
    const job = JOBS["deploy-gcp.yml, before the approval"];
    const result = await run(job, vars(job));
    expect(result.status).toBe(1);
    expect(result.output).toBe(
      `::error::The environment gcp-cleanup doesn't exist. Fix: ${settingsStep}\n`,
    );
  });

  it("fails when the cleanup environment has required reviewers", async () => {
    routes = { ...setUp, [`${repo}/environments/gcp-cleanup`]: environment(1) };
    const job = JOBS["cleanup-gcp.yml"];
    const result = await run(job, vars(job));
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "The environment gcp-cleanup has required reviewers",
    );
  });
});
