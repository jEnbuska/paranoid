// Runs the preflight CLI against deploy/upcloud/requirements.json, from the
// repository root as the composite action runs it, with a fake GitHub API on
// localhost.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cli = new URL("../preflight-cli.ts", import.meta.url).pathname;
const root = new URL("../../../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "upcloud-preflight-"));

type Rule = { required?: boolean; pattern?: string };
const list = JSON.parse(
  readFileSync(join(root, "deploy/upcloud/requirements.json"), "utf8"),
) as {
  environments: Record<string, { secrets?: Record<string, Rule> }>;
  variables?: Record<
    string,
    Rule & { environments?: string[]; example?: string }
  >;
};

// Low entropy and shorter than a real token, so the secret scan's UpCloud
// rules don't take it for one.
const FAKE = "ucat_qqqqrrrr";

/** What the fake API answers, by path; anything else is a 404 */
let routes: Record<string, unknown> = {};
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

const repo = "/repos/owner/paranoid";

function environment(name: string, reviewers: boolean) {
  return {
    [`${repo}/environments/${name}`]: {
      protection_rules: [
        ...(reviewers
          ? [
              {
                type: "required_reviewers",
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
    },
    [`${repo}/environments/${name}/deployment-branch-policies?per_page=100`]: {
      total_count: 1,
      branch_policies: [{ name: "main", type: "branch" }],
    },
  };
}

const setUp = {
  [`${repo}/collaborators/owner/permission`]: { permission: "admin" },
  ...environment("upcloud", true),
  ...environment("upcloud-cleanup", false),
};

const variables = {
  UPCLOUD_ZONE: "de-fra1",
  UPCLOUD_PLAN: "STARTER-1xCPU-2GB",
  UPCLOUD_TEMPLATE: "Debian GNU/Linux 13 (Trixie)",
};

function run(
  name: string,
  env: Record<string, string | undefined>,
): Promise<{ status: number | null; output: string }> {
  writeFileSync(join(dir, "summary"), "");
  const child = spawn(
    process.execPath,
    [
      cli,
      "--provider",
      "upcloud",
      "--environment",
      name,
      "--in-environment",
      "true",
      "--owner-only",
      name === "upcloud" ? "true" : "false",
    ],
    {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        GITHUB_API_URL: api,
        GITHUB_REPOSITORY: "owner/paranoid",
        GITHUB_TOKEN: "<test-token>",
        GITHUB_ACTOR: "owner",
        GITHUB_STEP_SUMMARY: join(dir, "summary"),
        PREFLIGHT_VARS: JSON.stringify(variables),
        UPCLOUD_TOKEN: FAKE,
        ...env,
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

/** The ::error:: lines, without their links */
const errors = (output: string) =>
  output
    .trim()
    .split("\n")
    .map((line) => line.replace(/ Fix: .*/, ""));

describe("deploy/upcloud/requirements.json", () => {
  it("lists the environments, secrets and variables PR #88 uses", () => {
    expect(Object.keys(list.environments)).toEqual([
      "upcloud",
      "upcloud-cleanup",
    ]);
    for (const { secrets } of Object.values(list.environments)) {
      expect(Object.keys(secrets ?? {})).toEqual(["UPCLOUD_TOKEN"]);
    }
    expect(Object.keys(list.variables ?? {})).toEqual([
      "UPCLOUD_ZONE",
      "UPCLOUD_PLAN",
      "UPCLOUD_TEMPLATE",
    ]);
  });

  for (const name of ["upcloud", "upcloud-cleanup"]) {
    it(`passes in ${name} when everything is set, without printing the token`, async () => {
      routes = setUp;
      const result = await run(name, {});
      expect(result.output).toContain("The preflight for upcloud passed");
      expect(result.status).toBe(0);
      expect(result.output).not.toContain("qqqq");
    });
  }

  it("passes with the optional variables unset", async () => {
    routes = setUp;
    const result = await run("upcloud", { PREFLIGHT_VARS: "{}" });
    expect(result.status).toBe(0);
  });

  // Every required item, read from the file, so one added later is tested too
  for (const name of Object.keys(list.environments)) {
    it(`fails naming the environment ${name} when it's missing`, async () => {
      const gone = `${repo}/environments/${name}`;
      routes = Object.fromEntries(
        Object.entries(setUp).filter(
          ([path]) => path !== gone && !path.startsWith(`${gone}/`),
        ),
      );
      for (const job of Object.keys(list.environments)) {
        const result = await run(job, {});
        expect(result.status).toBe(1);
        expect(errors(result.output)).toEqual([
          `::error::The environment ${name} doesn't exist.`,
        ]);
      }
    });
  }

  for (const [name, { secrets = {} }] of Object.entries(list.environments)) {
    for (const [secret, rule] of Object.entries(secrets)) {
      if (!rule.required) continue;
      it(`fails naming ${secret} when it isn't set in ${name}`, async () => {
        routes = setUp;
        const result = await run(name, { [secret]: "" });
        expect(result.status).toBe(1);
        expect(errors(result.output)).toEqual([
          `::error::The secret ${secret} isn't set in the environment ${name}.`,
        ]);
      });
    }
  }

  for (const [variable, rule] of Object.entries(list.variables ?? {})) {
    if (!rule.required) continue;
    it(`fails naming ${variable} when it isn't set`, async () => {
      routes = setUp;
      const { [variable]: _, ...rest } = variables as Record<string, string>;
      const result = await run(rule.environments?.[0] ?? "upcloud", {
        PREFLIGHT_VARS: JSON.stringify(rest),
      });
      expect(result.status).toBe(1);
      expect(errors(result.output)).toEqual([
        `::error::The variable ${variable} isn't set in the repository.`,
      ]);
    });
  }

  for (const name of Object.keys(list.environments)) {
    it(`fails naming UPCLOUD_TOKEN when it isn't an UpCloud token in ${name}`, async () => {
      routes = setUp;
      const result = await run(name, { UPCLOUD_TOKEN: "qqqqrrrr" });
      expect(result.status).toBe(1);
      expect(errors(result.output)).toEqual([
        `::error::The secret UPCLOUD_TOKEN in the environment ${name} doesn't match ^ucat_[A-Za-z0-9]+$. Copy it again, whole.`,
      ]);
      expect(result.output).not.toContain("qqqq");
    });
  }

  it.each([
    ["UPCLOUD_ZONE", "Helsinki"],
    ["UPCLOUD_PLAN", "1 CPU; rm -rf /"],
    ["UPCLOUD_TEMPLATE", "Debian\nrm -rf /"],
  ])(
    "fails naming %s when it doesn't match its pattern",
    async (name, value) => {
      routes = setUp;
      const result = await run("upcloud", {
        PREFLIGHT_VARS: JSON.stringify({ ...variables, [name]: value }),
      });
      expect(result.status).toBe(1);
      const rule = list.variables?.[name];
      expect(errors(result.output)).toEqual([
        `::error::The variable ${name} in the repository is ${JSON.stringify(value)}, ` +
          `which doesn't match ${rule?.pattern}. For example: ${JSON.stringify(rule?.example)}.`,
      ]);
    },
  );

  it("doesn't check the deploy's variables in the cleanup environment", async () => {
    routes = setUp;
    const result = await run("upcloud-cleanup", {
      PREFLIGHT_VARS: JSON.stringify({ UPCLOUD_ZONE: "Helsinki" }),
    });
    expect(result.status).toBe(0);
  });
});
