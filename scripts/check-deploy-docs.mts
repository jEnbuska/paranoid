/**
 * Checks that the deployment docs list everything the deploy workflows use
 * from GitHub, and nothing they don't. CI runs it from the repository root:
 *
 *   node scripts/check-deploy-docs.mts
 *
 * A provider is a `deploy-<provider>.yml` workflow, and its workflows are
 * every `.github/workflows/*-<provider>.yml`. Each `environment`, `vars.NAME`
 * and `secrets.NAME` they use must be in the index's shared table
 * (`docs/deploy/README.md`) or in the provider's "What this deployment needs"
 * section (`docs/deploy/<provider>.md`). It also checks the parts of the
 * index's common pattern that it can read: that identity values stay in their
 * environments and tuning values in the repository, and the guide's headings.
 * "Adding a provider" in the index describes the tables this reads.
 *
 * The preflight's lists are checked against the docs too: each provider's
 * `deploy/<provider>/requirements.json` names what its page does, in the same
 * places, and links headings that are on the page; `deploy/requirements.json`
 * agrees with the index's shared table; and each workflow's preflight step
 * passes every secret its environment's list names. The lists' own format and
 * what the preflight does with them are packages/deploy's tests.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type {
  Requirements,
  Rule,
} from "../packages/deploy/src/requirements.ts";
import requirements, {
  valueProblem,
} from "../packages/deploy/src/requirements.ts";

/** Repository files by their path from the root, with `/` separators. */
export type Files = Map<string, string>;

const INDEX = "docs/deploy/README.md";
const WORKFLOWS = ".github/workflows/";
/** The preflight's list of the shared variables */
const SHARED_LIST = "deploy/requirements.json";

/** Each table's columns, in order, as the docs must write them. */
export const COLUMNS = {
  shared: ["Variable", "What it does", "Default", "Allowed values"],
  providers: [
    "Provider",
    "Where it runs",
    "Needs a secret",
    "Deployed for real",
  ],
  environments: ["Environment", "Branches", "Required reviewers", "Used by"],
  secrets: ["Secret", "Environment", "Where its value comes from"],
  variables: [
    "Variable",
    "Set in",
    "What it does",
    "Required",
    "Default",
    "Explained in",
  ],
} as const;

/**
 * The guide's `##` headings, in order, around its numbered steps. A step
 * heading starts with its number, such as "1. Fork the repository", and the
 * steps between the first and last ones here are each provider's own.
 */
const GUIDE = {
  before: [
    "What this deployment needs",
    "Contents",
    "Words used in this guide",
  ],
  firstSteps: ["Fork", "Sign up"],
  lastSteps: ["Optional settings", "Start a server", "Stop it"],
  after: [
    "Costs",
    "Checking nothing is left",
    "The credentials",
    "Troubleshooting",
    "Removing everything",
    "Privacy",
    "What a deploy does",
  ],
} as const;

/**
 * Names of identity values, which say who signs in or which of the account's
 * resources a deploy uses: environment secrets or variables, never repository
 * variables. A name that matches neither this nor TUNING is left to review.
 */
const IDENTITY =
  /_(TOKEN|ARN|CLIENT_ID|TENANT_ID|SUBSCRIPTION_ID|ACCOUNT_ID|PROJECT|PROJECT_ID|SERVICE_ACCOUNT|WORKLOAD_IDENTITY_PROVIDER|SECURITY_GROUP_ID|BUCKET|RESOURCE_GROUP)$/;

/** Names of tuning values and limits: repository variables. */
const TUNING =
  /_(REGION|ZONE|LOCATION|SIZE|PLAN|IMAGE|TEMPLATE|INSTANCE_TYPE|SERVER_TYPES?|USD|MINUTES|MBIT)$/;

const PATTERN = `"The same deploy on every provider" in ${INDEX}`;

/**
 * Where a name is used: in which workflows, under which environments, and
 * which workflows read it outside any environment.
 */
type Use = {
  workflows: Set<string>;
  environments: Set<string>;
  outside: Set<string>;
};

type Usage = {
  workflows: string[];
  /** Each environment, with the workflows whose jobs use it */
  environments: Map<string, Set<string>>;
  secrets: Map<string, Use>;
  variables: Map<string, Use>;
};

// ---------------------------------------------------------------- Workflows

/** Every provider with a `deploy-<provider>.yml`, sorted. */
export function providers(files: Files): string[] {
  const found: string[] = [];
  for (const path of files.keys()) {
    const match = /^\.github\/workflows\/deploy-([a-z0-9-]+)\.yml$/.exec(path);
    if (match) found.push(match[1]);
  }
  return found.sort();
}

const EXPRESSION = /\$\{\{([\s\S]*?)\}\}/g;
const CONTEXT = /\b(vars|secrets)\.([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * The `vars` and `secrets` names in a workflow value: inside `${{ }}`, and
 * anywhere in an `if:`, which is an expression without the braces. YAML
 * comments are gone once it's parsed, so a name in a comment doesn't count.
 */
function contextNames(
  value: unknown,
  key: string,
  found: Array<["vars" | "secrets", string]>,
): void {
  if (typeof value === "string") {
    const expressions =
      key === "if"
        ? [value]
        : Array.from(value.matchAll(EXPRESSION), (match) => match[1]);
    for (const expression of expressions) {
      for (const match of expression.matchAll(CONTEXT)) {
        found.push([match[1] as "vars" | "secrets", match[2]]);
      }
    }
  } else if (Array.isArray(value)) {
    for (const item of value) contextNames(item, key, found);
  } else if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      contextNames(child, childKey, found);
    }
  }
}

function addUse(
  map: Map<string, Use>,
  name: string,
  workflow: string,
  environment: string | undefined,
): void {
  let use = map.get(name);
  if (!use) {
    use = { workflows: new Set(), environments: new Set(), outside: new Set() };
    map.set(name, use);
  }
  use.workflows.add(workflow);
  if (environment) use.environments.add(environment);
  else use.outside.add(workflow);
}

/** One provider's workflows, by file name, parsed. */
function workflowsOf(
  files: Files,
  provider: string,
): Array<[string, { jobs?: Record<string, unknown> }]> {
  const found: Array<[string, { jobs?: Record<string, unknown> }]> = [];
  for (const [path, text] of files) {
    if (path.startsWith(WORKFLOWS) && path.endsWith(`-${provider}.yml`)) {
      found.push([path.slice(WORKFLOWS.length), parse(text) ?? {}]);
    }
  }
  return found;
}

/** A job's environment: `environment: name` or `environment: { name }`. */
function jobEnvironment(job: unknown): string | undefined {
  const raw = (job as { environment?: unknown } | null)?.environment;
  if (typeof raw === "string") return raw;
  const name = (raw as { name?: unknown } | undefined)?.name;
  return typeof name === "string" ? name : undefined;
}

/** What one provider's workflows use from GitHub. */
export function usage(files: Files, provider: string): Usage {
  const result: Usage = {
    workflows: [],
    environments: new Map(),
    secrets: new Map(),
    variables: new Map(),
  };
  for (const [workflow, parsed] of workflowsOf(files, provider)) {
    result.workflows.push(workflow);
    const { jobs = {}, ...top } = parsed;
    // [names, environment]: the workflow's own keys have no environment
    const parts: Array<[unknown, string | undefined]> = [[top, undefined]];
    for (const job of Object.values(jobs)) {
      const environment = jobEnvironment(job);
      if (environment) {
        const users = result.environments.get(environment) ?? new Set();
        users.add(workflow);
        result.environments.set(environment, users);
      }
      // A job's own `if:` is decided before the job gets its environment,
      // so it can't read the environment's variables
      const { if: condition, ...rest } = (job ?? {}) as { if?: unknown };
      if (condition !== undefined) parts.push([{ if: condition }, undefined]);
      parts.push([rest, environment]);
    }
    for (const [value, environment] of parts) {
      const found: Array<["vars" | "secrets", string]> = [];
      contextNames(value, "", found);
      for (const [context, name] of found) {
        // GitHub creates GITHUB_TOKEN for every run: nobody sets it up
        if (context === "secrets" && name === "GITHUB_TOKEN") continue;
        const map = context === "vars" ? result.variables : result.secrets;
        addUse(map, name, workflow, environment);
      }
    }
  }
  result.workflows.sort();
  return result;
}

// ----------------------------------------------------------------- Markdown

/**
 * The lines under a heading, up to the next heading of the same or a higher
 * level, or undefined if there's no such heading. Code blocks are skipped,
 * so a `#` in a shell example isn't a heading.
 */
export function section(
  lines: readonly string[],
  level: number,
  title: string,
): string[] | undefined {
  let start = -1;
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fenced = !fenced;
    if (fenced) continue;
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i]);
    if (!heading) continue;
    if (start >= 0 && heading[1].length <= level) return lines.slice(start, i);
    if (
      start < 0 &&
      heading[1].length === level &&
      heading[2].toLowerCase() === title.toLowerCase()
    ) {
      start = i + 1;
    }
  }
  return start >= 0 ? lines.slice(start) : undefined;
}

/** A table row's cells. `|` inside backticks or escaped doesn't split. */
function cells(line: string): string[] {
  const result: string[] = [];
  let cell = "";
  let code = false;
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char === "\\" && inner[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (char === "`") {
      code = !code;
      cell += char;
    } else if (char === "|" && !code) {
      result.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  result.push(cell.trim());
  return result;
}

type Table = { columns: string[]; rows: string[][] };

/** The first table in some lines: its header and its body rows. */
export function table(lines: readonly string[]): Table | undefined {
  const start = lines.findIndex((line) => line.trimStart().startsWith("|"));
  if (start < 0) return undefined;
  let end = start;
  while (end < lines.length && lines[end].trimStart().startsWith("|")) end++;
  const [header, _delimiter, ...rows] = lines.slice(start, end).map(cells);
  return { columns: header, rows };
}

/** The code spans in a cell: `` `a`, `b` `` gives a and b. */
function codeSpans(cell: string | undefined): string[] {
  return Array.from((cell ?? "").matchAll(/`([^`]+)`/g), (match) => match[1]);
}

// ------------------------------------------------------------------- Checks

const list = (names: Iterable<string>) =>
  Array.from(names, (name) => `\`${name}\``).join(", ") || "none";

const sameSet = (a: Iterable<string>, b: Iterable<string>) => {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((x) => right.has(x));
};

/**
 * A table under the given lines, checked for its columns. Reports and
 * returns undefined if it's missing or its columns aren't the expected ones.
 */
function expectTable(
  errors: string[],
  file: string,
  where: string,
  lines: readonly string[] | undefined,
  columns: readonly string[],
): Table | undefined {
  if (!lines) {
    errors.push(`${file}: has no ${where} section.`);
    return undefined;
  }
  const found = table(lines);
  if (!found) {
    errors.push(`${file}: ${where} has no table.`);
    return undefined;
  }
  if (found.columns.join(" | ") !== columns.join(" | ")) {
    errors.push(
      `${file}: ${where}'s table has the columns "${found.columns.join(" | ")}", not "${columns.join(" | ")}".`,
    );
    return undefined;
  }
  return found;
}

/**
 * Every problem with the deployment docs, as one message each, or none.
 * See this file's header for what it checks.
 */
export function checkDeployDocs(files: Files): string[] {
  const errors: string[] = [];
  const index = files.get(INDEX);
  if (index === undefined) return [`${INDEX}: is missing.`];
  const indexLines = index.split("\n");

  const sharedTable = expectTable(
    errors,
    INDEX,
    '"Shared repository variables"',
    section(indexLines, 2, "Shared repository variables"),
    COLUMNS.shared,
  );
  const shared = new Set(
    (sharedTable?.rows ?? []).flatMap((row) => codeSpans(row[0]).slice(0, 1)),
  );
  checkSharedList(errors, files, sharedTable, indexLines);

  const providersTable = expectTable(
    errors,
    INDEX,
    '"Providers"',
    section(indexLines, 2, "Providers"),
    COLUMNS.providers,
  );
  const rows = new Map<string, string[]>();
  for (const row of providersTable?.rows ?? []) {
    const link = /\]\(\.?\/?([a-z0-9-]+)\.md\)/.exec(row[0]);
    if (link) rows.set(link[1], row);
    else errors.push(`${INDEX}: the Providers row "${row[0]}" links no page.`);
  }

  const all = providers(files);
  const usages = new Map(all.map((p) => [p, usage(files, p)]));

  for (const [provider, use] of usages) {
    checkProvider(errors, files, provider, use, shared, rows.get(provider));
    // A list whose provider has no workflows yet waits for its page
    const listPath = `deploy/${provider}/requirements.json`;
    if (!files.has(listPath)) {
      errors.push(
        `${listPath}: is missing. ${provider} has workflows (${list(use.workflows)}), and their preflight reads what to check from it.`,
      );
      continue;
    }
    const providerList = readList(errors, files, listPath, false);
    if (providerList) {
      checkList(errors, files, provider, providerList, shared);
      checkPreflightSteps(errors, files, provider, providerList);
    }
  }

  // Listed, but with no workflows
  for (const provider of rows.keys()) {
    if (!usages.has(provider)) {
      errors.push(
        `${INDEX}: the Providers table lists ${provider}, which has no ${WORKFLOWS}deploy-${provider}.yml. A provider is listed only once its workflows have merged.`,
      );
    }
  }
  for (const path of files.keys()) {
    const page = /^docs\/deploy\/([a-z0-9-]+)\.md$/.exec(path);
    if (page && !usages.has(page[1])) {
      errors.push(
        `${path}: there's no ${WORKFLOWS}deploy-${page[1]}.yml for this page.`,
      );
    }
  }

  // A shared variable is one that every provider uses
  if (usages.size > 0) {
    for (const name of shared) {
      const without = all.filter((p) => !usages.get(p)?.variables.has(name));
      if (without.length > 0) {
        errors.push(
          `${INDEX}: \`${name}\` is in the shared table, but ${without.map((p) => `${p}'s workflows don't`).join(", ")} use it. Use it in every provider's workflows, or move it to the pages of the providers that do.`,
        );
      }
    }
  }
  if (usages.size > 1) {
    const [first, ...rest] = [...usages.values()];
    for (const name of first.variables.keys()) {
      if (!shared.has(name) && rest.every((u) => u.variables.has(name))) {
        errors.push(
          `${INDEX}: every provider uses vars.${name}, so it belongs in the shared table, not on each provider's page.`,
        );
      }
    }
  }
  return errors;
}

function checkProvider(
  errors: string[],
  files: Files,
  provider: string,
  use: Usage,
  shared: Set<string>,
  row: string[] | undefined,
): void {
  const pagePath = `docs/deploy/${provider}.md`;
  const readmePath = `deploy/${provider}/README.md`;
  const workflows = list(use.workflows);

  if (!row) {
    errors.push(
      `${INDEX}: the Providers table has no row for ${provider} (${workflows}). Add one linking [${provider}](${provider}.md).`,
    );
  } else {
    const needs = use.secrets.size > 0 ? "Yes" : "No";
    if (!row[2]?.startsWith(needs)) {
      errors.push(
        `${INDEX}: ${provider}'s "Needs a secret" says "${row[2] ?? ""}", but its workflows use ${use.secrets.size > 0 ? list(use.secrets.keys()) : "no secrets"}. Start it with "${needs}".`,
      );
    }
  }

  const readme = files.get(readmePath);
  if (readme === undefined) {
    errors.push(
      `${readmePath}: is missing. ${provider} has workflows (${workflows}), so its folder needs a README linking ${pagePath}.`,
    );
  } else if (!readme.includes(`docs/deploy/${provider}.md`)) {
    errors.push(`${readmePath}: doesn't link ../../${pagePath}.`);
  }

  const page = files.get(pagePath);
  if (page === undefined) {
    errors.push(
      `${pagePath}: is missing. ${provider} has workflows (${workflows}), so it needs a page.`,
    );
    return;
  }
  const lines = page.split("\n");
  if (!/\]\((\.\/)?README\.md(#[^)]*)?\)/.test(page)) {
    errors.push(`${pagePath}: doesn't link back to the index, README.md.`);
  }

  checkGuide(errors, pagePath, lines);

  const needs = section(lines, 2, "What this deployment needs");
  if (!needs) {
    errors.push(
      `${pagePath}: has no "## What this deployment needs" section. See "Adding a provider" in ${INDEX}.`,
    );
    return;
  }
  if (
    !/\]\((\.\/)?README\.md#shared-repository-variables\)/.test(
      needs.join("\n"),
    )
  ) {
    errors.push(
      `${pagePath}: "What this deployment needs" doesn't link the shared variables, README.md#shared-repository-variables.`,
    );
  }
  const where = (name: string) => `"What this deployment needs" → "${name}"`;

  // Environments, with the workflows that use each
  const environments = expectTable(
    errors,
    pagePath,
    where("Environments"),
    section(needs, 3, "Environments"),
    COLUMNS.environments,
  );
  if (environments) {
    const listed = new Map(
      environments.rows.map((r) => [codeSpans(r[0])[0] ?? r[0], r] as const),
    );
    for (const [name, users] of use.environments) {
      const row = listed.get(name);
      if (!row) {
        errors.push(
          `${pagePath}: ${list(users)} use${users.size > 1 ? "" : "s"} the environment \`${name}\`, which ${where("Environments")} doesn't list.`,
        );
      } else if (!sameSet(codeSpans(row[3]), users)) {
        errors.push(
          `${pagePath}: ${where("Environments")} says \`${name}\` is used by ${list(codeSpans(row[3]))}, but it's used by ${list(users)}.`,
        );
      }
    }
    for (const name of listed.keys()) {
      if (!use.environments.has(name)) {
        errors.push(
          `${pagePath}: ${where("Environments")} lists \`${name}\`, which no workflow of ${provider} uses any more.`,
        );
      }
    }
  }

  // Secrets, with the environments they're in. OIDC providers have none.
  const secretLines = section(needs, 3, "Secrets");
  if (use.secrets.size === 0) {
    if (!secretLines) {
      errors.push(`${pagePath}: has no ${where("Secrets")} section.`);
    } else {
      const stale = table(secretLines)?.rows ?? [];
      for (const r of stale) {
        errors.push(
          `${pagePath}: ${where("Secrets")} lists ${r[0]}, which no workflow of ${provider} uses any more.`,
        );
      }
      if (stale.length === 0 && !/no secrets/i.test(secretLines.join("\n"))) {
        errors.push(
          `${pagePath}: ${provider}'s workflows use no secrets. Say "No secrets" in ${where("Secrets")}.`,
        );
      }
    }
  } else {
    const secrets = expectTable(
      errors,
      pagePath,
      where("Secrets"),
      secretLines,
      COLUMNS.secrets,
    );
    if (secrets) {
      const listed = new Map(
        secrets.rows.map((r) => [codeSpans(r[0])[0] ?? r[0], r] as const),
      );
      for (const [name, used] of use.secrets) {
        const row = listed.get(name);
        if (!row) {
          errors.push(
            `${pagePath}: ${list(used.workflows)} use${used.workflows.size > 1 ? "" : "s"} secrets.${name}, which ${where("Secrets")} doesn't list.`,
          );
        } else if (!sameSet(codeSpans(row[1]), used.environments)) {
          errors.push(
            `${pagePath}: ${where("Secrets")} says \`${name}\` is in ${list(codeSpans(row[1]))}, but the workflows read it in ${list(used.environments)}.`,
          );
        }
      }
      for (const name of listed.keys()) {
        if (!use.secrets.has(name)) {
          errors.push(
            `${pagePath}: ${where("Secrets")} lists \`${name}\`, which no workflow of ${provider} uses any more.`,
          );
        }
      }
    }
  }

  // An environment's secrets and variables exist only in its own jobs
  for (const [context, names] of [
    ["secrets", use.secrets],
    ["vars", use.variables],
  ] as const) {
    for (const [name, used] of names) {
      if (context === "secrets" && used.outside.size > 0) {
        errors.push(
          `${pagePath}: ${list(used.outside)} read${used.outside.size > 1 ? "" : "s"} secrets.${name} outside an environment, where it's empty. Read it only in the jobs of the environments it's in.`,
        );
      }
      if (IDENTITY.test(name) && /_CLEANUP_/.test(name)) {
        errors.push(
          `${pagePath}: \`${name}\` is a second name for one role. Use the same name in \`${provider}\` and \`${provider}-cleanup\`, each with its own value. See ${PATTERN}.`,
        );
      }
      if (context === "vars" && /_TOKEN$/.test(name)) {
        errors.push(
          `${pagePath}: ${list(used.workflows)} read${used.workflows.size > 1 ? "" : "s"} the token vars.${name}. A token is an environment secret.`,
        );
      }
    }
  }

  // Variables, except the shared ones, which the index lists
  const own = [...use.variables].filter(([name]) => !shared.has(name));
  const variableLines = section(needs, 3, "Variables");
  if (own.length === 0 && !variableLines) return;
  const variables = expectTable(
    errors,
    pagePath,
    where("Variables"),
    variableLines,
    COLUMNS.variables,
  );
  if (!variables) return;
  const listed = new Map(
    variables.rows.map((r) => [codeSpans(r[0])[0] ?? r[0], r] as const),
  );
  for (const [name, used] of own) {
    if (!listed.has(name)) {
      errors.push(
        `${pagePath}: ${list(used.workflows)} use${used.workflows.size > 1 ? "" : "s"} vars.${name}, which ${where("Variables")} doesn't list.`,
      );
    }
  }
  for (const [name, row] of listed) {
    const used = use.variables.get(name);
    if (used && !shared.has(name)) {
      checkPlacement(errors, pagePath, name, row[1] ?? "", used);
    }
  }
  for (const name of listed.keys()) {
    if (shared.has(name)) {
      errors.push(
        `${pagePath}: ${where("Variables")} lists \`${name}\`, which is shared. Link the index's shared table instead of repeating it.`,
      );
    } else if (!use.variables.has(name)) {
      errors.push(
        `${pagePath}: ${where("Variables")} lists \`${name}\`, which no workflow of ${provider} uses any more.`,
      );
    }
  }
}

/**
 * A variable's "Set in": `Repository` for tuning values and limits, or the
 * environments it's in, each in backticks, for identity values, which only
 * those environments' jobs may read.
 */
function checkPlacement(
  errors: string[],
  pagePath: string,
  name: string,
  setIn: string,
  used: Use,
): void {
  const where = `"What this deployment needs" → "Variables"`;
  const environments = codeSpans(setIn);
  if (environments.length === 0) {
    if (!/^Repository$/i.test(setIn)) {
      errors.push(
        `${pagePath}: ${where} says \`${name}\` is set in "${setIn}". Write "Repository", or the environments it's in, each in backticks.`,
      );
    } else if (IDENTITY.test(name)) {
      errors.push(
        `${pagePath}: ${where} says \`${name}\` is a repository variable, but it's an identity value, which any job could read. Make it an environment variable in each environment whose workflows use it. See ${PATTERN}.`,
      );
    }
    return;
  }
  if (TUNING.test(name)) {
    errors.push(
      `${pagePath}: ${where} says \`${name}\` is in ${list(environments)}, but it's a tuning value or a limit, which is a repository variable. See ${PATTERN}.`,
    );
  }
  if (used.outside.size > 0) {
    errors.push(
      `${pagePath}: ${list(used.outside)} read${used.outside.size > 1 ? "" : "s"} vars.${name} outside an environment, where it's empty. Read it only in the jobs of the environments it's in.`,
    );
  }
  if (!sameSet(environments, used.environments)) {
    errors.push(
      `${pagePath}: ${where} says \`${name}\` is in ${list(environments)}, but the workflows read it in ${list(used.environments)}.`,
    );
  }
}

/** The `##` headings, without their `## `. Code blocks are skipped. */
function headings(lines: readonly string[]): string[] {
  const found: string[] = [];
  let fenced = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^##\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) found.push(heading[1]);
  }
  return found;
}

/** The guide's headings and their order, as in GUIDE. */
function checkGuide(
  errors: string[],
  pagePath: string,
  lines: readonly string[],
): void {
  const found = headings(lines);
  const steps = found.flatMap((title, at) => {
    const step = /^(\d+)\.\s+(.*)$/.exec(title);
    return step ? [{ at, number: Number(step[1]), title: step[2] }] : [];
  });

  const misnumbered = steps.findIndex((step, i) => step.number !== i + 1);
  if (misnumbered >= 0) {
    const step = steps[misnumbered];
    errors.push(
      `${pagePath}: the step "${step.number}. ${step.title}" is number ${misnumbered + 1} of the guide. Number the steps 1, 2, 3 and on.`,
    );
  }
  const { firstSteps, lastSteps } = GUIDE;
  if (steps.length < firstSteps.length + lastSteps.length) {
    errors.push(
      `${pagePath}: has ${steps.length} numbered steps, fewer than the guide's ${firstSteps.length + lastSteps.length} that can't be folded together: ${[...firstSteps, ...lastSteps].map((t) => `"${t}"`).join(", ")}. See ${PATTERN}.`,
    );
  } else {
    const expected = [
      ...firstSteps.map((title, i) => [steps[i], title] as const),
      ...lastSteps.map(
        (title, i) =>
          [steps[steps.length - lastSteps.length + i], title] as const,
      ),
    ];
    for (const [step, title] of expected) {
      if (!step.title.toLowerCase().startsWith(title.toLowerCase())) {
        errors.push(
          `${pagePath}: the step "${step.number}. ${step.title}" should start with "${title}". See ${PATTERN}.`,
        );
      }
    }
  }

  const firstStep = steps[0]?.at ?? -1;
  const lastStep = steps.at(-1)?.at ?? -1;
  let previous: { at: number; title: string } | undefined;
  for (const title of [...GUIDE.before, ...GUIDE.after]) {
    const at = found.findIndex((h) => h.toLowerCase() === title.toLowerCase());
    if (at < 0) {
      // A page without it gets its own message
      if (title !== "What this deployment needs") {
        errors.push(
          `${pagePath}: has no "## ${title}" section. See ${PATTERN}.`,
        );
      }
      continue;
    }
    const before = (GUIDE.before as readonly string[]).includes(title);
    if (before && firstStep >= 0 && at > firstStep) {
      errors.push(
        `${pagePath}: "${title}" comes after the first step. Put it before the step-by-step guide.`,
      );
    } else if (!before && lastStep >= 0 && at < lastStep) {
      errors.push(
        `${pagePath}: "${title}" comes before the last step. Put it after the step-by-step guide.`,
      );
    } else if (previous && at < previous.at) {
      errors.push(
        `${pagePath}: "${title}" comes before "${previous.title}". See ${PATTERN} for the order.`,
      );
    }
    previous = { at, title };
  }
}

// ---------------------------------------------------------- Preflight lists

/** A preflight list, or undefined, with a message, if it can't be read. */
function readList(
  errors: string[],
  files: Files,
  path: string,
  shared: boolean,
): Requirements | undefined {
  const text = files.get(path);
  if (text === undefined) return undefined;
  try {
    return requirements(path, JSON.parse(text), { shared });
  } catch (error) {
    // requirements() names the file and the key; JSON.parse doesn't
    const message = (error as Error).message;
    errors.push(message.startsWith(path) ? message : `${path}: ${message}`);
    return undefined;
  }
}

/**
 * The anchors GitHub gives a page's headings, such as `#5-optional-settings`,
 * with `-1`, `-2` and on for repeats. Code blocks are skipped.
 */
export function anchors(lines: readonly string[]): Set<string> {
  const seen = new Map<string, number>();
  const result = new Set<string>();
  let fenced = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!heading) continue;
    const base = heading[1]
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    result.add(`#${count === 0 ? base : `${base}-${count}`}`);
  }
  return result;
}

/** Every `step` a list links, with the key it's under. */
function steps(list: Requirements): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  for (const [name, environment] of list.environments) {
    const at = `environments.${name}`;
    found.push([at, environment.step]);
    for (const kind of ["variables", "secrets"] as const) {
      for (const [rule, { step }] of environment[kind]) {
        found.push([`${at}.${kind}.${rule}`, step]);
      }
    }
  }
  for (const [name, { step }] of list.variables) {
    found.push([`variables.${name}`, step]);
  }
  return found;
}

/** Each `step` in a list is a heading in its guide. */
function checkSteps(
  errors: string[],
  listPath: string,
  list: Requirements,
  guidePath: string,
  guide: readonly string[],
): void {
  const found = anchors(guide);
  for (const [key, step] of steps(list)) {
    if (!found.has(step)) {
      errors.push(
        `${listPath}: ${key}.step links ${guidePath}${step}, which isn't a heading there. Link the heading that fixes it, or rename the heading back.`,
      );
    }
  }
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six"];

/**
 * What an "Allowed values" cell says that the rule disagrees with: each
 * example in backticks, "whole number", "from A to B" (or "at least" and
 * "at most"), "below N" and "up to N decimals".
 */
function allowedProblems(rule: Rule, allowed: string): string[] {
  const problems: string[] = [];
  const accepts = (value: string) => valueProblem(rule, value) === undefined;
  const says = (claim: string, value: string, wanted: boolean) => {
    if (accepts(value) !== wanted) {
      problems.push(
        `says "${claim}", but ${SHARED_LIST} ${wanted ? "doesn't allow" : "allows"} \`${value}\``,
      );
    }
  };
  for (const value of codeSpans(allowed)) {
    says(`\`${value}\``, value, true);
  }
  if (/whole number/i.test(allowed)) says("whole number", "1.5", false);

  const { minimum, maximum } = rule;
  const range =
    minimum !== undefined && maximum !== undefined
      ? `from ${minimum} to ${maximum}`
      : minimum !== undefined
        ? `at least ${minimum}`
        : maximum !== undefined
          ? `at most ${maximum}`
          : undefined;
  const number = String.raw`\d+(?:\.\d+)?`;
  const written = new RegExp(
    String.raw`\b(from ${number} to ${number}|at least ${number}|at most ${number})\b`,
    "i",
  ).exec(allowed);
  if (range && written?.[1].toLowerCase() !== range) {
    problems.push(
      `says "${written?.[1] ?? allowed}", but ${SHARED_LIST}'s range is ${range}`,
    );
  } else if (!range && written) {
    problems.push(`says "${written[1]}", but ${SHARED_LIST} has no range`);
  }

  const below = /\bbelow (\d+)/i.exec(allowed);
  if (below) {
    const limit = Number(below[1]);
    says(`below ${limit}`, String(limit), false);
    says(`below ${limit}`, String(limit - 1), true);
  }
  const decimals = /\bup to (\w+) decimals?/i.exec(allowed);
  if (decimals) {
    const word = decimals[1].toLowerCase();
    const places = NUMBER_WORDS.includes(word)
      ? NUMBER_WORDS.indexOf(word)
      : Number(word);
    if (Number.isInteger(places) && places > 0) {
      const claim = `up to ${decimals[1]} decimals`;
      says(claim, `1.${"5".repeat(places)}`, true);
      says(claim, `1.${"5".repeat(places + 1)}`, false);
    }
  }
  return problems;
}

/**
 * `deploy/requirements.json` lists the index's shared variables, with rules
 * that match their Default and Allowed values, and links the index's
 * headings.
 */
function checkSharedList(
  errors: string[],
  files: Files,
  sharedTable: Table | undefined,
  indexLines: readonly string[],
): void {
  if (!files.has(SHARED_LIST)) {
    errors.push(
      `${SHARED_LIST}: is missing. The preflight reads the shared variables' rules from it.`,
    );
    return;
  }
  const list = readList(errors, files, SHARED_LIST, true);
  if (!list) return;
  checkSteps(errors, SHARED_LIST, list, INDEX, indexLines);
  if (!sharedTable) return;

  const rows = new Map(
    sharedTable.rows.map((r) => [codeSpans(r[0])[0] ?? r[0], r] as const),
  );
  for (const [name, row] of rows) {
    const rule = list.variables.get(name);
    if (!rule) {
      errors.push(
        `${INDEX}: the shared table lists \`${name}\`, which ${SHARED_LIST} doesn't. Add it there, so the preflight checks it.`,
      );
      continue;
    }
    const fallback = codeSpans(row[2])[0];
    const problem =
      fallback === undefined ? undefined : valueProblem(rule, fallback);
    if (problem) {
      errors.push(
        `${INDEX}: the shared table's default for \`${name}\`, \`${fallback}\`, breaks its rule in ${SHARED_LIST}: it ${problem}.`,
      );
    }
    for (const problem of allowedProblems(rule, row[3] ?? "")) {
      errors.push(
        `${INDEX}: the shared table's Allowed values for \`${name}\` ${problem}. Make the two agree.`,
      );
    }
  }
  for (const name of list.variables.keys()) {
    if (!rows.has(name)) {
      errors.push(
        `${SHARED_LIST}: lists \`${name}\`, which the shared table in ${INDEX} doesn't.`,
      );
    }
  }
}

/** Names in backticks, sorted, so two lists compare as text. */
const sortedList = (names: Iterable<string>) => list([...names].sort());

/** Where a secret or variable is, as a page or a list says. */
type Place = {
  kind: "secret" | "variable";
  /** "Repository", or the environments it's in, in backticks */
  where: string;
  required?: boolean;
  /** The page's Required column, as written */
  column?: string;
};

const placeName = ({ kind, where }: Place) =>
  where === "Repository" ? `a repository ${kind}` : `a ${kind} in ${where}`;

/** The secrets and variables a provider's list names, and where. */
function listPlaces(list: Requirements): Map<string, Place> {
  const environments = new Map<string, { place: Place; in: string[] }>();
  for (const [environment, own] of list.environments) {
    for (const kind of ["secrets", "variables"] as const) {
      for (const [name, rule] of own[kind]) {
        const found = environments.get(name) ?? {
          place: {
            kind: kind === "secrets" ? "secret" : "variable",
            where: "",
          },
          in: [],
        };
        found.in.push(environment);
        // Required if any environment requires it: the page has one column
        if (kind === "variables") {
          found.place.required = !!found.place.required || rule.required;
        }
        environments.set(name, found);
      }
    }
  }
  const places = new Map<string, Place>();
  for (const [name, found] of environments) {
    places.set(name, { ...found.place, where: sortedList(found.in) });
  }
  for (const [name, rule] of list.variables) {
    places.set(name, {
      kind: "variable",
      where: "Repository",
      required: rule.required,
    });
  }
  return places;
}

/** The secrets and variables a provider's page names, and where. */
function pagePlaces(
  needs: readonly string[],
  shared: Set<string>,
): Map<string, Place> {
  const places = new Map<string, Place>();
  const secrets = table(section(needs, 3, "Secrets") ?? []);
  if (secrets?.columns.join(" | ") === COLUMNS.secrets.join(" | ")) {
    for (const row of secrets.rows) {
      places.set(codeSpans(row[0])[0] ?? row[0], {
        kind: "secret",
        where: sortedList(codeSpans(row[1])),
      });
    }
  }
  const variables = table(section(needs, 3, "Variables") ?? []);
  if (variables?.columns.join(" | ") === COLUMNS.variables.join(" | ")) {
    for (const row of variables.rows) {
      const name = codeSpans(row[0])[0] ?? row[0];
      // The index lists the shared ones, and checkProvider reports them here
      if (shared.has(name)) continue;
      const environments = codeSpans(row[1]);
      places.set(name, {
        kind: "variable",
        where:
          environments.length > 0 ? sortedList(environments) : "Repository",
        // Anything else is reported, by the Required column's own text
        required: /^required$/i.test(row[3] ?? "")
          ? true
          : /^optional$/i.test(row[3] ?? "")
            ? false
            : undefined,
        column: row[3] ?? "",
      });
    }
  }
  return places;
}

/**
 * A provider's list names the environments, secrets and variables its page
 * does, in the same places, with the same reviewers and the same required
 * ones, and links headings that are on the page.
 */
function checkList(
  errors: string[],
  files: Files,
  provider: string,
  list: Requirements,
  shared: Set<string>,
): void {
  const listPath = `deploy/${provider}/requirements.json`;
  const pagePath = `docs/deploy/${provider}.md`;
  const page = files.get(pagePath);
  // checkProvider reports a missing page or section
  if (page === undefined) return;
  const lines = page.split("\n");
  checkSteps(errors, listPath, list, pagePath, lines);
  const needs = section(lines, 2, "What this deployment needs");
  if (!needs) return;
  const where = (name: string) =>
    `${pagePath}'s "What this deployment needs" → "${name}"`;

  const environments = table(section(needs, 3, "Environments") ?? []);
  if (environments?.columns.join(" | ") === COLUMNS.environments.join(" | ")) {
    const rows = new Map(
      environments.rows.map((r) => [codeSpans(r[0])[0] ?? r[0], r] as const),
    );
    for (const [name, { reviewers }] of list.environments) {
      const row = rows.get(name);
      if (!row) {
        errors.push(
          `${listPath}: lists the environment \`${name}\`, which ${where("Environments")} doesn't.`,
        );
        continue;
      }
      const page = /^none\b/i.test(row[2] ?? "") ? "none" : "required";
      if (page !== reviewers) {
        errors.push(
          `${listPath}: says \`${name}\` has ${reviewers === "none" ? "no required reviewers" : "required reviewers"}, but ${where("Environments")} says "${row[2] ?? ""}".`,
        );
      }
    }
    for (const name of rows.keys()) {
      if (!list.environments.has(name)) {
        errors.push(
          `${listPath}: doesn't list the environment \`${name}\`, which ${where("Environments")} does. Add it, so the preflight checks it.`,
        );
      }
    }
  }

  const listed = listPlaces(list);
  const documented = pagePlaces(needs, shared);
  for (const [name, place] of listed) {
    const other = documented.get(name);
    if (!other) {
      errors.push(
        shared.has(name)
          ? `${listPath}: lists the shared variable \`${name}\`, which ${SHARED_LIST} already has. Remove it.`
          : `${listPath}: lists \`${name}\`, ${placeName(place)}, which ${pagePath}'s "What this deployment needs" doesn't.`,
      );
    } else if (other.kind !== place.kind || other.where !== place.where) {
      errors.push(
        `${listPath}: has \`${name}\` as ${placeName(place)}, but ${pagePath}'s "What this deployment needs" has it as ${placeName(other)}.`,
      );
    } else if (place.kind === "variable" && other.required === undefined) {
      errors.push(
        `${pagePath}: "What this deployment needs" → "Variables" says \`${name}\`'s Required is "${other.column}". Write "Required" or "Optional", as ${listPath} has it ${place.required ? "required" : "optional"}.`,
      );
    } else if (place.kind === "variable" && other.required !== place.required) {
      errors.push(
        `${listPath}: says \`${name}\` is ${place.required ? "required" : "optional"}, but ${where("Variables")} says it's ${other.required ? "required" : "optional"}.`,
      );
    }
  }
  for (const [name, place] of documented) {
    if (!listed.has(name)) {
      errors.push(
        `${listPath}: doesn't list \`${name}\`, ${placeName(place)}, which ${pagePath}'s "What this deployment needs" does. Add it, so the preflight checks it.`,
      );
    }
  }
}

const PREFLIGHT = /(^|\/)\.github\/actions\/deploy-preflight$/;

/**
 * Each preflight step in a provider's workflows is for that provider and an
 * environment in its list, and, in the environment's job, passes every
 * secret the environment lists through `env:` under its own name.
 */
function checkPreflightSteps(
  errors: string[],
  files: Files,
  provider: string,
  list: Requirements,
): void {
  const readme = ".github/actions/deploy-preflight/README.md";
  for (const [workflow, { jobs = {} }] of workflowsOf(files, provider)) {
    const path = `${WORKFLOWS}${workflow}`;
    for (const [id, job] of Object.entries(jobs)) {
      const stepsOfJob = (job as { steps?: unknown } | null)?.steps;
      if (!Array.isArray(stepsOfJob)) continue;
      for (const step of stepsOfJob as Array<Record<string, unknown> | null>) {
        if (typeof step?.uses !== "string" || !PREFLIGHT.test(step.uses)) {
          continue;
        }
        const at = `${path}: the job \`${id}\`'s preflight step`;
        const inputs = (step.with ?? {}) as Record<string, unknown>;
        if (inputs.provider !== provider) {
          errors.push(
            `${at} has \`provider: ${String(inputs.provider)}\`, not \`${provider}\`.`,
          );
        }
        const environment = String(inputs.environment);
        const own = list.environments.get(environment);
        if (!own) {
          errors.push(
            `${at} has \`environment: ${environment}\`, which isn't in deploy/${provider}/requirements.json (${sortedList(list.environments.keys())}).`,
          );
          continue;
        }
        if (String(inputs["in-environment"] ?? "true") === "false") continue;
        if (jobEnvironment(job) !== environment) {
          errors.push(
            `${at} checks the environment \`${environment}\`, but the job runs in ${jobEnvironment(job) ? `\`${jobEnvironment(job)}\`` : "none"}. Give it the job's environment, or \`in-environment: "false"\`.`,
          );
        }
        const env = (step.env ?? {}) as Record<string, unknown>;
        for (const name of own.secrets.keys()) {
          const value = env[name];
          const passed =
            typeof value === "string" &&
            Array.from(value.matchAll(EXPRESSION)).some((match) =>
              new RegExp(`\\bsecrets\\.${name}\\b`).test(match[1]),
            );
          if (!passed) {
            errors.push(
              `${at} doesn't pass the secret ${name}, which \`${environment}\` lists. Add \`${name}: \${{ secrets.${name} }}\` to its env. See ${readme}.`,
            );
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------- CLI

/** The files the check reads, from a checkout at `root`. */
export function readFiles(root: string): Files {
  const files: Files = new Map();
  const read = (path: string) => {
    try {
      files.set(path, readFileSync(join(root, path), "utf8"));
    } catch {
      // Missing: the check reports what needed it
    }
  };
  const names = (dir: string) => {
    try {
      return readdirSync(join(root, dir));
    } catch {
      return [];
    }
  };
  for (const name of names(WORKFLOWS)) {
    if (name.endsWith(".yml")) read(WORKFLOWS + name);
  }
  for (const name of names("docs/deploy")) {
    if (name.endsWith(".md")) read(`docs/deploy/${name}`);
  }
  read(SHARED_LIST);
  for (const name of names("deploy")) {
    read(`deploy/${name}/README.md`);
    read(`deploy/${name}/requirements.json`);
  }
  return files;
}

if (import.meta.main) {
  const files = readFiles(process.cwd());
  const errors = checkDeployDocs(files);
  const found = providers(files);
  if (errors.length > 0) {
    for (const error of errors) {
      // GitHub Actions shows ::error lines as annotations on the run
      console.error(process.env.GITHUB_ACTIONS ? `::error::${error}` : error);
    }
    console.error(
      `\n${errors.length} problem${errors.length > 1 ? "s" : ""} with the deployment docs. See "Adding a provider" in ${INDEX}.`,
    );
    process.exit(1);
  }
  console.log(
    `The deployment docs match the workflows of ${found.length} provider${found.length === 1 ? "" : "s"}${found.length > 0 ? `: ${found.join(", ")}` : ""}.`,
  );
}
