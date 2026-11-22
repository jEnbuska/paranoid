// Unit tests for release-checks.sh, run by `pnpm test` with Node's own test
// runner. The script runs for real, with bash and jq, against a fake `gh` on
// PATH that answers each call from a list of routes, so every check can be
// made to pass or fail without GitHub.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const SCRIPT = path.join(import.meta.dirname, "release-checks.sh");
const HEAD = "abc1234";
const PR = 200;

// Answers a call with the first route whose `match` is part of its arguments,
// applying --jq the way gh does.
const FAKE_GH = `#!/usr/bin/env bash
set -euo pipefail
args="$*"
printf '%s\\n' "$args" >>"$FAKE_GH_LOG"
jq_expr=""
prev=""
for a in "$@"; do
  if [ "$prev" = --jq ]; then jq_expr=$a; fi
  prev=$a
done
route=$(jq -c --arg args "$args" \\
  'first(.[] | select(.match as $m | $args | contains($m))) // empty' "$FAKE_GH_ROUTES")
if [ -z "$route" ]; then
  echo "fake gh: no route for: $args" >&2
  exit 99
fi
code=$(jq -r '.exit // 0' <<<"$route")
if [ "$code" != 0 ] && [ "$code" != 8 ]; then
  jq -r '.stderr // "gh failed"' <<<"$route" >&2
  exit "$code"
fi
body=$(jq -c '.body' <<<"$route")
if [ -n "$jq_expr" ]; then jq -r "$jq_expr" <<<"$body"; else printf '%s\\n' "$body"; fi
exit "$code"
`;

type Route = { body?: unknown; exit?: number; stderr?: string };

const codeqlRun = (status: string, conclusion: string | null) => ({
  check_runs: [
    {
      name: "CodeQL",
      status,
      conclusion,
      app: { slug: "github-advanced-security" },
      html_url: "https://github.com/o/r/runs/1",
    },
  ],
});

const alert = (number: number, rule: Record<string, unknown>) => ({
  number,
  html_url: `https://github.com/o/r/security/code-scanning/${number}`,
  rule,
});

// A release that passes every check. Keys are matched in this order.
const DEFAULTS: Record<string, Route> = {
  "pr list": {
    body: [
      {
        number: PR,
        url: `https://github.com/o/r/pull/${PR}`,
        headRefOid: HEAD,
        isDraft: false,
        isCrossRepository: false,
      },
    ],
  },
  "branches/dev": { body: { commit: { sha: HEAD } } },
  "rules/branches/main": {
    body: [
      {
        type: "required_status_checks",
        parameters: {
          required_status_checks: [{ context: "Required checks" }],
        },
      },
    ],
  },
  "pr checks": {
    body: [
      {
        name: "Required checks",
        bucket: "pass",
        state: "SUCCESS",
        event: "pull_request",
        link: "https://github.com/o/r/actions/runs/1",
      },
    ],
  },
  "check-runs?check_name=CodeQL": { body: codeqlRun("completed", "success") },
  "code-scanning/analyses": {
    body: [
      { category: "/language:actions", error: "" },
      { category: "/language:javascript-typescript", error: "" },
    ],
  },
  "code-scanning/alerts": { body: [] },
  [`compare/main...${HEAD}`]: {
    body: {
      status: "ahead",
      ahead_by: 1,
      commits: [{ commit: { message: "1 Something\n\nBody" } }],
    },
  },
};

// Runs the script without blocking, so the tests can run at the same time.
function bash(env: NodeJS.ProcessEnv) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn("bash", [SCRIPT], { env });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
      child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
      child.on("error", reject);
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    },
  );
}

async function run(overrides: Record<string, Route> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "release-checks-"));
  writeFileSync(path.join(dir, "gh"), FAKE_GH);
  chmodSync(path.join(dir, "gh"), 0o755);
  const routes = Object.entries({ ...DEFAULTS, ...overrides }).map(
    ([match, route]) => ({ match, ...route }),
  );
  writeFileSync(path.join(dir, "routes.json"), JSON.stringify(routes));
  const log = path.join(dir, "calls.log");
  writeFileSync(log, "");
  const output = path.join(dir, "output");
  writeFileSync(output, "");
  // CI sets these for its own steps, so they're replaced, not inherited.
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of ["EXPECTED_SHA", "GITHUB_STEP_SUMMARY"]) delete env[name];
  const result = await bash({
    ...env,
    PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
    GITHUB_REPOSITORY: "o/r",
    GITHUB_OUTPUT: output,
    FAKE_GH_ROUTES: path.join(dir, "routes.json"),
    FAKE_GH_LOG: log,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    calls: readFileSync(log, "utf8").trim().split("\n"),
    output: readFileSync(output, "utf8"),
  };
}

function assertFails(
  result: Awaited<ReturnType<typeof run>>,
  check: number,
  pattern: RegExp,
) {
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(`::error::Check ${check} failed: `));
  assert.match(result.stdout, pattern);
}

describe("release-checks.sh", { concurrency: true }, () => {
  it("passes every check and writes the outputs", async () => {
    const result = await run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const check of [1, 2, 3, 4, 5]) {
      assert.match(result.stdout, new RegExp(`Check ${check} passed`));
    }
    assert.match(result.output, new RegExp(`^sha=${HEAD}$`, "m"));
    assert.match(result.output, /^commits<<END_OF_COMMITS\n1 Something\n/m);
  });

  it("stops at check 1 without a release PR", async () => {
    assertFails(await run({ "pr list": { body: [] } }), 1, /no open PR/);
  });
});

describe("release-checks.sh check 4, CodeQL", { concurrency: true }, () => {
  it("reads the release PR's head commit and ref", async () => {
    const { calls } = await run();
    const ref = `ref=refs/pull/${PR}/head`;
    assert.ok(
      calls.some((c) => c.includes(`repos/o/r/commits/${HEAD}/check-runs`)),
    );
    assert.ok(
      calls.some(
        (c) =>
          c.includes("code-scanning/analyses") &&
          c.includes(ref) &&
          c.includes(`sha=${HEAD}`),
      ),
    );
    assert.ok(
      calls.some(
        (c) =>
          c.includes("code-scanning/alerts") &&
          c.includes(ref) &&
          c.includes("state=open") &&
          c.includes("--paginate"),
      ),
    );
  });

  it("fails when the CodeQL check hasn't run", async () => {
    const result = await run({
      "check-runs?check_name=CodeQL": { body: { check_runs: [] } },
    });
    assertFails(result, 4, /CodeQL check hasn't run/);
  });

  it("ignores a CodeQL check from anything but GitHub Advanced Security", async () => {
    const fake = codeqlRun("completed", "success");
    fake.check_runs[0].app.slug = "github-actions";
    const result = await run({
      "check-runs?check_name=CodeQL": { body: fake },
    });
    assertFails(result, 4, /CodeQL check hasn't run/);
  });

  // While the analyses run, the CodeQL check briefly shows as skipped.
  for (const [status, conclusion] of [
    ["completed", "skipped"],
    ["completed", "neutral"],
    ["completed", "failure"],
    ["in_progress", null],
    ["queued", null],
  ] as const) {
    it(`fails when the CodeQL check is ${conclusion ?? status}`, async () => {
      const result = await run({
        "check-runs?check_name=CodeQL": { body: codeqlRun(status, conclusion) },
      });
      assertFails(
        result,
        4,
        new RegExp(`CodeQL check isn't passing .*: ${conclusion ?? status} `),
      );
    });
  }

  it("fails when CodeQL has no analysis of the head commit", async () => {
    // The alerts list is empty for a ref that was never analysed.
    const result = await run({ "code-scanning/analyses": { body: [] } });
    assertFails(result, 4, /no analysis of abc1234/);
  });

  it("fails when an analysis failed", async () => {
    const result = await run({
      "code-scanning/analyses": {
        body: [{ category: "/language:actions", error: "extraction failed" }],
      },
    });
    assertFails(result, 4, /\/language:actions: extraction failed/);
  });

  for (const [name, rule] of [
    ["a critical", { security_severity_level: "critical", severity: "error" }],
    ["a high", { security_severity_level: "high", severity: "warning" }],
    ["an error", { severity: "error" }],
  ] as const) {
    it(`fails on ${name} alert`, async () => {
      const result = await run({
        "code-scanning/alerts": { body: [alert(7, rule)] },
      });
      assertFails(
        result,
        4,
        /open CodeQL alerts .*https:\/\/github\.com\/o\/r\/security\/code-scanning\/7 /,
      );
    });
  }

  it("passes with alerts below High that aren't errors", async () => {
    const result = await run({
      "code-scanning/alerts": {
        body: [
          alert(1, { security_severity_level: "medium", severity: "warning" }),
          alert(2, { security_severity_level: "low", severity: "note" }),
          alert(3, { severity: "warning" }),
        ],
      },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Check 4 passed/);
  });

  it("says which permission is missing when the alerts can't be read", async () => {
    const result = await run({
      "code-scanning/alerts": {
        exit: 1,
        stderr: "Resource not accessible by integration (HTTP 403)",
      },
    });
    assertFails(result, 4, /needs security-events: read/);
  });
});
