// Unit tests for check-deploy-docs.mts, run by `pnpm test` with Node's own
// test runner.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  anchors,
  checkDeployDocs,
  readFiles,
  section,
  usage,
  type Files,
} from "./check-deploy-docs.mts";

const SHARED = `## Shared repository variables

| Variable | What it does | Default | Allowed values |
| --- | --- | --- | --- |
| \`MAX_INVITES\` | Invites. | \`5\` | A whole number from 1 to 10000 |
| \`MAX_DEPLOY_COST_USD\` | The cost limit. | \`1\` | An amount with up to two decimals, such as \`2.50\`, below 10000 |
`;

/** deploy/requirements.json, matching SHARED */
const SHARED_LIST = {
  $schema: "./requirements.schema.json",
  guide: "docs/deploy/README.md",
  variables: {
    MAX_INVITES: {
      pattern: "^[0-9]{1,6}$",
      minimum: 1,
      maximum: 10000,
      example: "5",
      step: "#shared-repository-variables",
    },
    MAX_DEPLOY_COST_USD: {
      pattern: "^[0-9]{1,4}(\\.[0-9]{1,2})?$",
      example: "2.50",
      step: "#shared-repository-variables",
    },
  },
};

const CONNECT = "#4-create-the-credentials-and-connect-your-fork";
const role = { required: true, pattern: "^arn:[a-z0-9:/-]+$", step: CONNECT };
const token = { required: true, pattern: "^tok_[a-z]+$", step: CONNECT };
const optional = { pattern: "^[a-z0-9-]+$", step: "#5-optional-settings" };

/** deploy/acme/requirements.json, matching PAGE */
const ACME_LIST = {
  $schema: "../requirements.schema.json",
  guide: "docs/deploy/acme.md",
  environments: {
    acme: {
      reviewers: "required",
      step: CONNECT,
      variables: { ACME_ROLE_ARN: role },
      secrets: { ACME_TOKEN: token },
    },
    "acme-cleanup": {
      reviewers: "none",
      step: CONNECT,
      variables: { ACME_ROLE_ARN: role },
      secrets: { ACME_TOKEN: token },
    },
  },
  variables: {
    ACME_ZONE: { ...optional, environments: ["acme"] },
    ACME_PLAN: { ...optional, environments: ["acme"] },
  },
};

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const index = (rows: string[]) => `# Deploying Paranoid

${SHARED}
## Providers

| Provider | Where it runs | Needs a secret | Deployed for real |
| --- | --- | --- | --- |
${rows.join("\n")}

## Adding a provider

\`\`\`markdown
## Providers

| Not | The | Real | Table |
\`\`\`
`;

const ACME_ROW = "| [Acme](acme.md) | The EU | Yes | Not yet |";
const NO_SECRET_ROW = "| [Acme](acme.md) | The EU | No | Not yet |";

const DEPLOY = `name: Deploy to Acme
on:
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    # vars.IN_A_COMMENT doesn't count
    environment:
      name: acme
      url: \${{ steps.create.outputs.url }}
    steps:
      - name: Run the deploy preflight
        uses: ./.github/actions/deploy-preflight
        with:
          provider: acme
          environment: acme
          vars: \${{ toJSON(vars) }}
        env:
          ACME_TOKEN: \${{ secrets.ACME_TOKEN }}
      - name: Create
        if: vars.ACME_ZONE != ''
        env:
          ACME_TOKEN: \${{ secrets.ACME_TOKEN }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          MAX_INVITES: \${{ inputs.max_invites || vars.MAX_INVITES || '5' }}
          MAX_DEPLOY_COST_USD: \${{ vars.MAX_DEPLOY_COST_USD || '1' }}
          ACME_PLAN: \${{ vars.ACME_PLAN || 'small' }}
          ACME_ROLE_ARN: \${{ vars.ACME_ROLE_ARN }}
        run: echo "vars.NOT_AN_EXPRESSION"
`;

const CLEANUP = `name: Clean up Acme
on:
  schedule:
    - cron: "17 * * * *"
jobs:
  cleanup:
    runs-on: ubuntu-latest
    environment: acme-cleanup
    steps:
      - uses: ./.github/actions/deploy-preflight
        with:
          provider: acme
          environment: acme-cleanup
          owner-only: "false"
          vars: \${{ toJSON(vars) }}
        env:
          ACME_TOKEN: \${{ secrets.ACME_TOKEN }}
      - name: Delete finished servers
        env:
          ACME_TOKEN: \${{ secrets.ACME_TOKEN }}
          ACME_ROLE_ARN: \${{ vars.ACME_ROLE_ARN }}
        run: true
`;

const PAGE = `# Deploy Paranoid to Acme

Back to [the index](README.md).

## What this deployment needs

It also reads the [shared repository variables](README.md#shared-repository-variables).

### Environments

| Environment | Branches | Required reviewers | Used by |
| --- | --- | --- | --- |
| \`acme\` | \`main\` only | You | \`deploy-acme.yml\` |
| \`acme-cleanup\` | \`main\` only | None | \`cleanup-acme.yml\` |

### Secrets

| Secret | Environment | Where its value comes from |
| --- | --- | --- |
| \`ACME_TOKEN\` | \`acme\`, \`acme-cleanup\` | An Acme API token, created in step 3 |

### Variables

| Variable | Set in | What it does | Required | Default | Explained in |
| --- | --- | --- | --- | --- | --- |
| \`ACME_ZONE\` | Repository | The zone. | Optional | | Step 4 |
| \`ACME_PLAN\` | Repository | The plan. | Optional | \`small\` | Step 4 |
| \`ACME_ROLE_ARN\` | \`acme\`, \`acme-cleanup\` | The role each signs in as. | Required | | Step 4 |

## Contents

## Words used in this guide

## 1. Fork the repository

## 2. Sign up for Acme

## 3. Prepare the account

## 4. Create the credentials and connect your fork

## 5. Optional settings

## 6. Start a server

## 7. Stop it, and how it's cleaned up

## Costs

## Acme's extras

## Checking nothing is left

## The credentials

## Troubleshooting

## Removing everything

## Privacy

## What a deploy does
`;

/** A repository whose docs match its one provider, Acme. */
function acme(): Files {
  return new Map([
    [".github/workflows/ci.yml", "name: CI\non: push\njobs: {}\n"],
    [".github/workflows/deploy-acme.yml", DEPLOY],
    [".github/workflows/cleanup-acme.yml", CLEANUP],
    ["docs/deploy/README.md", index([ACME_ROW])],
    ["docs/deploy/acme.md", PAGE],
    ["deploy/acme/README.md", "See [Acme](../../docs/deploy/acme.md).\n"],
    ["deploy/requirements.json", json(SHARED_LIST)],
    ["deploy/acme/requirements.json", json(ACME_LIST)],
  ]);
}

type Json = Record<string, any>;

/** Changes a preflight list's JSON in place. */
const editList = (files: Files, path: string, change: (list: Json) => void) => {
  const list = JSON.parse(files.get(path) ?? "{}") as Json;
  change(list);
  files.set(path, json(list));
  return files;
};

const edit = (files: Files, path: string, from: string, to: string) => {
  const text = files.get(path) ?? "";
  assert.ok(text.includes(from), `${path} has no "${from}"`);
  files.set(path, text.replace(from, to));
  return files;
};

const expectError = (files: Files, pattern: RegExp) => {
  const errors = checkDeployDocs(files);
  assert.ok(
    errors.some((error) => pattern.test(error)),
    `expected an error matching ${pattern}, got:\n${errors.join("\n") || "none"}`,
  );
};

describe("usage", () => {
  it("finds environments, secrets and variables per workflow", () => {
    const use = usage(acme(), "acme");
    assert.deepEqual(use.workflows, ["cleanup-acme.yml", "deploy-acme.yml"]);
    assert.deepEqual(
      [...use.environments].map(([name, by]) => [name, [...by]]),
      [
        ["acme", ["deploy-acme.yml"]],
        ["acme-cleanup", ["cleanup-acme.yml"]],
      ],
    );
    assert.deepEqual([...use.secrets.keys()], ["ACME_TOKEN"]);
    assert.deepEqual(
      [...(use.secrets.get("ACME_TOKEN")?.environments ?? [])].sort(),
      ["acme", "acme-cleanup"],
    );
    // Not the comment, the plain string or GITHUB_TOKEN
    assert.deepEqual([...use.variables.keys()].sort(), [
      "ACME_PLAN",
      "ACME_ROLE_ARN",
      "ACME_ZONE",
      "MAX_DEPLOY_COST_USD",
      "MAX_INVITES",
    ]);
  });
});

describe("section", () => {
  it("ignores headings in code blocks", () => {
    const lines = "## A\n```\n## B\n```\ntext\n## B\nb\n".split("\n");
    assert.deepEqual(section(lines, 2, "B"), ["b", ""]);
  });
});

describe("anchors", () => {
  it("gives headings GitHub's anchors, numbering repeats", () => {
    const lines =
      "# Title\n## 5. Optional settings\n```\n## Not a heading\n```\n### Who's it for?\n## Title\n".split(
        "\n",
      );
    assert.deepEqual(
      [...anchors(lines)],
      ["#title", "#5-optional-settings", "#whos-it-for", "#title-1"],
    );
  });
});

describe("checkDeployDocs", () => {
  it("passes when the docs match the workflows", () => {
    assert.deepEqual(checkDeployDocs(acme()), []);
  });

  it("passes with no providers and an empty providers table", () => {
    const files: Files = new Map([
      ["docs/deploy/README.md", index([])],
      ["deploy/requirements.json", json(SHARED_LIST)],
    ]);
    assert.deepEqual(checkDeployDocs(files), []);
  });

  it("leaves a provider's list alone until its workflows land", () => {
    const files: Files = new Map([
      ["docs/deploy/README.md", index([])],
      ["deploy/requirements.json", json(SHARED_LIST)],
      ["deploy/acme/requirements.json", json(ACME_LIST)],
    ]);
    assert.deepEqual(checkDeployDocs(files), []);
  });

  it("passes on this repository", () => {
    assert.deepEqual(checkDeployDocs(readFiles(process.cwd())), []);
  });

  describe("a missing name", () => {
    it("fails on a variable the page doesn't list", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "| `ACME_PLAN` | Repository | The plan. | Optional | `small` | Step 4 |\n",
        "",
      );
      expectError(
        files,
        /^docs\/deploy\/acme\.md: `deploy-acme\.yml` uses vars\.ACME_PLAN, which .*Variables.* doesn't list\.$/,
      );
    });

    it("fails on a secret the page doesn't list", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "| `ACME_TOKEN` | `acme`, `acme-cleanup` | An Acme API token, created in step 3 |\n",
        "",
      );
      expectError(files, /secrets\.ACME_TOKEN, which .*Secrets.* doesn't list/);
    });

    it("fails on a secret listed in the wrong environments", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "`acme`, `acme-cleanup` |",
        "`acme` |",
      );
      expectError(
        files,
        /`ACME_TOKEN` is in `acme`, but .* `acme`, `acme-cleanup`/,
      );
    });

    it("fails on an environment the page doesn't list", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "| `acme-cleanup` | `main` only | None | `cleanup-acme.yml` |\n",
        "",
      );
      expectError(
        files,
        /the environment `acme-cleanup`, which .* doesn't list/,
      );
    });

    it("fails on an environment's workflows that are out of date", () => {
      const files = acme();
      files.set(".github/workflows/stop-acme.yml", CLEANUP);
      expectError(
        files,
        /`acme-cleanup` is used by `cleanup-acme\.yml`, but it's used by `cleanup-acme\.yml`, `stop-acme\.yml`/,
      );
    });

    it("fails on a variable every provider uses that isn't shared", () => {
      const files = acme();
      files.set(
        ".github/workflows/deploy-zeta.yml",
        DEPLOY.replaceAll("acme", "zeta"),
      );
      expectError(files, /every provider uses vars\.ACME_PLAN/);
    });
  });

  describe("a stale name", () => {
    it("fails on a variable no workflow uses", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "| `ACME_ZONE` |",
        "| `ACME_REGION` |",
      );
      expectError(
        files,
        /lists `ACME_REGION`, which no workflow of acme uses any more/,
      );
    });

    it("fails on a secret no workflow uses", () => {
      const files = acme();
      for (const path of [
        ".github/workflows/deploy-acme.yml",
        ".github/workflows/cleanup-acme.yml",
      ]) {
        files.set(
          path,
          (files.get(path) ?? "").replace(/^.*ACME_TOKEN.*\n/gm, ""),
        );
      }
      editList(files, "deploy/acme/requirements.json", (list) => {
        for (const environment of Object.values(list.environments)) {
          delete (environment as Json).secrets;
        }
      });
      files.set("docs/deploy/README.md", index([NO_SECRET_ROW]));
      expectError(files, /lists `ACME_TOKEN`, which no workflow of acme uses/);
    });

    it("fails on an environment no workflow uses", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "| `acme-cleanup` | `main` only | None | `cleanup-acme.yml` |\n",
        "| `acme-cleanup` | `main` only | None | `cleanup-acme.yml` |\n| `acme-old` | `main` only | None | |\n",
      );
      expectError(files, /lists `acme-old`, which no workflow of acme uses/);
    });

    it("fails on a shared variable listed on a provider's page", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "| `ACME_ZONE` |",
        "| `MAX_INVITES` | Repository | Invites. | Optional | `5` | Step 4 |\n| `ACME_ZONE` |",
      );
      expectError(files, /lists `MAX_INVITES`, which is shared/);
    });

    it("fails on a shared variable a provider doesn't use", () => {
      const files = edit(
        acme(),
        ".github/workflows/deploy-acme.yml",
        "vars.MAX_INVITES",
        "'5'",
      );
      expectError(
        files,
        /`MAX_INVITES` is in the shared table, but acme's workflows don't use it/,
      );
    });

    it("fails on a provider row with no workflows", () => {
      const files: Files = new Map([
        ["docs/deploy/README.md", index([ACME_ROW])],
      ]);
      expectError(files, /lists acme, which has no .*deploy-acme\.yml/);
    });
  });

  describe("a missing page", () => {
    it("fails on a provider with no page", () => {
      const files = acme();
      files.delete("docs/deploy/acme.md");
      expectError(files, /^docs\/deploy\/acme\.md: is missing\./);
    });

    it("fails on a provider with no folder README", () => {
      const files = acme();
      files.delete("deploy/acme/README.md");
      expectError(files, /^deploy\/acme\/README\.md: is missing\./);
    });

    it("fails on a folder README that doesn't link the page", () => {
      const files = acme();
      files.set("deploy/acme/README.md", "Acme's scripts.\n");
      expectError(files, /deploy\/acme\/README\.md: doesn't link/);
    });

    it("fails on a provider with no row in the index", () => {
      const files = acme();
      files.set("docs/deploy/README.md", index([]));
      expectError(files, /Providers table has no row for acme/);
    });

    it("fails on a page with no What this deployment needs", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "## What this deployment needs",
        "## What it needs",
      );
      expectError(files, /has no "## What this deployment needs" section/);
    });

    it("fails on What this deployment needs after the first step", () => {
      const files = acme();
      files.set(
        "docs/deploy/acme.md",
        PAGE.replace("## 1. Fork the repository\n", "").replace(
          "## What this deployment needs",
          "## 1. Fork the repository\n\n## What this deployment needs",
        ),
      );
      expectError(files, /comes after the first step/);
    });

    it("fails on a table with other columns", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "| Secret | Environment | Where its value comes from |",
        "| Secret | Environment |",
      );
      expectError(files, /Secrets.*'s table has the columns/);
    });

    it("fails on a page with no provider", () => {
      const files = acme();
      files.set("docs/deploy/zeta.md", PAGE);
      expectError(
        files,
        /^docs\/deploy\/zeta\.md: there's no .*deploy-zeta\.yml/,
      );
    });
  });

  describe("where settings live", () => {
    const ROLE_ROW =
      "| `ACME_ROLE_ARN` | `acme`, `acme-cleanup` | The role each signs in as. | Required | | Step 4 |";

    it("fails on an identity value that's a repository variable", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        ROLE_ROW,
        "| `ACME_ROLE_ARN` | Repository | The role. | Required | | Step 4 |",
      );
      expectError(
        files,
        /`ACME_ROLE_ARN` is a repository variable, but it's an identity value/,
      );
    });

    it("fails on a tuning value that's an environment variable", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "| `ACME_PLAN` | Repository |",
        "| `ACME_PLAN` | `acme` |",
      );
      expectError(files, /`ACME_PLAN` is in `acme`, but it's a tuning value/);
    });

    it("fails on an environment variable listed in the wrong environments", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        ROLE_ROW,
        ROLE_ROW.replace("`acme`, `acme-cleanup`", "`acme`"),
      );
      expectError(
        files,
        /`ACME_ROLE_ARN` is in `acme`, but the workflows read it in `acme`, `acme-cleanup`/,
      );
    });

    it("fails on a Set in that's neither Repository nor environments", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "| `ACME_PLAN` | Repository |",
        "| `ACME_PLAN` | Anywhere |",
      );
      expectError(files, /`ACME_PLAN` is set in "Anywhere"/);
    });

    it("fails on an environment variable read in a job without it", () => {
      const files = edit(
        acme(),
        ".github/workflows/cleanup-acme.yml",
        "jobs:\n",
        "jobs:\n  start:\n    if: vars.ACME_ROLE_ARN != ''\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n",
      );
      expectError(
        files,
        /`cleanup-acme\.yml` reads vars\.ACME_ROLE_ARN outside an environment/,
      );
    });

    it("counts a job's own if: as outside its environment", () => {
      const files = edit(
        acme(),
        ".github/workflows/cleanup-acme.yml",
        "    environment: acme-cleanup\n",
        "    environment: acme-cleanup\n    if: vars.ACME_ROLE_ARN != ''\n",
      );
      expectError(files, /reads vars\.ACME_ROLE_ARN outside an environment/);
    });

    it("fails on a secret read outside an environment", () => {
      const files = edit(
        acme(),
        ".github/workflows/cleanup-acme.yml",
        "jobs:\n",
        "env:\n  ACME_TOKEN: ${{ secrets.ACME_TOKEN }}\njobs:\n",
      );
      expectError(
        files,
        /`cleanup-acme\.yml` reads secrets\.ACME_TOKEN outside an environment/,
      );
    });

    it("fails on a second name for the cleanup's role", () => {
      const files = acme();
      for (const path of [
        ".github/workflows/cleanup-acme.yml",
        "docs/deploy/acme.md",
      ]) {
        files.set(
          path,
          (files.get(path) ?? "").replaceAll(
            "ACME_ROLE_ARN",
            "ACME_CLEANUP_ROLE_ARN",
          ),
        );
      }
      files.set(
        "docs/deploy/acme.md",
        (files.get("docs/deploy/acme.md") ?? "").replace(
          "| `ACME_CLEANUP_ROLE_ARN` | `acme`, `acme-cleanup` |",
          "| `ACME_ROLE_ARN` | `acme` | The role. | Required | | Step 4 |\n| `ACME_CLEANUP_ROLE_ARN` | `acme-cleanup` |",
        ),
      );
      editList(files, "deploy/acme/requirements.json", (list) => {
        const cleanup = list.environments["acme-cleanup"].variables;
        cleanup.ACME_CLEANUP_ROLE_ARN = cleanup.ACME_ROLE_ARN;
        delete cleanup.ACME_ROLE_ARN;
      });
      const errors = checkDeployDocs(files);
      assert.deepEqual(
        errors.filter((error) => !/second name/.test(error)),
        [],
      );
      expectError(
        files,
        /`ACME_CLEANUP_ROLE_ARN` is a second name for one role/,
      );
    });

    it("fails on a token in a variable", () => {
      const files = edit(
        acme(),
        ".github/workflows/deploy-acme.yml",
        "secrets.ACME_TOKEN",
        "vars.ACME_TOKEN",
      );
      expectError(files, /reads the token vars\.ACME_TOKEN/);
    });
  });

  describe("the guide's headings", () => {
    it("passes with steps folded together", () => {
      const files = acme();
      const page = (files.get("docs/deploy/acme.md") ?? "")
        .replace("## 3. Prepare the account\n\n", "")
        .replace("## 4. Create", "## 3. Create")
        .replace("## 5. Optional", "## 4. Optional")
        .replace("## 6. Start", "## 5. Start")
        .replace("## 7. Stop", "## 6. Stop");
      files.set("docs/deploy/acme.md", page);
      // The list links the renumbered headings
      files.set(
        "deploy/acme/requirements.json",
        (files.get("deploy/acme/requirements.json") ?? "")
          .replaceAll("#4-create", "#3-create")
          .replaceAll("#5-optional", "#4-optional"),
      );
      assert.deepEqual(checkDeployDocs(files), []);
    });

    it("fails on a missing section", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "## The credentials\n",
        "## No secrets\n",
      );
      expectError(files, /has no "## The credentials" section/);
    });

    it("fails on sections out of order", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "## Privacy\n\n## What a deploy does\n",
        "## What a deploy does\n\n## Privacy\n",
      );
      expectError(files, /"What a deploy does" comes before "Privacy"/);
    });

    it("fails on a section before the last step", () => {
      const files = edit(acme(), "docs/deploy/acme.md", "## Costs\n", "");
      files.set(
        "docs/deploy/acme.md",
        (files.get("docs/deploy/acme.md") ?? "").replace(
          "## 6. Start",
          "## Costs\n\n## 6. Start",
        ),
      );
      expectError(files, /"Costs" comes before the last step/);
    });

    it("fails on steps that aren't numbered in order", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "## 3. Prepare",
        "## 4. Prepare",
      );
      expectError(files, /the step "4\. Prepare the account" is number 3/);
    });

    it("fails on a step with another title", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "## 7. Stop it, and how it's cleaned up",
        "## 7. Delete the server",
      );
      expectError(files, /"7\. Delete the server" should start with "Stop it"/);
    });
  });

  describe("a provider with no secrets", () => {
    const oidc = () => {
      const files = acme();
      for (const path of [
        ".github/workflows/deploy-acme.yml",
        ".github/workflows/cleanup-acme.yml",
      ]) {
        files.set(
          path,
          (files.get(path) ?? "").replace(/^.*ACME_TOKEN.*\n/gm, ""),
        );
      }
      editList(files, "deploy/acme/requirements.json", (list) => {
        for (const environment of Object.values(list.environments)) {
          delete (environment as Json).secrets;
        }
      });
      files.set("docs/deploy/README.md", index([NO_SECRET_ROW]));
      const page = files.get("docs/deploy/acme.md") ?? "";
      files.set(
        "docs/deploy/acme.md",
        page.replace(
          /### Secrets\n[\s\S]*?(?=### Variables)/,
          "### Secrets\n\nNo secrets: the workflows sign in with GitHub's OIDC token.\n\n",
        ),
      );
      return files;
    };

    it("passes when the page says so", () => {
      assert.deepEqual(checkDeployDocs(oidc()), []);
    });

    it("fails when the page doesn't say so", () => {
      const files = edit(
        oidc(),
        "docs/deploy/acme.md",
        "No secrets:",
        "Nothing:",
      );
      expectError(files, /Say "No secrets"/);
    });

    it("fails when the index says it needs one", () => {
      const files = oidc();
      files.set("docs/deploy/README.md", index([ACME_ROW]));
      expectError(files, /"Needs a secret" says "Yes"/);
    });
  });

  describe("a provider's preflight list", () => {
    const LIST = "deploy/acme/requirements.json";
    const acmeList = (change: (list: Json) => void) =>
      editList(acme(), LIST, change);

    it("fails on a provider with workflows and no list", () => {
      const files = acme();
      files.delete(LIST);
      expectError(
        files,
        /^deploy\/acme\/requirements\.json: is missing\. acme has workflows/,
      );
    });

    it("fails on a list that can't be read", () => {
      const files = acme();
      files.set(LIST, "{");
      expectError(files, /^deploy\/acme\/requirements\.json: .*JSON/);
    });

    it("fails on a name the list has and the page doesn't", () => {
      const files = acmeList((list) => {
        list.variables.ACME_SIZE = optional;
      });
      expectError(
        files,
        /requirements\.json: lists `ACME_SIZE`, a repository variable, which docs\/deploy\/acme\.md's "What this deployment needs" doesn't\.$/,
      );
    });

    it("fails on a name the page has and the list doesn't", () => {
      const files = acmeList((list) => {
        delete list.variables.ACME_PLAN;
      });
      expectError(
        files,
        /requirements\.json: doesn't list `ACME_PLAN`, a repository variable, which .* does\. Add it/,
      );
    });

    it("fails on a secret the list doesn't have", () => {
      const files = acmeList((list) => {
        delete list.environments.acme.secrets;
        delete list.environments["acme-cleanup"].secrets;
      });
      expectError(
        files,
        /doesn't list `ACME_TOKEN`, a secret in `acme`, `acme-cleanup`/,
      );
    });

    it("fails on a shared variable in the list", () => {
      const files = acmeList((list) => {
        list.variables.MAX_INVITES = optional;
      });
      expectError(
        files,
        /lists the shared variable `MAX_INVITES`, which deploy\/requirements\.json already has/,
      );
    });

    it("fails on a variable in other environments than the page's", () => {
      const files = acmeList((list) => {
        delete list.environments["acme-cleanup"].variables;
      });
      expectError(
        files,
        /has `ACME_ROLE_ARN` as a variable in `acme`, but .* has it as a variable in `acme`, `acme-cleanup`/,
      );
    });

    it("fails on a repository variable the page sets in an environment", () => {
      const files = acmeList((list) => {
        list.environments.acme.variables.ACME_ZONE = optional;
        delete list.variables.ACME_ZONE;
      });
      expectError(
        files,
        /has `ACME_ZONE` as a variable in `acme`, but .* has it as a repository variable/,
      );
    });

    it("fails on a secret the list has as a variable", () => {
      const files = acmeList((list) => {
        for (const name of ["acme", "acme-cleanup"]) {
          const environment = list.environments[name];
          delete environment.secrets;
          environment.variables.ACME_TOKEN = token;
        }
      });
      expectError(
        files,
        /has `ACME_TOKEN` as a variable in `acme`, `acme-cleanup`, but .* has it as a secret in `acme`, `acme-cleanup`/,
      );
    });

    it("fails on a variable that's required in one and optional in the other", () => {
      const files = acmeList((list) => {
        list.variables.ACME_PLAN.required = true;
      });
      expectError(
        files,
        /says `ACME_PLAN` is required, but .*"Variables" says it's optional/,
      );
    });

    it("fails on a Required column that's neither Required nor Optional", () => {
      const files = edit(
        acme(),
        "docs/deploy/acme.md",
        "| The role each signs in as. | Required |",
        "| The role each signs in as. | Yes |",
      );
      expectError(
        files,
        /says `ACME_ROLE_ARN`'s Required is "Yes"\. Write "Required" or "Optional"/,
      );
    });

    it("fails on an environment the page has and the list doesn't", () => {
      const files = acmeList((list) => {
        delete list.environments["acme-cleanup"];
      });
      expectError(
        files,
        /requirements\.json: doesn't list the environment `acme-cleanup`, which .*"Environments" does/,
      );
    });

    it("fails on an environment the list has and the page doesn't", () => {
      const files = acmeList((list) => {
        list.environments["acme-old"] = { reviewers: "none", step: CONNECT };
      });
      expectError(
        files,
        /lists the environment `acme-old`, which .*"Environments" doesn't/,
      );
    });

    it("fails on reviewers that differ from the page's", () => {
      const files = acmeList((list) => {
        list.environments["acme-cleanup"].reviewers = "required";
      });
      expectError(
        files,
        /says `acme-cleanup` has required reviewers, but .*"Environments" says "None"/,
      );
    });

    it("fails on a step that isn't a heading in the guide", () => {
      const files = acmeList((list) => {
        list.variables.ACME_ZONE.step = "#6-optional-settings";
      });
      expectError(
        files,
        /^deploy\/acme\/requirements\.json: variables\.ACME_ZONE\.step links docs\/deploy\/acme\.md#6-optional-settings, which isn't a heading there/,
      );
    });

    it("fails on an environment's step that isn't a heading", () => {
      const files = acmeList((list) => {
        list.environments.acme.secrets.ACME_TOKEN.step = "#3-create-the-token";
      });
      expectError(
        files,
        /environments\.acme\.secrets\.ACME_TOKEN\.step links .*#3-create-the-token/,
      );
    });
  });

  describe("a preflight step", () => {
    const DEPLOY_PATH = ".github/workflows/deploy-acme.yml";
    const CLEANUP_PATH = ".github/workflows/cleanup-acme.yml";

    it("fails on a secret the step doesn't pass", () => {
      const files = edit(
        acme(),
        CLEANUP_PATH,
        "          vars: ${{ toJSON(vars) }}\n        env:\n          ACME_TOKEN: ${{ secrets.ACME_TOKEN }}\n",
        "          vars: ${{ toJSON(vars) }}\n",
      );
      expectError(
        files,
        /^\.github\/workflows\/cleanup-acme\.yml: the job `cleanup`'s preflight step doesn't pass the secret ACME_TOKEN, which `acme-cleanup` lists/,
      );
    });

    it("fails on a secret passed under another name", () => {
      const files = edit(
        acme(),
        DEPLOY_PATH,
        "          ACME_TOKEN: ${{ secrets.ACME_TOKEN }}\n      - name: Create",
        "          TOKEN: ${{ secrets.ACME_TOKEN }}\n      - name: Create",
      );
      expectError(files, /`deploy`'s preflight step doesn't pass the secret/);
    });

    it("needs no secrets outside the environment", () => {
      const files = edit(
        acme(),
        DEPLOY_PATH,
        "jobs:\n",
        'jobs:\n  preflight:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/deploy-preflight\n        with:\n          provider: acme\n          environment: acme\n          in-environment: "false"\n',
      );
      assert.deepEqual(checkDeployDocs(files), []);
    });

    it("fails on another provider", () => {
      const files = edit(
        acme(),
        DEPLOY_PATH,
        "provider: acme",
        "provider: zeta",
      );
      expectError(files, /preflight step has `provider: zeta`, not `acme`/);
    });

    it("fails on an environment the list doesn't have", () => {
      const files = edit(
        acme(),
        DEPLOY_PATH,
        "environment: acme\n",
        "environment: acme-prod\n",
      );
      expectError(
        files,
        /has `environment: acme-prod`, which isn't in deploy\/acme\/requirements\.json/,
      );
    });

    it("fails on an environment that isn't the job's", () => {
      const files = edit(
        acme(),
        DEPLOY_PATH,
        "          environment: acme\n",
        "          environment: acme-cleanup\n",
      );
      expectError(
        files,
        /checks the environment `acme-cleanup`, but the job runs in `acme`/,
      );
    });
  });

  describe("the shared list", () => {
    const LIST = "deploy/requirements.json";
    const sharedList = (change: (list: Json) => void) =>
      editList(acme(), LIST, change);

    it("fails when it's missing", () => {
      const files = acme();
      files.delete(LIST);
      expectError(files, /^deploy\/requirements\.json: is missing\./);
    });

    it("fails on a variable the shared table lists and it doesn't", () => {
      const files = sharedList((list) => {
        delete list.variables.MAX_INVITES;
      });
      expectError(
        files,
        /the shared table lists `MAX_INVITES`, which deploy\/requirements\.json doesn't/,
      );
    });

    it("fails on a variable it lists and the shared table doesn't", () => {
      const files = sharedList((list) => {
        list.variables.MAX_SERVERS = { pattern: "^[0-9]$", step: "#providers" };
      });
      expectError(
        files,
        /^deploy\/requirements\.json: lists `MAX_SERVERS`, which the shared table .* doesn't/,
      );
    });

    it("fails on a step that isn't a heading in the index", () => {
      const files = sharedList((list) => {
        list.variables.MAX_INVITES.step = "#the-invites";
      });
      expectError(
        files,
        /variables\.MAX_INVITES\.step links docs\/deploy\/README\.md#the-invites, which isn't a heading there/,
      );
    });

    it("fails on a default its rule doesn't allow", () => {
      const files = sharedList((list) => {
        list.variables.MAX_INVITES.minimum = 10;
        list.variables.MAX_INVITES.example = "10";
      });
      expectError(
        files,
        /default for `MAX_INVITES`, `5`, breaks its rule .*: it isn't from 10 to 10000/,
      );
    });

    it("fails on a range that differs", () => {
      const files = sharedList((list) => {
        list.variables.MAX_INVITES.maximum = 100;
      });
      expectError(
        files,
        /Allowed values for `MAX_INVITES` says "from 1 to 10000", but deploy\/requirements\.json's range is from 1 to 100/,
      );
    });

    it("fails on a range the rule doesn't have", () => {
      const files = sharedList((list) => {
        delete list.variables.MAX_INVITES.minimum;
        delete list.variables.MAX_INVITES.maximum;
      });
      expectError(
        files,
        /`MAX_INVITES` says "from 1 to 10000", but deploy\/requirements\.json has no range/,
      );
    });

    it("fails on a whole number whose rule allows decimals", () => {
      const files = sharedList((list) => {
        list.variables.MAX_INVITES.pattern = "^[0-9.]{1,6}$";
      });
      expectError(
        files,
        /says "whole number", but deploy\/requirements\.json allows `1\.5`/,
      );
    });

    it("fails on an example its rule doesn't allow", () => {
      const files = sharedList((list) => {
        list.variables.MAX_DEPLOY_COST_USD.pattern = "^[0-9]{1,4}$";
        list.variables.MAX_DEPLOY_COST_USD.example = "2";
      });
      expectError(
        files,
        /`MAX_DEPLOY_COST_USD` says "`2\.50`", but deploy\/requirements\.json doesn't allow `2\.50`/,
      );
    });

    it("fails on a limit that differs", () => {
      const files = sharedList((list) => {
        list.variables.MAX_DEPLOY_COST_USD.pattern =
          "^[0-9]{1,3}(\\.[0-9]{1,2})?$";
      });
      expectError(
        files,
        /says "below 10000", but deploy\/requirements\.json doesn't allow `9999`/,
      );
    });

    it("fails on decimals that differ", () => {
      const files = sharedList((list) => {
        list.variables.MAX_DEPLOY_COST_USD.pattern =
          "^[0-9]{1,4}(\\.[0-9]{1,3})?$";
      });
      expectError(
        files,
        /says "up to two decimals", but deploy\/requirements\.json allows `1\.555`/,
      );
    });
  });
});
