// Checks every provider's preflight list, deploy/<provider>/requirements.json,
// the same way, so a new provider is covered without a test of its own: the
// lists are written alike, and the preflight passes with everything set,
// names each required item that's missing and each value that breaks its
// pattern. preflight-cli.test.ts tests the CLI that runs it, and
// requirements.test.ts the format. How a list agrees with its guide and its
// workflows, its `step` links included, is scripts/check-deploy-docs.mts's.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EnvironmentSettings, Problem } from "../preflight.ts";
import preflight from "../preflight.ts";
import type { Rule } from "../requirements.ts";
import requirements from "../requirements.ts";

const root = new URL("../../../../", import.meta.url).pathname;

type Json = Record<string, unknown>;

function readJson(path: string): Json {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as Json;
}

const shared = requirements(
  "deploy/requirements.json",
  readJson("deploy/requirements.json"),
  { shared: true },
);

const providers = readdirSync(join(root, "deploy"))
  .filter((name) => existsSync(join(root, "deploy", name, "requirements.json")))
  .sort();

/**
 * A value each secret accepts, since a secret has no example. Low in entropy
 * and shorter than a real token where the format allows it, so the secret
 * scan doesn't take them for real ones. A provider with a secret adds it here.
 */
const FAKE_SECRETS: Record<string, string> = {
  HCLOUD_TOKEN: "q".repeat(32) + "r".repeat(32),
  UPCLOUD_TOKEN: "ucat_qqqqrrrr",
};

/** A value no pattern accepts: a semicolon and a line break */
const WRONG = "wrong;\nvalue";

/** The order of the keys in every list, at each level */
const ORDER = {
  file: ["$schema", "guide", "environments", "variables"],
  environment: ["reviewers", "step", "variables", "secrets"],
  rule: [
    "required",
    "pattern",
    "minimum",
    "maximum",
    "example",
    "environments",
    "step",
  ],
};

function expectOrder(where: string, value: Json, order: string[]) {
  const keys = Object.keys(value);
  expect(keys, where).toEqual(order.filter((key) => keys.includes(key)));
}

/** Every rule in a list's JSON, with where it is */
function rules(json: Json): [string, Json][] {
  const environments = (json.environments ?? {}) as Record<string, Json>;
  return [
    ...Object.entries(environments).flatMap(([name, environment]) =>
      ["variables", "secrets"].flatMap((kind) =>
        Object.entries((environment[kind] ?? {}) as Record<string, Json>).map(
          ([rule, json]): [string, Json] => [`${name}.${kind}.${rule}`, json],
        ),
      ),
    ),
    ...Object.entries((json.variables ?? {}) as Record<string, Json>).map(
      ([rule, json]): [string, Json] => [`variables.${rule}`, json],
    ),
  ];
}

describe("deploy/requirements.json", () => {
  it("is written in the same order as the providers' lists", () => {
    const json = readJson("deploy/requirements.json");
    expectOrder("deploy/requirements.json", json, ORDER.file);
    for (const [where, rule] of rules(json)) {
      expectOrder(where, rule, ORDER.rule);
    }
  });
});

it("finds every provider's list", () => {
  expect(providers.length).toBeGreaterThan(0);
});

it("gives every provider a prefix of its own", () => {
  const prefixes = providers.map((provider) => {
    const json = readJson(`deploy/${provider}/requirements.json`);
    return rules(json)[0]?.[0].split(".").at(-1)?.split("_")[0];
  });
  expect(new Set(prefixes).size).toBe(providers.length);
});

describe.each(providers)("deploy/%s/requirements.json", (provider) => {
  const path = `deploy/${provider}/requirements.json`;
  const json = readJson(path);
  const list = requirements(path, json, { shared: false });
  const cleanup = `${provider}-cleanup`;

  /** Each environment as it should be set up */
  const setUp = new Map<string, EnvironmentSettings | null>(
    [...list.environments].map(([name, { reviewers }]) => [
      name,
      {
        branches: ["branch main"],
        reviewers: reviewers === "required" ? 1 : 0,
      },
    ]),
  );

  /** A valid value for everything a job in the environment may read. A
   * value can differ between the environments, such as the role each one
   * signs in as. */
  function valid(environment: string): Record<string, string> {
    const own = list.environments.get(environment)!;
    return Object.fromEntries([
      ...[...shared.variables, ...list.variables, ...own.variables].map(
        ([name, rule]) => [name, rule.example ?? ""],
      ),
      ...[...own.secrets.keys()].map((name) => [
        name,
        FAKE_SECRETS[name] ?? "",
      ]),
    ]);
  }

  type Job = { title: string; environment: string; inEnvironment: boolean };

  /** The deploy's preflight job, outside its environment, and each
   * environment's own job */
  const jobs: Job[] = [
    {
      title: `the job before ${provider}'s approval`,
      environment: provider,
      inEnvironment: false,
    },
    ...[...list.environments.keys()].map((environment) => ({
      title: `${environment}'s job`,
      environment,
      inEnvironment: true,
    })),
  ];

  function run(
    { environment, inEnvironment }: Job,
    values: Record<string, string | undefined>,
    environments = setUp,
  ): Problem[] {
    const own = list.environments.get(environment)!;
    const seen = [
      ...shared.variables.keys(),
      ...list.variables.keys(),
      ...(inEnvironment ? own.variables.keys() : []),
    ];
    return preflight(
      shared,
      list,
      { environment, inEnvironment, ownerOnly: false },
      {
        actors: [],
        environments,
        variables: Object.fromEntries(
          seen.flatMap((name) =>
            values[name] === undefined ? [] : [[name, values[name]]],
          ),
        ),
        secrets: inEnvironment
          ? new Map([...own.secrets.keys()].map((name) => [name, values[name]]))
          : null,
      },
    );
  }

  type Item = {
    kind: "variable" | "secret";
    name: string;
    rule: Rule;
    /** Where the preflight says it is, as in its messages */
    where: string;
  };

  /** What a job checks: the repository variables its environment reads,
   * and, in the environment, its own variables and secrets */
  function items({ environment, inEnvironment }: Job): Item[] {
    const own = list.environments.get(environment)!;
    const here = ` in the environment ${environment}`;
    return [
      ...[...list.variables]
        .filter(([, rule]) => rule.environments?.includes(environment) ?? true)
        .map(([name, rule]): Item => ({
          kind: "variable",
          name,
          rule,
          where: " in the repository",
        })),
      ...(inEnvironment
        ? [
            ...[...own.variables].map(([name, rule]): Item => ({
              kind: "variable",
              name,
              rule,
              where: here,
            })),
            ...[...own.secrets].map(([name, rule]): Item => ({
              kind: "secret",
              name,
              rule,
              where: here,
            })),
          ]
        : []),
    ];
  }

  describe("is written like every provider's list", () => {
    it("names its schema and its guide", () => {
      expect(json.$schema).toBe("../requirements.schema.json");
      expect(list.guide).toBe(`docs/deploy/${provider}.md`);
    });

    it(`has the environments ${provider}, with required reviewers, and ${cleanup}, without`, () => {
      expect(
        [...list.environments].map(([name, { reviewers }]) => [
          name,
          reviewers,
        ]),
      ).toEqual([
        [provider, "required"],
        [cleanup, "none"],
      ]);
    });

    it("puts its keys in the same order", () => {
      expectOrder(path, json, ORDER.file);
      for (const [name, environment] of Object.entries(
        json.environments as Record<string, Json>,
      )) {
        expectOrder(name, environment, ORDER.environment);
      }
      for (const [where, rule] of rules(json)) {
        expectOrder(where, rule, ORDER.rule);
      }
    });

    it("gives every value a pattern, and every variable an example", () => {
      for (const [where, rule] of rules(json)) {
        expect(rule.pattern, `${where}.pattern`).toBeTypeOf("string");
        if (!where.includes(".secrets.")) {
          expect(rule.example, `${where}.example`).toBeTypeOf("string");
        }
      }
    });

    it("has a fake value in this test for each secret", () => {
      for (const [where, rule] of rules(json)) {
        if (!where.includes(".secrets.")) continue;
        const name = where.split(".").at(-1)!;
        expect(
          FAKE_SECRETS,
          `add a fake ${name} to FAKE_SECRETS`,
        ).toHaveProperty(name);
        expect(
          new RegExp(rule.pattern as string, "u").test(FAKE_SECRETS[name]!),
        ).toBe(true);
      }
    });

    it("starts every name with the provider's prefix", () => {
      const names = rules(json).map(([where]) => where.split(".").at(-1)!);
      const prefix = `${names[0]?.split("_")[0]}_`;
      for (const name of names) expect(name).toMatch(new RegExp(`^${prefix}`));
    });

    const prices = `deploy/${provider}/prices.json`;
    // Comes with the provider's deploy, which can land after its list.
    it.skipIf(!existsSync(join(root, prices)))(
      "lists exactly the price file's regions, where it lists them",
      () => {
        const regions = Object.keys(readJson(prices).regions as Json).sort();
        for (const [name, rule] of list.variables) {
          const choices = rule.pattern?.source.match(/^\^\(([^()]+)\)\$$/)?.[1];
          if (!choices || !regions.includes(rule.example ?? "")) continue;
          expect(choices.split("|").sort(), name).toEqual(regions);
        }
      },
    );
  });

  describe.each(jobs)("$title", (job) => {
    const values = valid(job.environment);

    it("passes with everything set", () => {
      expect(run(job, values)).toEqual([]);
    });

    it("passes with only the required values set", () => {
      const required = Object.fromEntries(
        items(job)
          .filter(({ rule }) => rule.required)
          .map(({ name }) => [name, values[name]]),
      );
      const secrets = items(job).filter(({ kind }) => kind === "secret");
      for (const { name } of secrets) required[name] ??= "";
      expect(run(job, required)).toEqual([]);
    });

    for (const name of list.environments.keys()) {
      it(`fails naming the environment ${name} when it's missing`, () => {
        const environments = new Map(setUp);
        environments.set(name, null);
        expect(run(job, values, environments)).toEqual([
          {
            message: `The environment ${name} doesn't exist.`,
            fix: `${list.guide}${list.environments.get(name)!.step}`,
          },
        ]);
      });
    }

    for (const { kind, name, rule, where } of items(job)) {
      const fix = `${list.guide}${rule.step}`;

      if (rule.required) {
        it(`fails naming ${name} when it isn't set`, () => {
          expect(
            run(job, { ...values, [name]: kind === "secret" ? "" : undefined }),
          ).toEqual([
            { message: `The ${kind} ${name} isn't set${where}.`, fix },
          ]);
        });
      }

      it(`fails naming ${name} when it doesn't match its pattern`, () => {
        expect(rule.pattern?.test(WRONG)).toBe(false);
        const problems = run(job, { ...values, [name]: WRONG });
        expect(problems).toEqual([
          {
            message:
              kind === "secret"
                ? `The secret ${name}${where} doesn't match ${rule.pattern?.source}. Copy it again, whole.`
                : `The variable ${name}${where} is ${JSON.stringify(WRONG)}, ` +
                  `which doesn't match ${rule.pattern?.source}. ` +
                  `For example: ${JSON.stringify(rule.example)}.`,
            fix,
          },
        ]);
      });
    }

    const unread = [...list.variables].filter(
      ([, rule]) =>
        rule.environments && !rule.environments.includes(job.environment),
    );
    if (unread.length > 0) {
      it(`leaves ${unread.map(([name]) => name).join(", ")} to the jobs that read it`, () => {
        const wrong = { ...values };
        for (const [name] of unread) wrong[name] = WRONG;
        expect(run(job, wrong)).toEqual([]);
      });
    }
  });
});
