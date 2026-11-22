// Runs the preflight CLI against deploy/hetzner/requirements.json, as the
// Hetzner workflows run it, with a fake GitHub API on localhost.
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import requirements from "../requirements.ts";

const cli = new URL("../preflight-cli.ts", import.meta.url).pathname;
const root = new URL("../../../../", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "deploy-hetzner-"));
mkdirSync(join(dir, "deploy/hetzner"), { recursive: true });
for (const path of [
  "deploy/requirements.json",
  "deploy/hetzner/requirements.json",
]) {
  writeFileSync(join(dir, path), readFileSync(join(root, path)));
}
const hetzner = requirements(
  "deploy/hetzner/requirements.json",
  JSON.parse(
    readFileSync(join(root, "deploy/hetzner/requirements.json"), "utf8"),
  ),
  { shared: false },
);

// Low entropy, so the secret scan doesn't take it for a real token
const FAKE = "q".repeat(32) + "r".repeat(32);

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
const mainOnly = {
  total_count: 1,
  branch_policies: [{ name: "main", type: "branch" }],
};
function environmentRoutes(name: string, reviewers: number) {
  return {
    [`${repo}/environments/${name}`]: environment(reviewers),
    [`${repo}/environments/${name}/deployment-branch-policies?per_page=100`]:
      mainOnly,
  };
}
const setUp = {
  [`${repo}/collaborators/owner/permission`]: { permission: "admin" },
  ...environmentRoutes("hetzner", 1),
  ...environmentRoutes("hetzner-cleanup", 0),
};

const vars = {
  HCLOUD_LOCATION: "hel1",
  HCLOUD_SERVER_TYPES: "cx23,cax11,cpx12",
};

function run(
  args: string[],
  env: Record<string, string | undefined>,
): Promise<{ status: number | null; output: string }> {
  const child = spawn(process.execPath, [cli, ...args], {
    cwd: dir,
    env: {
      PATH: process.env.PATH,
      GITHUB_API_URL: api,
      GITHUB_REPOSITORY: "owner/paranoid",
      GITHUB_TOKEN: "<test-token>",
      GITHUB_ACTOR: "owner",
      PREFLIGHT_VARS: JSON.stringify(vars),
      ...env,
    },
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  return new Promise((resolve) =>
    child.on("close", (status) => resolve({ status, output })),
  );
}

/** The preflight as each Hetzner workflow's job runs it */
const jobs = {
  "deploy-hetzner.yml preflight": {
    environment: "hetzner",
    inEnvironment: false,
    ownerOnly: true,
  },
  "deploy-hetzner.yml deploy": {
    environment: "hetzner",
    inEnvironment: true,
    ownerOnly: true,
  },
  "stop-hetzner.yml": {
    environment: "hetzner-cleanup",
    inEnvironment: true,
    ownerOnly: true,
  },
  "cleanup-hetzner.yml": {
    environment: "hetzner-cleanup",
    inEnvironment: true,
    ownerOnly: false,
  },
};
type Job = (typeof jobs)[keyof typeof jobs];

function args({ environment, inEnvironment, ownerOnly }: Job) {
  return [
    "--provider",
    "hetzner",
    "--environment",
    environment,
    "--in-environment",
    String(inEnvironment),
    "--owner-only",
    String(ownerOnly),
  ];
}
const deploy = args(jobs["deploy-hetzner.yml deploy"]);

describe("deploy/hetzner/requirements.json", () => {
  it("lists the environments, secret and variables PR #86 uses", () => {
    expect(hetzner.guide).toBe("docs/deploy/hetzner.md");
    expect(
      Object.fromEntries(
        [...hetzner.environments].map(([name, env]) => [
          name,
          {
            reviewers: env.reviewers,
            variables: [...env.variables.keys()],
            secrets: [...env.secrets.keys()],
          },
        ]),
      ),
    ).toEqual({
      hetzner: {
        reviewers: "required",
        variables: [],
        secrets: ["HCLOUD_TOKEN"],
      },
      "hetzner-cleanup": {
        reviewers: "none",
        variables: [],
        secrets: ["HCLOUD_TOKEN"],
      },
    });
    expect([...hetzner.variables.keys()]).toEqual(Object.keys(vars));
  });

  for (const [name, job] of Object.entries(jobs)) {
    it(`passes in ${name} with everything set`, async () => {
      routes = setUp;
      const result = await run(args(job), { HCLOUD_TOKEN: FAKE });
      expect(result.output).toContain("The preflight for hetzner passed");
      expect(result.status).toBe(0);
      expect(result.output).not.toContain("qqqq");
    });
  }

  it("passes without the optional variables, which have defaults", async () => {
    routes = setUp;
    const result = await run(deploy, {
      HCLOUD_TOKEN: FAKE,
      PREFLIGHT_VARS: "{}",
    });
    expect(result.status).toBe(0);
  });

  for (const name of hetzner.environments.keys()) {
    it(`fails without the environment ${name}, naming it`, async () => {
      routes = { ...setUp };
      delete routes[`${repo}/environments/${name}`];
      const result = await run(deploy, { HCLOUD_TOKEN: FAKE });
      expect(result.status).toBe(1);
      expect(result.output).toBe(
        `::error::The environment ${name} doesn't exist. Fix: docs/deploy/hetzner.md#4-create-the-environments-in-your-fork\n`,
      );
    });

    for (const [secret, rule] of hetzner.environments.get(name)!.secrets) {
      if (!rule.required) continue;
      const job = Object.values(jobs).find(
        (job) => job.environment === name && job.inEnvironment,
      )!;
      it(`fails without ${secret} in ${name}, naming it`, async () => {
        routes = setUp;
        const result = await run(args(job), { [secret]: "" });
        expect(result.status).toBe(1);
        expect(result.output).toBe(
          `::error::The secret ${secret} isn't set in the environment ${name}. Fix: docs/deploy/hetzner.md#5-create-the-api-tokens-and-add-them\n`,
        );
      });
    }
  }

  it("fails on a token that isn't 64 letters and digits, without printing it", async () => {
    routes = setUp;
    for (const token of [FAKE.slice(1), `${FAKE.slice(1)}-`]) {
      const result = await run(deploy, { HCLOUD_TOKEN: token });
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        "::error::The secret HCLOUD_TOKEN in the environment hetzner doesn't match ^[A-Za-z0-9]{64}$. Copy it again, whole.",
      );
      expect(result.output).not.toContain("qqqq");
    }
  });

  it("fails on a location or server types it doesn't accept", async () => {
    routes = setUp;
    const result = await run(deploy, {
      HCLOUD_TOKEN: FAKE,
      PREFLIGHT_VARS: JSON.stringify({
        HCLOUD_LOCATION: "ash",
        HCLOUD_SERVER_TYPES: "cx23 cax11",
      }),
    });
    expect(result.status).toBe(1);
    expect(
      result.output
        .trim()
        .split("\n")
        .map((line) => line.replace(/ Fix: .*/, "")),
    ).toEqual([
      '::error::The variable HCLOUD_LOCATION in the repository is "ash", which doesn\'t match ^(nbg1|fsn1|hel1)$. For example: "nbg1".',
      '::error::The variable HCLOUD_SERVER_TYPES in the repository is "cx23 cax11", which doesn\'t match ^[a-z0-9]{1,20}(,[a-z0-9]{1,20}){0,9}$. For example: "cx23,cax11,cpx12".',
    ]);
  });

  // deploy/hetzner/prices.json comes with the Hetzner deployment (PR #86).
  const prices = join(root, "deploy/hetzner/prices.json");
  it.skipIf(!existsSync(prices))(
    "accepts exactly the locations prices.json has prices for",
    () => {
      const regions = Object.keys(
        (JSON.parse(readFileSync(prices, "utf8")) as { regions: object })
          .regions,
      );
      const pattern = hetzner.variables.get("HCLOUD_LOCATION")!.pattern!;
      for (const region of regions) expect(pattern.test(region)).toBe(true);
      expect(pattern.source).toBe(`^(${regions.join("|")})$`);
    },
  );
});
