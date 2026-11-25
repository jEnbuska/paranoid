// Tests the provider-neutral scripts in deploy/ci that every provider's
// deploy, stop and cleanup share: shared-settings.sh, delete-mode.sh,
// write-summary.sh and start-cleanup.sh. Each runs in bash, as on the
// runner, with only the environment the test gives it.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../../../../", import.meta.url).pathname;
const ci = join(root, "deploy/ci");
const dir = mkdtempSync(join(tmpdir(), "deploy-ci-"));

type Result = {
  status: number | null;
  stdout: string;
  stderr: string;
  /** What the script wrote to GITHUB_ENV or GITHUB_STEP_SUMMARY */
  written: string;
};

/** Runs a bash script with only PATH, HOME and the given environment */
function bash(
  script: string,
  args: string[] = [],
  env: Record<string, string> = {},
): Result {
  const written = join(dir, `out-${Math.random()}`);
  writeFileSync(written, "");
  const result = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    env: {
      PATH: env.PATH ?? process.env.PATH ?? "",
      HOME: dir,
      GITHUB_ENV: written,
      GITHUB_STEP_SUMMARY: written,
      ...env,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    written: readFileSync(written, "utf8"),
  };
}

/** A script in the temporary folder, as a provider's script would be */
function script(name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
  return path;
}

describe("shared-settings.sh", () => {
  // As a provider's settings.sh uses it
  const settings = script(
    "settings.sh",
    `. "${ci}/shared-settings.sh"
shared_settings
[[ $ZONE =~ ^[a-z]{2}-[a-z]{3}[0-9]$ ]] || fail "ZONE must be a zone, not '$ZONE'."
to_env ZONE "$ZONE"
settings_line "zone: $ZONE"`,
  );
  const good = {
    MAX_INVITES: "5",
    LIFETIME_MINUTES: "60",
    MAX_EGRESS_MBIT: "2",
    MAX_DEPLOY_COST_USD: "1",
    RUN_ID: "12345678901",
    ZONE: "fi-hel1",
  };

  it("passes the checked settings on and logs them", () => {
    const result = bash(settings, [], good);
    expect(result.status).toBe(0);
    expect(result.written).toBe(
      [
        "MAX_INVITES=5",
        "LIFETIME_MINUTES=60",
        "MAX_EGRESS_MBIT=2",
        "MAX_DEPLOY_COST_USD=1",
        "RUN_ID=12345678901",
        "ZONE=fi-hel1",
        "",
      ].join("\n"),
    );
    expect(result.stdout).toBe(
      "Invites: 5, lifetime: 60 min, outbound limit: 2 Mbit/s, cost limit: $1, zone: fi-hel1\n",
    );
  });

  it("reads whole numbers in decimal, without their leading zeros", () => {
    const result = bash(settings, [], {
      ...good,
      MAX_INVITES: "010",
      LIFETIME_MINUTES: "0090",
      MAX_EGRESS_MBIT: "08",
    });
    expect(result.status).toBe(0);
    expect(result.written).toContain("MAX_INVITES=10\n");
    expect(result.written).toContain("LIFETIME_MINUTES=90\n");
    expect(result.written).toContain("MAX_EGRESS_MBIT=8\n");
  });

  it.each([
    ["MAX_INVITES", "0", "MAX_INVITES (or the max_invites input) must be"],
    ["MAX_INVITES", "10001", "from 1 to 10000"],
    ["MAX_INVITES", "five", "not 'five'"],
    ["MAX_INVITES", "", "not ''"],
    ["LIFETIME_MINUTES", "1441", "from 1 to 1440"],
    ["LIFETIME_MINUTES", "-1", "LIFETIME_MINUTES (or the lifetime_minutes"],
    ["MAX_EGRESS_MBIT", "51", "MAX_EGRESS_MBIT must be a whole number from 1"],
    ["MAX_EGRESS_MBIT", "1.5", "not '1.5'"],
    ["MAX_DEPLOY_COST_USD", "10000", "MAX_DEPLOY_COST_USD must be an amount"],
    ["MAX_DEPLOY_COST_USD", "2.505", "not '2.505'"],
    ["MAX_DEPLOY_COST_USD", "$1", "not '$1'"],
    ["RUN_ID", "12a", "The run ID isn't a number"],
    ["RUN_ID", "1 2", "The run ID isn't a number"],
    ["ZONE", "fi-hel1;", "ZONE must be a zone"],
  ])("refuses %s=%j", (name, value, message) => {
    const result = bash(settings, [], { ...good, [name]: value });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("::error::");
    expect(result.stdout).toContain(message);
    // Nothing after the bad value is passed on
    expect(result.written).not.toContain("ZONE=");
  });

  it("refuses a value with a line break, and escapes it in the error", () => {
    const result = bash(settings, [], {
      ...good,
      MAX_DEPLOY_COST_USD: "1\nNODE_OPTIONS=--require=/tmp/x",
    });
    expect(result.status).toBe(1);
    expect(result.written).not.toContain("NODE_OPTIONS");
    // One annotation, which a value can't end to start another command
    expect(result.stdout.trimEnd().split("\n")).toHaveLength(1);
    expect(result.stdout).toContain("not '1%0ANODE_OPTIONS=--require=/tmp/x'");
  });

  it("escapes % and carriage returns in an error", () => {
    const result = bash(settings, [], { ...good, MAX_INVITES: "5%\r" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("not '5%25%0D'");
  });

  it("needs every shared value", () => {
    const { RUN_ID: _, ...withoutRunId } = good;
    const result = bash(settings, [], withoutRunId);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("RUN_ID");
  });

  describe("to_env", () => {
    const toEnv = script(
      "to-env.sh",
      `. "${ci}/shared-settings.sh"
to_env "$1" "$2"`,
    );

    it("writes a name and a value", () => {
      const result = bash(toEnv, ["ZONE", "fi-hel1"]);
      expect(result.status).toBe(0);
      expect(result.written).toBe("ZONE=fi-hel1\n");
    });

    it.each([["zone"], ["ZONE=X"], ["ZONE<<EOF"], ["1ZONE"], [""]])(
      "refuses the name %j",
      (name) => {
        const result = bash(toEnv, [name, "x"]);
        expect(result.status).toBe(1);
        expect(result.stdout).toContain("isn't a name for GITHUB_ENV");
        expect(result.written).toBe("");
      },
    );

    it.each([["a\nB=1"], ["a\rB=1"], ["\n"]])(
      "refuses the value %j",
      (value) => {
        const result = bash(toEnv, ["ZONE", value]);
        expect(result.status).toBe(1);
        expect(result.stdout).toContain("ZONE holds a line break");
        expect(result.written).toBe("");
      },
    );
  });

  it("checks amounts with amount", () => {
    const amount = script(
      "amount.sh",
      `. "${ci}/shared-settings.sh"
amount GCP_MONTHLY_BUDGET_USD "$1"
echo ok`,
    );
    expect(bash(amount, ["2.50"]).stdout).toBe("ok\n");
    expect(bash(amount, ["9999.99"]).stdout).toBe("ok\n");
    const result = bash(amount, ["2,50"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "::error::GCP_MONTHLY_BUDGET_USD must be an amount in US dollars",
    );
  });
});

describe("delete-mode.sh", () => {
  const deleteServers = (pattern: string) =>
    script(
      `delete-servers-${Math.random()}.sh`,
      `. "${ci}/delete-mode.sh"
delete_mode '${pattern}' "$@"
echo "mode=$mode run=$run"`,
    );
  const numeric = deleteServers("[0-9]+");
  const attempt = deleteServers("[0-9]+-[0-9]+");

  it.each([
    [["all"], "mode=all run="],
    [["finished"], "mode=finished run="],
    [["run", "123"], "mode=run run=123"],
  ])("reads %j", (args, parsed) => {
    const result = bash(numeric, args);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${parsed}\n`);
  });

  it("takes the provider's pattern for the run ID", () => {
    expect(bash(attempt, ["run", "123-2"]).stdout).toBe("mode=run run=123-2\n");
    expect(bash(attempt, ["run", "123"]).status).toBe(2);
    expect(bash(numeric, ["run", "123-2"]).status).toBe(2);
  });

  it.each([
    [[]],
    [["expired"]],
    [["ALL"]],
    [["run"]],
    [["run", ""]],
    [["run", "12a"]],
    [["run", "a12"]],
    [["run", "12\n34"]],
    [["run", "12 34"]],
    [["run", "1", "2"]],
    [["all", "extra"]],
    [["finished", ""]],
  ])("refuses %j with the usage", (args) => {
    const result = bash(numeric, args);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Usage: ");
    expect(result.stderr).toContain("all | finished | run <run id>");
  });
});

describe("write-summary.sh", () => {
  const summary = join(ci, "write-summary.sh");
  const args = {
    "--url": "https://1-2-3-4.sslip.io",
    "--expires": "1795000000",
    "--invites": "5",
    "--size": "cx23",
    "--region": "nbg1",
    "--cost": "0.0946",
    "--deleted-by":
      "The Clean up Hetzner workflow deletes it within about an hour of shutting down, and Stop Hetzner deletes it right away.",
  };
  const argv = (values: Record<string, string>, ...extra: string[]) => [
    ...Object.entries(values).flat(),
    ...extra,
  ];

  it("writes the summary", () => {
    const result = bash(summary, argv(args));
    expect(result.status).toBe(0);
    expect(result.written).toBe(
      [
        "## Paranoid is running",
        "",
        "**<https://1-2-3-4.sslip.io>**",
        "",
        "- It shuts down once 5 invites are finished, or at 2026-11-18 11:06 UTC at the latest. Chats that have started keep working after that.",
        "- Size: cx23, in nbg1. The Clean up Hetzner workflow deletes it within about an hour of shutting down, and Stop Hetzner deletes it right away.",
        "- The most it can cost is $0.0946, before tax.",
        "",
      ].join("\n"),
    );
  });

  it("adds the provider's extra lines after the cost", () => {
    const result = bash(
      summary,
      argv(
        { ...args, "--size": "e2-micro", "--region": "europe-north1-b" },
        "--extra",
        "$3.81 of this month's $5 Google Cloud limit is left for other deployments.",
        "--extra",
        "A second line.",
      ),
    );
    expect(result.status).toBe(0);
    expect(result.written).toContain("- Size: e2-micro, in europe-north1-b.");
    expect(result.written).toMatch(
      /before tax\.\n- \$3\.81 of this month's \$5 Google Cloud limit is left for other deployments\.\n- A second line\.\n$/,
    );
  });

  it.each([
    ["--url", "http://1-2-3-4.sslip.io", "The URL isn't"],
    ["--url", "https://x.sslip.io/path", "The URL isn't"],
    ["--url", "https://x.sslip.io>**<a", "The URL isn't"],
    ["--expires", "soon", "The shutdown time isn't"],
    ["--invites", "0", "The invites aren't"],
    ["--size", "cx23 [x](y)", "The size isn't"],
    ["--size", "Standard_B2ats_v2\n<b>", "The size isn't"],
    ["--region", "NBG1", "The region isn't"],
    ["--cost", "", "The cost isn't"],
    ["--cost", "1e3", "The cost isn't"],
    ["--deleted-by", "", "The --deleted-by sentence must be"],
    ["--deleted-by", "See [this](https://example.com).", "The --deleted-by"],
    ["--deleted-by", "Two\nlines.", "The --deleted-by"],
    ["--deleted-by", "<script>", "The --deleted-by"],
    ["--deleted-by", "Long. ".repeat(67), "The --deleted-by"],
  ])("refuses %s %j", (name, value, message) => {
    const result = bash(summary, argv({ ...args, [name]: value }));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`::error::${message}`);
    expect(result.written).toBe("");
  });

  it("refuses an extra line that isn't plain text", () => {
    const result = bash(summary, argv(args, "--extra", "`code`"));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("::error::Each --extra line must be");
    expect(result.written).toBe("");
  });

  it.each([[["--colour", "red"]], [["--url"]]])(
    "refuses %j with the usage",
    (extra) => {
      const result = bash(summary, argv(args, ...extra));
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("Usage: ");
    },
  );

  it("needs every value", () => {
    const { "--cost": _, ...withoutCost } = args;
    const result = bash(summary, argv(withoutCost));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("::error::The cost isn't");
  });
});

describe("start-cleanup.sh", () => {
  const start = join(ci, "start-cleanup.sh");
  // A gh that logs its arguments, and answers `gh api` with each path's
  // status from FAKE_GH: "<path> <status>" lines, 200 when not listed
  const bin = mkdtempSync(join(tmpdir(), "deploy-ci-bin-"));
  const log = join(bin, "log");
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env bash
echo "gh $*" >>"${log}"
if [ "$1" = api ]; then
  while read -r path status; do
    if [ "$path" = "$2" ] && [ "$status" != 200 ]; then
      echo "gh: Not Found (HTTP $status)" >&2
      exit 1
    fi
  done <<<"$FAKE_GH"
fi`,
  );
  chmodSync(join(bin, "gh"), 0o755);

  const env = (
    statuses: string[] = [],
    changes: Record<string, string> = {},
  ) => ({
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    GH_TOKEN: "not-a-token",
    REPO: "someone/paranoid",
    PROVIDER: "upcloud",
    WORKFLOW: "cleanup-upcloud.yml",
    FAKE_GH: statuses.join("\n"),
    ...changes,
  });
  const run = (
    statuses: string[] = [],
    changes: Record<string, string> = {},
  ) => {
    writeFileSync(log, "");
    const result = bash(start, [], env(statuses, changes));
    return { ...result, calls: readFileSync(log, "utf8") };
  };
  const environment = "repos/someone/paranoid/environments/upcloud-cleanup";
  const onMain =
    "repos/someone/paranoid/contents/.github/workflows/cleanup-upcloud.yml?ref=main";

  it("starts the workflow on main", () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.calls).toBe(
      [
        `gh api ${environment} --silent`,
        `gh api ${onMain} --silent`,
        "gh workflow run cleanup-upcloud.yml --repo someone/paranoid --ref main",
        "",
      ].join("\n"),
    );
    expect(result.stdout).toContain("Started the cleanup on main.");
  });

  it("starts nothing without the environment", () => {
    const result = run([`${environment} 404`]);
    expect(result.status).toBe(0);
    expect(result.calls).not.toContain("workflow run");
    expect(result.stdout).toContain(
      "There's no upcloud-cleanup environment, so there's nothing to clean up with. See docs/deploy/upcloud.md.",
    );
  });

  it("starts nothing before the workflow is on main", () => {
    const result = run([`${onMain} 404`]);
    expect(result.status).toBe(0);
    expect(result.calls).not.toContain("workflow run");
    expect(result.stdout).toContain(
      "cleanup-upcloud.yml isn't on main yet, and neither is deploy-upcloud.yml",
    );
  });

  it("fails on any other error, so a cleanup that can't start shows", () => {
    const result = run([`${environment} 403`]);
    expect(result.status).toBe(1);
    expect(result.calls).not.toContain("workflow run");
    expect(result.stdout).toContain("::error::gh: Not Found (HTTP 403)");
  });

  it.each([
    [{ PROVIDER: "Upcloud" }, "The provider must be"],
    [{ PROVIDER: "up/cloud" }, "The provider must be"],
    [{ WORKFLOW: "deploy-upcloud.yml" }, "must be cleanup-upcloud.yml"],
    [{ WORKFLOW: "cleanup-hetzner.yml" }, "must be cleanup-upcloud.yml"],
    [{ REPO: "someone/paranoid/x" }, "Unexpected repository name"],
  ])("refuses %j before calling gh", (changes, message) => {
    const result = run([], changes);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(message);
    expect(result.calls).toBe("");
  });
});
