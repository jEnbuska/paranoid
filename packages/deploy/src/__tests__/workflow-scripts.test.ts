// Checks how the workflows and actions call the deploy scripts, the same way
// for every provider, so a renamed script or mode can't leave a workflow
// calling one that no longer exists: every `bash deploy/….sh` they run is a
// file, and every delete-servers.sh call uses a mode that deploy/ci's
// delete-mode.sh accepts: all, finished, or run with one ID. That a provider
// uses the shared pieces at all is checked by scripts/check-deploy-docs.mts,
// and what each piece does by ci-scripts.test.ts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
const where = (call: Call) => [`${call.file}:${call.line}`, call] as const;

describe("the deploy scripts the workflows run", () => {
  it("finds the calls, such as start-cleanup-on-main's", () => {
    expect(calls).toContainEqual(
      expect.objectContaining({
        file: ".github/actions/start-cleanup-on-main/action.yml",
        script: "deploy/ci/start-cleanup.sh",
      }),
    );
  });

  it.each(calls.map(where))("%s runs a script that exists", (_, call) => {
    expect(existsSync(join(root, call.script)), call.script).toBe(true);
  });

  const deletes = calls.filter((call) =>
    call.script.endsWith("/delete-servers.sh"),
  );
  // None on dev until a provider's workflows merge
  if (deletes.length > 0) {
    it.each(deletes.map(where))(
      "%s runs delete-servers.sh with all, finished or run <id>",
      (_, call) => {
        expect(call.args).toMatch(/^(all|finished|run\s+\S+)$/);
      },
    );
  }
});
