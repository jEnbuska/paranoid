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
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/** Repository files by their path from the root, with `/` separators. */
export type Files = Map<string, string>;

const INDEX = "docs/deploy/README.md";
const WORKFLOWS = ".github/workflows/";

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

/** What one provider's workflows use from GitHub. */
export function usage(files: Files, provider: string): Usage {
  const result: Usage = {
    workflows: [],
    environments: new Map(),
    secrets: new Map(),
    variables: new Map(),
  };
  for (const [path, text] of files) {
    if (!path.startsWith(WORKFLOWS) || !path.endsWith(`-${provider}.yml`)) {
      continue;
    }
    const workflow = path.slice(WORKFLOWS.length);
    result.workflows.push(workflow);
    const { jobs = {}, ...top } = (parse(text) ?? {}) as {
      jobs?: Record<string, unknown>;
    };
    // [names, environment]: the workflow's own keys have no environment
    const parts: Array<[unknown, string | undefined]> = [[top, undefined]];
    for (const job of Object.values(jobs)) {
      const raw = (job as { environment?: unknown } | null)?.environment;
      const environment =
        typeof raw === "string"
          ? raw
          : typeof (raw as { name?: unknown } | undefined)?.name === "string"
            ? (raw as { name: string }).name
            : undefined;
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
  for (const name of names("deploy")) read(`deploy/${name}/README.md`);
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
