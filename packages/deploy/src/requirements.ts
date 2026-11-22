// Reads a requirements file: deploy/requirements.json, with the repository
// variables every provider shares, or deploy/<provider>/requirements.json,
// with a provider's environments, variables and secrets. Their format is
// deploy/requirements.schema.json. This checks the same rules, so a file that
// editors accept is one the preflight accepts, and anything misspelled is an
// error rather than a check that silently never runs.

export type Rule = {
  required: boolean;
  pattern?: RegExp;
  minimum?: number;
  maximum?: number;
  example?: string;
  /** The guide step that fixes it, such as "#4-create-the-environments" */
  step: string;
};

type RepositoryRule = Rule & {
  /** The environments whose jobs read it, or undefined for all of them */
  environments?: string[];
};

type EnvironmentRequirements = {
  reviewers: "required" | "none";
  step: string;
  variables: Map<string, Rule>;
  secrets: Map<string, Rule>;
};

export type Requirements = {
  /** The guide, from the repository root, such as docs/deploy/upcloud.md */
  guide: string;
  environments: Map<string, EnvironmentRequirements>;
  variables: Map<string, RepositoryRule>;
};

type Json = Record<string, unknown>;

const NAME = /^(?!GITHUB_|PREFLIGHT_)[A-Z][A-Z0-9_]{0,99}$/;
const ENVIRONMENT = /^[a-z0-9][a-z0-9-]{0,62}$/;
const STEP = /^#[a-z0-9-]+$/;
const GUIDE = /^docs\/[A-Za-z0-9/._-]+\.md$/;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(where: string, problem: string): never {
  throw new Error(`${where}: ${problem}`);
}

function object(where: string, value: unknown): Json {
  if (!isObject(value)) fail(where, "must be an object");
  return value;
}

function onlyKeys(where: string, value: Json, allowed: string[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(where, `unknown key "${key}"`);
  }
}

function string(where: string, value: unknown, pattern?: RegExp): string {
  if (typeof value !== "string" || (pattern && !pattern.test(value))) {
    fail(
      where,
      pattern
        ? `must be a string matching ${pattern}, not ${JSON.stringify(value)}`
        : `must be a string, not ${JSON.stringify(value)}`,
    );
  }
  return value;
}

function number(where: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(where, `must be a number, not ${JSON.stringify(value)}`);
  }
  return value;
}

function names(
  where: string,
  value: unknown,
  pattern: RegExp,
): [string, Json][] {
  return Object.entries(object(where, value)).map(([name, rule]) => {
    if (!pattern.test(name)) {
      fail(where, `"${name}" isn't a name GitHub allows here (${pattern})`);
    }
    return [name, object(`${where}.${name}`, rule)];
  });
}

function rule(where: string, json: Json, extra: string[]): Rule {
  onlyKeys(where, json, ["required", "pattern", "step", ...extra]);
  const result: Rule = {
    required: false,
    step: string(`${where}.step`, json.step, STEP),
  };
  if (json.required !== undefined) {
    if (typeof json.required !== "boolean") {
      fail(`${where}.required`, "must be true or false");
    }
    result.required = json.required;
  }
  if (json.pattern !== undefined) {
    const source = string(`${where}.pattern`, json.pattern, /^\^.*\$$/s);
    try {
      result.pattern = new RegExp(source, "u");
    } catch (error) {
      fail(`${where}.pattern`, (error as Error).message);
    }
  }
  return result;
}

function variable(where: string, json: Json, extra: string[] = []): Rule {
  const result = rule(where, json, ["minimum", "maximum", "example", ...extra]);
  if (json.minimum !== undefined) {
    result.minimum = number(`${where}.minimum`, json.minimum);
  }
  if (json.maximum !== undefined) {
    result.maximum = number(`${where}.maximum`, json.maximum);
  }
  if (
    result.minimum !== undefined &&
    result.maximum !== undefined &&
    result.minimum > result.maximum
  ) {
    fail(where, "minimum is more than maximum");
  }
  if (json.example !== undefined) {
    result.example = string(`${where}.example`, json.example);
    const problem = valueProblem(result, result.example);
    if (problem) fail(`${where}.example`, `isn't allowed: it ${problem}`);
  }
  return result;
}

/**
 * Why a value that is set breaks its rule, or undefined if it doesn't. The
 * reason never repeats the value, so it can be said of a secret too.
 */
export function valueProblem(rule: Rule, value: string): string | undefined {
  if (rule.pattern && !rule.pattern.test(value)) {
    return `doesn't match ${rule.pattern.source}`;
  }
  if (rule.minimum === undefined && rule.maximum === undefined) return;
  const amount = Number(value);
  if (value.trim() === "" || !Number.isFinite(amount)) {
    return "isn't a number";
  }
  if (
    (rule.minimum !== undefined && amount < rule.minimum) ||
    (rule.maximum !== undefined && amount > rule.maximum)
  ) {
    return rule.minimum === undefined
      ? `is more than ${rule.maximum}`
      : rule.maximum === undefined
        ? `is less than ${rule.minimum}`
        : `isn't from ${rule.minimum} to ${rule.maximum}`;
  }
}

function environment(where: string, json: Json): EnvironmentRequirements {
  onlyKeys(where, json, ["reviewers", "step", "variables", "secrets"]);
  if (json.reviewers !== "required" && json.reviewers !== "none") {
    fail(`${where}.reviewers`, `must be "required" or "none"`);
  }
  return {
    reviewers: json.reviewers,
    step: string(`${where}.step`, json.step, STEP),
    variables: new Map(
      names(`${where}.variables`, json.variables ?? {}, NAME).map(
        ([name, rule]) => [name, variable(`${where}.variables.${name}`, rule)],
      ),
    ),
    secrets: new Map(
      names(`${where}.secrets`, json.secrets ?? {}, NAME).map(
        ([name, json]) => [name, rule(`${where}.secrets.${name}`, json, [])],
      ),
    ),
  };
}

/**
 * Reads a requirements file's JSON. `where` names the file in errors. The
 * shared file has only repository variables; a provider's file has at least
 * one environment.
 */
export default function requirements(
  where: string,
  value: unknown,
  { shared }: { shared: boolean },
): Requirements {
  const json = object(where, value);
  onlyKeys(where, json, [
    "$schema",
    "guide",
    "variables",
    ...(shared ? [] : ["environments"]),
  ]);
  const environments = new Map(
    shared
      ? []
      : names(`${where}.environments`, json.environments, ENVIRONMENT).map(
          ([name, json]) => [
            name,
            environment(`${where}.environments.${name}`, json),
          ],
        ),
  );
  if (!shared && environments.size === 0) {
    fail(`${where}.environments`, "must list at least one environment");
  }
  const variables = new Map<string, RepositoryRule>();
  for (const [name, entry] of names(
    `${where}.variables`,
    json.variables ?? {},
    NAME,
  )) {
    const at = `${where}.variables.${name}`;
    const result: RepositoryRule = variable(at, entry, ["environments"]);
    if (entry.environments !== undefined) {
      if (shared) fail(at, `unknown key "environments"`);
      const list = entry.environments;
      if (!Array.isArray(list) || list.length === 0) {
        fail(`${at}.environments`, "must be a list of environments");
      }
      for (const name of list) {
        if (typeof name !== "string" || !environments.has(name)) {
          fail(
            `${at}.environments`,
            `${JSON.stringify(name)} isn't one of this file's environments`,
          );
        }
      }
      result.environments = [...new Set(list as string[])];
    }
    variables.set(name, result);
  }
  for (const [env, { variables: own, secrets }] of environments) {
    for (const name of [...own.keys(), ...secrets.keys()]) {
      if (variables.has(name)) {
        fail(
          `${where}.environments.${env}`,
          `${name} is a repository variable too`,
        );
      }
      if (own.has(name) && secrets.has(name)) {
        fail(
          `${where}.environments.${env}`,
          `${name} is both a variable and a secret`,
        );
      }
    }
  }
  return {
    guide: string(`${where}.guide`, json.guide, GUIDE),
    environments,
    variables,
  };
}
