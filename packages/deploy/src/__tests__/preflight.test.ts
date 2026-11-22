import type { Observed, Options } from "../preflight.ts";
import preflight from "../preflight.ts";
import requirements from "../requirements.ts";

const shared = requirements(
  "shared",
  {
    guide: "docs/deploy/README.md",
    variables: {
      MAX_INVITES: {
        pattern: "^[0-9]{1,6}$",
        minimum: 1,
        maximum: 10000,
        step: "#shared",
      },
    },
  },
  { shared: true },
);

const provider = requirements(
  "provider",
  {
    guide: "docs/deploy/test.md",
    environments: {
      test: {
        reviewers: "required",
        step: "#4-environments",
        secrets: {
          TEST_TOKEN: {
            required: true,
            pattern: "^tok_[a-z0-9]{8}$",
            step: "#3-token",
          },
        },
        variables: {
          TEST_ZONE: { pattern: "^[a-z]{2}-[a-z]+[0-9]$", step: "#6-optional" },
        },
      },
      "test-cleanup": { reviewers: "none", step: "#4-environments" },
    },
    variables: {
      TEST_ROLE: {
        required: true,
        pattern: "^role/[a-z-]+$",
        environments: ["test"],
        step: "#5-connect",
      },
      TEST_REGION: { required: true, pattern: "^[a-z]+$", step: "#5-connect" },
    },
  },
  { shared: false },
);

const FAKE = "tok_qqqqrrrr";

function observed(change: Partial<Observed> = {}): Observed {
  return {
    actors: [{ login: "owner", permission: "admin" }],
    environments: new Map([
      ["test", { branches: ["branch main"], reviewers: 1 }],
      ["test-cleanup", { branches: ["branch main"], reviewers: 0 }],
    ]),
    variables: { TEST_ROLE: "role/deploy", TEST_REGION: "north" },
    secrets: new Map([["TEST_TOKEN", FAKE]]),
    ...change,
  };
}

const deploy: Options = {
  environment: "test",
  inEnvironment: true,
  ownerOnly: true,
};

function messages(options: Options, change: Partial<Observed> = {}) {
  return preflight(shared, provider, options, observed(change)).map(
    ({ message }) => message,
  );
}

describe("preflight", () => {
  it("passes when everything is set up", () => {
    expect(messages(deploy)).toEqual([]);
  });

  it("names a missing variable and its guide step", () => {
    const problems = preflight(
      shared,
      provider,
      deploy,
      observed({ variables: { TEST_REGION: "north" } }),
    );
    expect(problems).toEqual([
      {
        message: "The variable TEST_ROLE isn't set in the repository.",
        fix: "docs/deploy/test.md#5-connect",
      },
    ]);
  });

  it("checks a repository variable only for the environments that read it", () => {
    expect(
      messages(
        { ...deploy, environment: "test-cleanup", ownerOnly: false },
        { variables: { TEST_REGION: "north" } },
      ),
    ).toEqual([]);
  });

  it("names a variable that doesn't match its pattern, with its value", () => {
    expect(
      messages(deploy, {
        variables: {
          TEST_ROLE: "role/deploy",
          TEST_REGION: "north",
          TEST_ZONE: "Helsinki",
        },
      }),
    ).toEqual([
      'The variable TEST_ZONE in the environment test is "Helsinki", which doesn\'t match ^[a-z]{2}-[a-z]+[0-9]$.',
    ]);
  });

  it("quotes a variable's line breaks, so it can't start a workflow command", () => {
    const [message] = messages(deploy, {
      variables: {
        TEST_ROLE: "role/deploy",
        TEST_REGION: "north\n::add-mask::x",
      },
    });
    expect(message).not.toContain("\n");
    expect(message).toContain(String.raw`"north\n::add-mask::x"`);
  });

  it("checks a shared variable when it's set, and only then", () => {
    expect(messages(deploy, { variables: observed().variables })).toEqual([]);
    expect(
      messages(deploy, {
        variables: { ...observed().variables, MAX_INVITES: "0" },
      }),
    ).toEqual([
      'The variable MAX_INVITES is "0", which isn\'t from 1 to 10000.',
    ]);
  });

  it("names a missing environment", () => {
    const environments = observed().environments;
    environments.set("test-cleanup", null);
    expect(messages(deploy, { environments })).toEqual([
      "The environment test-cleanup doesn't exist.",
    ]);
  });

  it("names an environment that any branch may use", () => {
    const environments = observed().environments;
    environments.set("test", { branches: "all", reviewers: 1 });
    environments.set("test-cleanup", {
      branches: ["branch main", "branch dev"],
      reviewers: 0,
    });
    expect(messages(deploy, { environments })).toEqual([
      "The environment test can be used from every branch. Limit it to the main branch only.",
      "The environment test-cleanup can be used from branch main, branch dev. Limit it to the main branch only.",
    ]);
  });

  it("names a deploy environment without a reviewer", () => {
    const environments = observed().environments;
    environments.set("test", { branches: ["branch main"], reviewers: 0 });
    expect(messages(deploy, { environments })).toEqual([
      "The environment test has no required reviewers. Add yourself, so every run waits for your approval.",
    ]);
  });

  it("names a cleanup environment with a reviewer", () => {
    const environments = observed().environments;
    environments.set("test-cleanup", {
      branches: ["branch main"],
      reviewers: 1,
    });
    expect(messages(deploy, { environments })).toEqual([
      "The environment test-cleanup has required reviewers, so scheduled runs would wait for an approval that nobody gives. Remove them.",
    ]);
  });

  it("refuses a run by someone without admin permission", () => {
    expect(
      messages(deploy, {
        actors: [
          { login: "owner", permission: "admin" },
          { login: "helper", permission: "write" },
        ],
      }),
    ).toEqual([
      "helper started this run, but only someone with admin permission on the repository may (helper has write permission).",
    ]);
  });

  it("doesn't check who started a cleanup", () => {
    expect(
      messages(
        { environment: "test-cleanup", inEnvironment: true, ownerOnly: false },
        { actors: [{ login: "github-actions[bot]", permission: "none" }] },
      ),
    ).toEqual([]);
  });

  it("names a missing or malformed secret without any part of its value", () => {
    expect(
      messages(deploy, { secrets: new Map([["TEST_TOKEN", ""]]) }),
    ).toEqual(["The secret TEST_TOKEN isn't set in the environment test."]);
    const wrong = "tok_qqqqrrrr trailing";
    const problems = messages(deploy, {
      secrets: new Map([["TEST_TOKEN", wrong]]),
    });
    expect(problems).toEqual([
      "The secret TEST_TOKEN in the environment test doesn't match ^tok_[a-z0-9]{8}$. Copy it again, whole.",
    ]);
    for (const part of ["qqqq", "rrrr", "trailing", String(wrong.length)]) {
      expect(problems.join(" ")).not.toContain(part);
    }
  });

  it("names a secret the workflow doesn't pass to the preflight", () => {
    expect(messages(deploy, { secrets: new Map() })).toEqual([
      "The workflow doesn't pass the secret TEST_TOKEN to the preflight. Add TEST_TOKEN: ${{ secrets.TEST_TOKEN }} to the preflight step's env.",
    ]);
  });

  it("skips the environment's own settings outside the environment", () => {
    expect(
      messages(
        { ...deploy, inEnvironment: false },
        {
          secrets: null,
          variables: { ...observed().variables, TEST_ZONE: "x" },
        },
      ),
    ).toEqual([]);
  });

  it("lists every problem at once", () => {
    expect(
      messages(deploy, {
        actors: [{ login: "someone", permission: "read" }],
        environments: new Map(),
        variables: {},
        secrets: new Map([["TEST_TOKEN", ""]]),
      }),
    ).toHaveLength(6);
  });

  it("refuses an environment that isn't in the list", () => {
    expect(messages({ ...deploy, environment: "prod" })).toEqual([
      "The workflow runs the preflight for the environment prod, which isn't in the provider's requirements.json (test, test-cleanup).",
    ]);
  });
});
