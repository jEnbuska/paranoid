// Unit tests for check-deploy-docs.mts, run by `pnpm test` with Node's own
// test runner.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkDeployDocs,
  readFiles,
  section,
  usage,
  type Files,
} from "./check-deploy-docs.mts";

const SHARED = `## Shared repository variables

| Variable | What it does | Default | Allowed values |
| --- | --- | --- | --- |
| \`MAX_INVITES\` | Invites. | \`5\` | 1 to 10000 |
`;

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
      - name: Create
        if: vars.ACME_ZONE != ''
        env:
          ACME_TOKEN: \${{ secrets.ACME_TOKEN }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          MAX_INVITES: \${{ inputs.max_invites || vars.MAX_INVITES || '5' }}
          ACME_PLAN: \${{ vars.ACME_PLAN || 'small' }}
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
      - env:
          ACME_TOKEN: \${{ secrets.ACME_TOKEN }}
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

## 1. Fork the repository
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
  ]);
}

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
      "ACME_ZONE",
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

describe("checkDeployDocs", () => {
  it("passes when the docs match the workflows", () => {
    assert.deepEqual(checkDeployDocs(acme()), []);
  });

  it("passes with no providers and an empty providers table", () => {
    const files: Files = new Map([["docs/deploy/README.md", index([])]]);
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
          (files.get(path) ?? "").replace(/^.*ACME_TOKEN.*\n/m, ""),
        );
      }
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

  describe("a provider with no secrets", () => {
    const oidc = () => {
      const files = acme();
      for (const path of [
        ".github/workflows/deploy-acme.yml",
        ".github/workflows/cleanup-acme.yml",
      ]) {
        files.set(
          path,
          (files.get(path) ?? "").replace(/^.*ACME_TOKEN.*\n/m, ""),
        );
      }
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
});
