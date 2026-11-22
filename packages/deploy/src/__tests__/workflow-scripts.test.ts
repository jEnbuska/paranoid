// Checks how the workflows and actions call the deploy scripts, the same way
// for every provider, so a renamed script or mode can't leave a workflow
// calling one that no longer exists: every `bash deploy/….sh` they run is a
// file, and every delete-servers.sh call uses one of its modes from "The same
// deploy on every provider" in docs/deploy/README.md: all, finished, or run
// with an ID.
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../../../", import.meta.url).pathname;

/** The workflow and action files, by their path from the root */
function workflowFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.ya?ml$/.test(entry.name)) files.push(path);
    }
  };
  walk(".github/workflows");
  walk(".github/actions");
  return files;
}

type Call = { file: string; line: number; script: string; args: string };

/** Every `bash deploy/<…>.sh <args>` in the workflow and action files */
function scriptCalls(): Call[] {
  const calls: Call[] = [];
  for (const file of workflowFiles()) {
    readFileSync(join(root, file), "utf8")
      .split("\n")
      .forEach((text, index) => {
        for (const match of text.matchAll(
          /\bbash\s+(deploy\/[\w./-]+\.sh)\b([^\n|;&]*)/g,
        )) {
          calls.push({
            file,
            line: index + 1,
            script: match[1],
            args: match[2].trim(),
          });
        }
      });
  }
  return calls;
}

const calls = scriptCalls();

describe("the deploy scripts the workflows run", () => {
  it("finds the deploy workflows' calls", () => {
    expect(
      calls.some((call) => call.script.endsWith("/delete-servers.sh")),
    ).toBe(true);
  });

  it.each(calls.map((call) => [`${call.file}:${call.line}`, call] as const))(
    "%s runs a script that exists",
    (_, call) => {
      expect(existsSync(join(root, call.script)), call.script).toBe(true);
    },
  );

  const deletes = calls.filter((call) =>
    call.script.endsWith("/delete-servers.sh"),
  );
  it.each(deletes.map((call) => [`${call.file}:${call.line}`, call] as const))(
    "%s runs delete-servers.sh with all, finished or run <id>",
    (_, call) => {
      expect(call.args).toMatch(/^(all|finished|run\s+\S+)$/);
    },
  );
});
