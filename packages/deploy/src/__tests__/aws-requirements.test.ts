// Runs the preflight CLI against deploy/aws/requirements.json, from the
// repository root as the composite action does, with a fake GitHub API on
// localhost. The names and their placement follow the common deploy pattern
// (#135): the identity values are variables of the aws and aws-cleanup
// environments, and the tuning values are repository variables.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import requirements from "../requirements.ts";

const cli = new URL("../preflight-cli.ts", import.meta.url).pathname;
const root = new URL("../../../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "aws-preflight-"));
const guide =
  "https://github.com/owner/paranoid/blob/abc123/docs/deploy/aws.md";

// AWS's documented example account ID. Role ARNs and security group IDs
// aren't secrets, and AWS signs in with OIDC, so there are no secrets at all.
const arn = (role: string) => `arn:aws:iam::123456789012:role/${role}`;

/** The repository variables, set to allowed values */
const REPOSITORY: Record<string, string> = {
  AWS_REGION: "eu-north-1",
  AWS_INSTANCE_TYPE: "t4g.micro",
};

/** Each environment's own variables, set to allowed values. AWS_ROLE_ARN
 * is in both, with a different role in each. */
const ENVIRONMENT: Record<string, Record<string, string>> = {
  aws: {
    AWS_ROLE_ARN: arn("paranoid-deploy"),
    AWS_SCHEDULER_ROLE_ARN: arn("paranoid-scheduler"),
    AWS_SECURITY_GROUP_ID: "sg-0123456789abcdef0",
  },
  "aws-cleanup": {
    AWS_ROLE_ARN: arn("paranoid-cleanup"),
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
  [`${repo}/environments/aws`]: environment(1),
  [`${repo}/environments/aws/deployment-branch-policies?per_page=100`]:
    mainOnly,
  [`${repo}/environments/aws-cleanup`]: environment(0),
  [`${repo}/environments/aws-cleanup/deployment-branch-policies?per_page=100`]:
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

/** The jobs PR #91's workflows will run the preflight in */
const JOBS = {
  "deploy-aws.yml, before the approval": {
    environment: "aws",
    inEnvironment: "false",
    ownerOnly: "true",
  },
  "deploy-aws.yml, in the aws environment": {
    environment: "aws",
    inEnvironment: "true",
    ownerOnly: "true",
  },
  "stop-aws.yml": {
    environment: "aws-cleanup",
    inEnvironment: "true",
    ownerOnly: "true",
  },
  "cleanup-aws.yml": {
    environment: "aws-cleanup",
    inEnvironment: "true",
    ownerOnly: "false",
  },
};
type Job = (typeof JOBS)[keyof typeof JOBS];

/** The job's `vars` context: the repository's variables, and the
 * environment's own when the job runs in it */
function context(job: Job): Record<string, string> {
  return job.inEnvironment === "true"
    ? { ...REPOSITORY, ...ENVIRONMENT[job.environment] }
    : { ...REPOSITORY };
}

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
      "aws",
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

/** A value each variable must refuse, the environment whose job reads it,
 * and where the variable is set */
const WRONG: [string, string, string, string][] = [
  // The other environment's role, as each role trusts only its environment
  ["AWS_ROLE_ARN", arn("paranoid-cleanup"), "aws", "the environment aws"],
  [
    "AWS_ROLE_ARN",
    arn("paranoid-deploy"),
    "aws-cleanup",
    "the environment aws-cleanup",
  ],
  [
    "AWS_SCHEDULER_ROLE_ARN",
    "paranoid-scheduler",
    "aws",
    "the environment aws",
  ],
  ["AWS_SECURITY_GROUP_ID", "paranoid", "aws", "the environment aws"],
  ["AWS_REGION", "us-east-1", "aws", "the repository"],
  ["AWS_REGION", "us-east-1", "aws-cleanup", "the repository"],
  ["AWS_INSTANCE_TYPE", "t4g.nano", "aws", "the repository"],
];

describe("deploy/aws/requirements.json", () => {
  it("puts the identity values in the environments, the tuning values in the repository, and no secrets", () => {
    const path = join(root, "deploy/aws/requirements.json");
    const aws = requirements(path, JSON.parse(readFileSync(path, "utf8")), {
      shared: false,
    });
    expect(aws.guide).toBe("docs/deploy/aws.md");
    expect(
      [...aws.environments].map(([name, wanted]) => [
        name,
        wanted.reviewers,
        wanted.step,
        [...wanted.variables.keys()],
        [...wanted.secrets.keys()],
      ]),
    ).toEqual([
      [
        "aws",
        "required",
        "#5-connect-your-fork-to-aws",
        Object.keys(ENVIRONMENT.aws),
        [],
      ],
      [
        "aws-cleanup",
        "none",
        "#5-connect-your-fork-to-aws",
        Object.keys(ENVIRONMENT["aws-cleanup"]),
        [],
      ],
    ]);
    expect([...aws.variables.keys()]).toEqual(Object.keys(REPOSITORY));
  });

  for (const [name, job] of Object.entries(JOBS)) {
    it(`passes ${name} when everything is set`, async () => {
      routes = setUp;
      const result = await run(job, context(job));
      expect(result.output).toContain("The preflight for aws passed");
      expect(result.status).toBe(0);
    });

    it(`passes ${name} without the repository variables, so the defaults apply`, async () => {
      routes = setUp;
      const vars =
        job.inEnvironment === "true" ? ENVIRONMENT[job.environment] : {};
      const result = await run(job, vars);
      expect(result.status).toBe(0);
    });

    if (job.inEnvironment !== "true") continue;
    for (const missing of Object.keys(ENVIRONMENT[job.environment])) {
      it(`fails ${name} without ${missing}, naming it`, async () => {
        routes = setUp;
        const { [missing]: _, ...vars } = context(job);
        const result = await run(job, vars);
        expect(result.status).toBe(1);
        expect(result.output).toBe(
          `::error::The variable ${missing} isn't set in the environment ${job.environment}. Fix: ${guide}#5-connect-your-fork-to-aws\n`,
        );
      });
    }
  }

  it("doesn't look for the environment's variables before the approval, where the job can't see them", async () => {
    routes = setUp;
    const job = JOBS["deploy-aws.yml, before the approval"];
    const result = await run(job, context(job));
    expect(result.status).toBe(0);
    expect(result.output).toContain("and so are the repository variables.");
  });

  for (const [name, value, environment, where] of WRONG) {
    it(`fails ${environment}'s job on a wrong ${name} in ${where}, naming it`, async () => {
      routes = setUp;
      const job = { environment, inEnvironment: "true", ownerOnly: "true" };
      const result = await run(job, { ...context(job), [name]: value });
      expect(result.status).toBe(1);
      const lines = result.output.trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(
        new RegExp(
          `^::error::The variable ${name} in ${where} is .*, which doesn't match `,
        ),
      );
    });
  }

  it("leaves the instance type, which only the deploy reads, to the deploy", async () => {
    routes = setUp;
    const job = JOBS["cleanup-aws.yml"];
    const result = await run(job, {
      ...context(job),
      AWS_INSTANCE_TYPE: "t4g.nano",
    });
    expect(result.status).toBe(0);
  });

  it("fails on a missing environment, naming it", async () => {
    const { [`${repo}/environments/aws-cleanup`]: _, ...rest } = setUp;
    routes = rest;
    const job = JOBS["deploy-aws.yml, before the approval"];
    const result = await run(job, context(job));
    expect(result.status).toBe(1);
    expect(result.output).toBe(
      `::error::The environment aws-cleanup doesn't exist. Fix: ${guide}#5-connect-your-fork-to-aws\n`,
    );
  });

  it("fails when the deploy environment has no required reviewers", async () => {
    routes = { ...setUp, [`${repo}/environments/aws`]: environment(0) };
    const job = JOBS["deploy-aws.yml, before the approval"];
    const result = await run(job, context(job));
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "The environment aws has no required reviewers.",
    );
  });

  it("fails when the cleanup environment has required reviewers", async () => {
    routes = { ...setUp, [`${repo}/environments/aws-cleanup`]: environment(1) };
    const job = JOBS["cleanup-aws.yml"];
    const result = await run(job, context(job));
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "The environment aws-cleanup has required reviewers",
    );
  });
});
