// Runs the preflight CLI against a fake GitHub API on localhost, with a
// throwaway provider list, as the composite action runs it.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cli = new URL("../preflight-cli.ts", import.meta.url).pathname;
const root = new URL("../../../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "deploy-preflight-"));
mkdirSync(join(dir, "deploy/test"), { recursive: true });
writeFileSync(
  join(dir, "deploy/requirements.json"),
  readFileSync(join(root, "deploy/requirements.json")),
);
writeFileSync(
  join(dir, "deploy/test/requirements.json"),
  JSON.stringify({
    guide: "docs/deploy/test.md",
    environments: {
      test: {
        reviewers: "required",
        step: "#4-environments",
        secrets: {
          TEST_TOKEN: {
            required: true,
            pattern: "^tok_[a-z0-9]{8}$",
            step: "#3-token",
          },
        },
      },
      "test-cleanup": { reviewers: "none", step: "#4-environments" },
    },
    variables: { TEST_REGION: { required: true, step: "#5-variables" } },
  }),
);

const FAKE = "tok_qqqqrrrr";

/** What the fake API answers, by path; anything else is a 404 */
let routes: Record<string, unknown> = {};
const requests: { url: string; authorization?: string }[] = [];
let server: Server;
let api = "";

beforeAll(async () => {
  server = createServer((request, response) => {
    requests.push({
      url: request.url ?? "",
      authorization: request.headers.authorization,
    });
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

const repo = "/repos/owner/paranoid";
const environment = (reviewers: number) => ({
  protection_rules: [
    ...(reviewers
      ? [
          {
            type: "required_reviewers",
            prevent_self_review: false,
            reviewers: [{ type: "User", reviewer: { login: "owner" } }],
          },
        ]
      : []),
    { type: "branch_policy" },
  ],
  deployment_branch_policy: {
    protected_branches: false,
    custom_branch_policies: true,
  },
});
const mainOnly = {
  total_count: 1,
  branch_policies: [{ name: "main", type: "branch" }],
};
const setUp = {
  [`${repo}/collaborators/owner/permission`]: { permission: "admin" },
  [`${repo}/environments/test`]: environment(1),
  [`${repo}/environments/test/deployment-branch-policies?per_page=100`]:
    mainOnly,
  [`${repo}/environments/test-cleanup`]: environment(0),
  [`${repo}/environments/test-cleanup/deployment-branch-policies?per_page=100`]:
    mainOnly,
};

function run(
  args: string[],
  env: Record<string, string | undefined>,
): Promise<{ status: number | null; output: string; summary: string }> {
  const summary = join(dir, `summary-${Math.random()}`);
  writeFileSync(summary, "");
  const child = spawn(process.execPath, [cli, ...args], {
    cwd: dir,
    env: {
      PATH: process.env.PATH,
      GITHUB_API_URL: api,
      GITHUB_REPOSITORY: "owner/paranoid",
      GITHUB_TOKEN: "<test-token>",
      GITHUB_ACTOR: "owner",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_SHA: "abc123",
      GITHUB_STEP_SUMMARY: summary,
      ...env,
    },
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  return new Promise((resolve) =>
    child.on("close", (status) =>
      resolve({ status, output, summary: readFileSync(summary, "utf8") }),
    ),
  );
}

const deploy = [
  "--provider",
  "test",
  "--environment",
  "test",
  "--in-environment",
  "true",
  "--owner-only",
  "true",
];

describe("preflight-cli", () => {
  it("passes when everything is set up, without printing the secret", async () => {
    routes = setUp;
    const result = await run(deploy, {
      PREFLIGHT_VARS: JSON.stringify({ TEST_REGION: "north" }),
      TEST_TOKEN: FAKE,
    });
    expect(result.output).toContain(
      "The preflight for test passed: owner may deploy",
    );
    expect(result.status).toBe(0);
    expect(result.output).not.toContain("qqqq");
    expect(requests.at(-1)?.authorization).toBe("Bearer <test-token>");
  });

  it("fails on a missing variable, with a link to its guide step", async () => {
    routes = setUp;
    const result = await run(deploy, {
      PREFLIGHT_VARS: JSON.stringify({ MAX_INVITES: "5" }),
      TEST_TOKEN: FAKE,
    });
    expect(result.status).toBe(1);
    expect(result.output).toBe(
      "::error::The variable TEST_REGION isn't set in the repository. Fix: https://github.com/owner/paranoid/blob/abc123/docs/deploy/test.md#5-variables\n",
    );
    expect(result.summary).toContain("found 1 problem");
  });

  it("lists everything wrong at once, and never a part of the secret", async () => {
    routes = {
      [`${repo}/collaborators/helper/permission`]: { permission: "write" },
      [`${repo}/environments/test`]: {
        ...environment(0),
        deployment_branch_policy: null,
      },
    };
    const result = await run(deploy, {
      GITHUB_ACTOR: "helper",
      PREFLIGHT_VARS: JSON.stringify({ MAX_EGRESS_MBIT: "100" }),
      TEST_TOKEN: `${FAKE}x`,
    });
    expect(result.status).toBe(1);
    const lines = result.output.trim().split("\n");
    expect(lines.map((line) => line.replace(/ Fix: .*/, ""))).toEqual([
      "::error::helper started this run, but only someone with admin permission on the repository may (helper has write permission).",
      "::error::The environment test can be used from every branch. Limit it to the main branch only.",
      "::error::The environment test has no required reviewers. Add yourself, so every run waits for your approval.",
      "::error::The environment test-cleanup doesn't exist.",
      "::error::The variable TEST_REGION isn't set in the repository.",
      "::error::The secret TEST_TOKEN in the environment test doesn't match ^tok_[a-z0-9]{8}$. Copy it again, whole.",
      '::error::The variable MAX_EGRESS_MBIT is "100", which isn\'t from 1 to 50. For example: "2".',
    ]);
    for (const text of [result.output, result.summary]) {
      for (const part of ["qqqq", "rrrr", "tok_q", "13 characters"]) {
        expect(text).not.toContain(part);
      }
    }
  });

  it("checks only the settings outside the environment's job", async () => {
    routes = setUp;
    const result = await run(
      [
        "--provider",
        "test",
        "--environment",
        "test",
        "--in-environment",
        "false",
        "--owner-only",
        "true",
      ],
      { PREFLIGHT_VARS: JSON.stringify({ TEST_REGION: "north" }) },
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain("and so are the repository variables.");
  });

  it("says which permission the job needs when the API refuses", async () => {
    routes = {};
    const server403 = createServer((_, response) => {
      response.writeHead(403).end("{}");
    });
    await new Promise<void>((resolve) =>
      server403.listen(0, "127.0.0.1", resolve),
    );
    const address = server403.address();
    if (typeof address !== "object" || !address) throw new Error("no address");
    const result = await run(deploy, {
      GITHUB_API_URL: `http://127.0.0.1:${address.port}`,
      PREFLIGHT_VARS: "{}",
      TEST_TOKEN: FAKE,
    });
    server403.close();
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "The job needs `permissions: actions: read`",
    );
  });
});
