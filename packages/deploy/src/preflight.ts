// The deploy preflight's checks, given what was read from GitHub. It returns
// every problem at once, each with the guide step that fixes it, so one run
// lists everything to fix. preflight-cli.ts reads GitHub and prints them.
//
// Secrets: only whether each one is set and matches its pattern is looked
// at. No problem mentions a secret's value, its length or any part of it.
import type { Requirements, Rule } from "./requirements.ts";
import { valueProblem } from "./requirements.ts";

/** The only branch a deploy environment may be used from */
const BRANCH = "main";

/** An environment's settings, as GitHub's API reports them */
export type EnvironmentSettings = {
  /** "all": no branch rule; "protected": protected branches only; or the
   * custom rules, such as ["branch main", "tag v*"] */
  branches: "all" | "protected" | string[];
  /** How many required reviewers it has */
  reviewers: number;
};

export type Observed = {
  /** Who started the run and re-ran it, with their permission on the
   * repository ("admin", "write", "read" or "none"). Empty when the owner
   * check is off. */
  actors: { login: string; permission: string }[];
  /** Each environment's settings, or null if it doesn't exist */
  environments: Map<string, EnvironmentSettings | null>;
  /** The variables the job sees: the repository's, and the environment's
   * own when the job runs in it */
  variables: Record<string, string>;
  /** The job's environment's secrets, as passed to the preflight step. A
   * missing one is undefined. Null when the job runs outside the
   * environment, so its secrets can't be seen. */
  secrets: Map<string, string | undefined> | null;
};

export type Options = {
  /** The environment the workflow's job uses */
  environment: string;
  /** Whether the job runs in it, so its own variables and secrets are seen */
  inEnvironment: boolean;
  ownerOnly: boolean;
};

export type Problem = {
  /** What's wrong, naming the setting but never a secret's value */
  message: string;
  /** Where the fix is: a guide and step, such as docs/deploy/aws.md#5-… */
  fix: string;
};

/** Where the preflight's own instructions are, for a workflow that calls it
 * wrongly */
export const ACTION_README = ".github/actions/deploy-preflight/README.md";

function show(value: string): string {
  // JSON quotes and escapes the value, so a variable with a line break can't
  // start a workflow command such as ::add-mask:: in the log.
  return JSON.stringify(value.length > 200 ? `${value.slice(0, 200)}…` : value);
}

function variableProblem(
  name: string,
  where: string,
  rule: Rule,
  value: string | undefined,
): string | undefined {
  if (value === undefined || value === "") {
    return rule.required
      ? `The variable ${name} isn't set${where}.`
      : undefined;
  }
  const problem = valueProblem(rule, value);
  if (!problem) return;
  return (
    `The variable ${name}${where} is ${show(value)}, which ${problem}.` +
    (rule.example ? ` For example: ${show(rule.example)}.` : "")
  );
}

function branchProblem(branches: EnvironmentSettings["branches"]) {
  if (branches === "all") return "can be used from every branch";
  if (branches === "protected") {
    return "can be used from every protected branch, such as dev";
  }
  if (branches.length === 1 && branches[0] === `branch ${BRANCH}`) return;
  if (branches.length === 0) return "has a custom branch rule with no branches";
  return `can be used from ${branches.join(", ")}`;
}

export default function preflight(
  shared: Requirements,
  provider: Requirements,
  options: Options,
  observed: Observed,
): Problem[] {
  const problems: Problem[] = [];
  const at = (guide: string, step: string) => `${guide}${step}`;
  const job = provider.environments.get(options.environment);
  if (!job) {
    return [
      {
        message:
          `The workflow runs the preflight for the environment ` +
          `${options.environment}, which isn't in the provider's ` +
          `requirements.json (${[...provider.environments.keys()].join(", ")}).`,
        fix: ACTION_README,
      },
    ];
  }

  // 1. Who started it
  if (options.ownerOnly) {
    for (const { login, permission } of observed.actors) {
      if (permission !== "admin") {
        problems.push({
          message:
            `${login} started this run, but only someone with admin ` +
            `permission on the repository may (${login} has ` +
            `${permission === "none" ? "no" : permission} permission).`,
          fix: provider.guide,
        });
      }
    }
  }

  // 2. The environments
  for (const [name, wanted] of provider.environments) {
    const fix = at(provider.guide, wanted.step);
    const settings = observed.environments.get(name);
    if (!settings) {
      problems.push({
        message: `The environment ${name} doesn't exist.`,
        fix,
      });
      continue;
    }
    const branches = branchProblem(settings.branches);
    if (branches) {
      problems.push({
        message: `The environment ${name} ${branches}. Limit it to the ${BRANCH} branch only.`,
        fix,
      });
    }
    if (wanted.reviewers === "required" && settings.reviewers === 0) {
      problems.push({
        message: `The environment ${name} has no required reviewers. Add yourself, so every run waits for your approval.`,
        fix,
      });
    }
    if (wanted.reviewers === "none" && settings.reviewers > 0) {
      problems.push({
        message: `The environment ${name} has required reviewers, so scheduled runs would wait for an approval that nobody gives. Remove them.`,
        fix,
      });
    }
  }

  // 3. The job's variables and secrets
  for (const [name, rule] of provider.variables) {
    if (shared.variables.has(name)) {
      problems.push({
        message: `${name} is a shared variable, so the provider's requirements.json mustn't list it.`,
        fix: ACTION_README,
      });
      continue;
    }
    if (rule.environments && !rule.environments.includes(options.environment)) {
      continue;
    }
    const message = variableProblem(
      name,
      " in the repository",
      rule,
      observed.variables[name],
    );
    if (message) problems.push({ message, fix: at(provider.guide, rule.step) });
  }
  if (options.inEnvironment) {
    const where = ` in the environment ${options.environment}`;
    for (const [name, rule] of job.variables) {
      const message = variableProblem(
        name,
        where,
        rule,
        observed.variables[name],
      );
      if (message) {
        problems.push({ message, fix: at(provider.guide, rule.step) });
      }
    }
    for (const [name, rule] of job.secrets) {
      const value = observed.secrets?.get(name);
      const fix = at(provider.guide, rule.step);
      if (value === undefined) {
        problems.push({
          message: `The workflow doesn't pass the secret ${name} to the preflight. Add ${name}: \${{ secrets.${name} }} to the preflight step's env.`,
          fix: ACTION_README,
        });
      } else if (value === "") {
        if (rule.required) {
          problems.push({
            message: `The secret ${name} isn't set${where}.`,
            fix,
          });
        }
      } else {
        const problem = valueProblem(rule, value);
        if (problem) {
          problems.push({
            message: `The secret ${name}${where} ${problem}. Copy it again, whole.`,
            fix,
          });
        }
      }
    }
  }

  // 4. The shared repository variables. In the environment's job, the
  // environment's own variable of the same name wins, as in the workflow.
  for (const [name, rule] of shared.variables) {
    const message = variableProblem(
      name,
      options.inEnvironment ? "" : " in the repository",
      rule,
      observed.variables[name],
    );
    if (message) problems.push({ message, fix: at(shared.guide, rule.step) });
  }
  return problems;
}

/** The secrets the job's environment lists, to read from the environment */
export function secretNames(provider: Requirements, environment: string) {
  return [...(provider.environments.get(environment)?.secrets.keys() ?? [])];
}
