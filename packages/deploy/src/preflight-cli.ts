// The deploy preflight: checks, before any cloud step, that the run was
// started by someone allowed to and that everything the deployment needs is
// set up. .github/actions/deploy-preflight runs it from the repository root:
//
//   node packages/deploy/src/preflight-cli.ts --provider <provider> \
//     --environment <environment> --in-environment <true|false> \
//     --owner-only <true|false>
//
// It reads deploy/requirements.json and deploy/<provider>/requirements.json
// (see deploy/requirements.schema.json), and from the environment:
//
// - GITHUB_TOKEN, GITHUB_API_URL, GITHUB_REPOSITORY: to read the environments'
//   settings (the token needs `actions: read`) and the actors' permission
//   (`metadata: read`, which every token has).
// - GITHUB_ACTOR and GITHUB_TRIGGERING_ACTOR: who started and re-ran it.
// - PREFLIGHT_VARS: the job's `vars` context as JSON.
// - Each secret the job's environment lists, under its own name.
// - GITHUB_SERVER_URL and GITHUB_SHA, for links to the guides, and
//   GITHUB_STEP_SUMMARY, where it lists the problems too.
//
// It prints every problem with the guide step that fixes it and exits with
// code 1 if there are any. It never prints a secret or any part of one.
import { appendFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { EnvironmentSettings, Observed, Problem } from "./preflight.ts";
import preflight, { ACTION_README, secretNames } from "./preflight.ts";
import requirements from "./requirements.ts";

function fail(message: string): never {
  console.log(`::error::${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    provider: { type: "string" },
    environment: { type: "string" },
    "in-environment": { type: "string" },
    "owner-only": { type: "string" },
  },
  strict: true,
});

function option(name: keyof typeof values, pattern: RegExp): string {
  const value = values[name];
  if (value === undefined || !pattern.test(value)) {
    fail(`--${name} must match ${pattern}, not ${JSON.stringify(value)}`);
  }
  return value;
}

function flag(name: keyof typeof values): boolean {
  return option(name, /^(true|false)$/) === "true";
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) fail(`${name} isn't set. See ${ACTION_README}.`);
  return value;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${path}: ${(error as Error).message}`);
  }
}

const provider = option("provider", /^[a-z0-9][a-z0-9-]{0,39}$/);
const options = {
  environment: option("environment", /^[a-z0-9][a-z0-9-]{0,62}$/),
  inEnvironment: flag("in-environment"),
  ownerOnly: flag("owner-only"),
};
let shared, own;
try {
  shared = requirements(
    "deploy/requirements.json",
    readJson("deploy/requirements.json"),
    { shared: true },
  );
  const path = `deploy/${provider}/requirements.json`;
  own = requirements(path, readJson(path), { shared: false });
} catch (error) {
  fail((error as Error).message);
}

const api = env("GITHUB_API_URL");
const repository = env("GITHUB_REPOSITORY");
const token = env("GITHUB_TOKEN");

/** GETs a path of the repository's API, or null on 404 */
async function get(path: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${api}/repos/${repository}/${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    fail(
      `GitHub's API answered ${response.status} for ${path}` +
        (response.status === 403
          ? ". The job needs `permissions: actions: read`."
          : ".") +
        ` See ${ACTION_README}.`,
    );
  }
  return (await response.json()) as Record<string, unknown>;
}

async function permission(login: string) {
  const answer = await get(
    `collaborators/${encodeURIComponent(login)}/permission`,
  );
  const value = answer?.permission;
  return { login, permission: typeof value === "string" ? value : "none" };
}

type Rule = { type?: string; reviewers?: unknown[] };
type BranchPolicy = {
  protected_branches?: boolean;
  custom_branch_policies?: boolean;
};

async function settings(name: string): Promise<EnvironmentSettings | null> {
  const path = `environments/${encodeURIComponent(name)}`;
  const environment = await get(path);
  if (!environment) return null;
  const rules = (environment.protection_rules ?? []) as Rule[];
  const reviewers = rules
    .filter((rule) => rule.type === "required_reviewers")
    .reduce((sum, rule) => sum + (rule.reviewers?.length ?? 0), 0);
  const policy = environment.deployment_branch_policy as BranchPolicy | null;
  let branches: EnvironmentSettings["branches"] = "all";
  if (policy?.protected_branches) {
    branches = "protected";
  } else if (policy?.custom_branch_policies) {
    const list = await get(`${path}/deployment-branch-policies?per_page=100`);
    const policies = (list?.branch_policies ?? []) as {
      name: string;
      type?: string;
    }[];
    branches = policies.map(({ name, type }) => `${type ?? "branch"} ${name}`);
  }
  return { branches, reviewers };
}

const actors = options.ownerOnly
  ? [
      ...new Set([
        env("GITHUB_ACTOR"),
        process.env.GITHUB_TRIGGERING_ACTOR || env("GITHUB_ACTOR"),
      ]),
    ]
  : [];
let variables: Record<string, string>;
try {
  variables = JSON.parse(env("PREFLIGHT_VARS")) as Record<string, string>;
} catch {
  fail(
    `PREFLIGHT_VARS isn't JSON. Pass \${{ toJSON(vars) }}. See ${ACTION_README}.`,
  );
}

const observed: Observed = {
  actors: await Promise.all(actors.map(permission)),
  environments: new Map(
    await Promise.all(
      [...own.environments.keys()].map(
        async (name) => [name, await settings(name)] as const,
      ),
    ),
  ),
  variables,
  secrets: options.inEnvironment
    ? new Map(
        secretNames(own, options.environment).map((name) => [
          name,
          process.env[name],
        ]),
      )
    : null,
};

const problems = preflight(shared, own, options, observed);

const server = process.env.GITHUB_SERVER_URL;
const sha = process.env.GITHUB_SHA;
const link = ({ fix }: Problem) =>
  server && sha ? `${server}/${repository}/blob/${sha}/${fix}` : fix;
const checked = options.inEnvironment
  ? `the environment ${options.environment}'s variables and secrets`
  : "the repository variables";
const summary = process.env.GITHUB_STEP_SUMMARY;

if (problems.length === 0) {
  console.log(
    `The preflight for ${provider} passed: ` +
      (options.ownerOnly ? `${actors.join(" and ")} may deploy, ` : "") +
      `the environments ${[...own.environments.keys()].join(" and ")} are set up, ` +
      `and so are ${checked}.`,
  );
  process.exit(0);
}

for (const problem of problems) {
  console.log(`::error::${problem.message} Fix: ${link(problem)}`);
}
if (summary) {
  appendFileSync(
    summary,
    [
      `## The ${provider} preflight found ${problems.length} problem${problems.length === 1 ? "" : "s"}`,
      "",
      "Nothing was created or changed. Fix these, then run the workflow again:",
      "",
      ...problems.map(
        (problem) => `- ${problem.message} [Fix](${link(problem)})`,
      ),
      "",
    ].join("\n"),
  );
}
process.exit(1);
